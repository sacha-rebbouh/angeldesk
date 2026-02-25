"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import * as Ably from "ably";
import { AblyProvider, ChannelProvider } from "ably/react";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface LiveAblyProviderProps {
  sessionId: string;
  children: ReactNode;
}

type ConnectionStatus = "initialized" | "connecting" | "connected" | "disconnected" | "suspended" | "closing" | "closed" | "failed";

// =============================================================================
// Connection Status Indicator
// =============================================================================

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { color: string; label: string; pulse: boolean }
> = {
  initialized: {
    color: "bg-gray-400",
    label: "Initialisation...",
    pulse: false,
  },
  connecting: {
    color: "bg-yellow-400",
    label: "Connexion...",
    pulse: true,
  },
  connected: {
    color: "bg-green-500",
    label: "Connecté",
    pulse: false,
  },
  disconnected: {
    color: "bg-red-500",
    label: "Déconnecté",
    pulse: false,
  },
  suspended: {
    color: "bg-red-500",
    label: "Suspendu",
    pulse: false,
  },
  closing: {
    color: "bg-yellow-400",
    label: "Fermeture...",
    pulse: true,
  },
  closed: {
    color: "bg-gray-400",
    label: "Fermé",
    pulse: false,
  },
  failed: {
    color: "bg-red-600",
    label: "Erreur de connexion",
    pulse: false,
  },
};

function ConnectionStatusIndicator({ status }: { status: ConnectionStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.disconnected;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div
        className={cn(
          "h-2 w-2 rounded-full",
          config.color,
          config.pulse && "animate-pulse"
        )}
        aria-label={config.label}
      />
      <span>{config.label}</span>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export default function LiveAblyProvider({
  sessionId,
  children,
}: LiveAblyProviderProps) {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("initialized");
  const [isReady, setIsReady] = useState(false);
  const clientRef = useRef<Ably.Realtime | null>(null);

  // Stable authCallback using sessionId ref to avoid recreating the client
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const createClient = useCallback(() => {
    const client = new Ably.Realtime({
      authCallback: async (_tokenParams, callback) => {
        try {
          const res = await fetch(
            `/api/coaching/ably-token?sessionId=${sessionIdRef.current}`
          );
          if (!res.ok) {
            const errData = await res
              .json()
              .catch(() => ({ error: "Token fetch failed" }));
            callback(
              errData.error ?? "Impossible d'obtenir le token Ably",
              null
            );
            return;
          }
          const { data } = await res.json();
          callback(null, data);
        } catch (err) {
          callback(
            err instanceof Error ? err.message : "Ably auth error",
            null
          );
        }
      },
    });

    return client;
  }, []);

  useEffect(() => {
    const client = createClient();
    clientRef.current = client;

    const handleStateChange = (stateChange: Ably.ConnectionStateChange) => {
      const state = stateChange.current as ConnectionStatus;
      setConnectionStatus(state);

      if (state === "connected") {
        setIsReady(true);
      }
    };

    client.connection.on(handleStateChange);

    // Set initial status
    setConnectionStatus(client.connection.state as ConnectionStatus);
    if (client.connection.state === "connected") {
      setIsReady(true);
    }

    return () => {
      client.connection.off(handleStateChange);
      client.close();
      clientRef.current = null;
      setIsReady(false);
    };
  }, [createClient]);

  const channelName = `live-session:${sessionId}`;

  // Error state — offer retry instead of infinite spinner
  if (connectionStatus === "failed" || connectionStatus === "closed") {
    return (
      <div className="space-y-3">
        <ConnectionStatusIndicator status={connectionStatus} />
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-6 text-center">
          <p className="text-sm text-red-800 dark:text-red-200 mb-3">
            Connexion au flux temps réel échouée
          </p>
          <button
            type="button"
            onClick={() => {
              // Close existing client and recreate
              if (clientRef.current) {
                clientRef.current.close();
                clientRef.current = null;
              }
              const newClient = createClient();
              clientRef.current = newClient;
              setIsReady(false);
              setConnectionStatus("connecting");

              const handleStateChange = (stateChange: Ably.ConnectionStateChange) => {
                const state = stateChange.current as ConnectionStatus;
                setConnectionStatus(state);
                if (state === "connected") {
                  setIsReady(true);
                }
              };

              newClient.connection.on(handleStateChange);
            }}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // Show status while connecting
  if (!isReady || !clientRef.current) {
    return (
      <div className="space-y-3">
        <ConnectionStatusIndicator status={connectionStatus} />
        <div className="rounded-lg border p-6 text-center">
          <div className="animate-pulse mb-2">
            <div className="mx-auto h-6 w-6 rounded-full bg-muted-foreground/20" />
          </div>
          <p className="text-sm text-muted-foreground">
            Connexion au flux temps réel...
          </p>
        </div>
      </div>
    );
  }

  return (
    <AblyProvider client={clientRef.current}>
      <ChannelProvider channelName={channelName}>
        <div className="space-y-2">
          <ConnectionStatusIndicator status={connectionStatus} />
          {children}
        </div>
      </ChannelProvider>
    </AblyProvider>
  );
}
