"use client";

import {
  memo,
  useReducer,
  useCallback,
  useRef,
  useEffect,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useChannel } from "ably/react";
import type { Message } from "ably";
import { ExternalLink, Radio, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AblyCoachingCardEvent,
  AblyCardAddressedEvent,
} from "@/lib/live/types";
import { CoachingCard } from "./coaching-card";

// Lazy-load AnalysisQuestionsTab (heavy component with its own data fetching)
const AnalysisQuestionsTab = dynamic(() => import("./analysis-questions-tab"), {
  loading: () => (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Reducer — active / addressed card state
// ---------------------------------------------------------------------------

type CardState = {
  active: AblyCoachingCardEvent[];
  addressed: AblyCoachingCardEvent[];
};

type CardAction =
  | { type: "ADD_CARD"; card: AblyCoachingCardEvent }
  | { type: "ADDRESS_CARD"; cardId: string }
  | { type: "INIT"; cards: AblyCoachingCardEvent[] }
  | { type: "MERGE"; cards: AblyCoachingCardEvent[] };

function cardReducer(state: CardState, action: CardAction): CardState {
  switch (action.type) {
    case "ADD_CARD": {
      // Prevent duplicates (idempotent on reconnect)
      if (
        state.active.some((c) => c.id === action.card.id) ||
        state.addressed.some((c) => c.id === action.card.id)
      ) {
        return state;
      }
      return {
        ...state,
        active: [action.card, ...state.active],
      };
    }
    case "ADDRESS_CARD": {
      const card = state.active.find((c) => c.id === action.cardId);
      if (!card) return state;
      return {
        active: state.active.filter((c) => c.id !== action.cardId),
        addressed: [{ ...card, status: "addressed" as const }, ...state.addressed].slice(0, 20),
      };
    }
    case "INIT": {
      const active: AblyCoachingCardEvent[] = [];
      const addressed: AblyCoachingCardEvent[] = [];
      for (const card of action.cards) {
        if (card.status === "addressed" || card.status === "dismissed") {
          addressed.push(card);
        } else {
          active.push(card);
        }
      }
      // Newest first
      active.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      addressed.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return { active, addressed };
    }
    case "MERGE": {
      // Merge new cards without resetting existing state (prevents flickering from polling)
      const existingIds = new Set([
        ...state.active.map((c) => c.id),
        ...state.addressed.map((c) => c.id),
      ]);

      let changed = false;
      const newActive = [...state.active];
      const newAddressed = [...state.addressed];

      for (const card of action.cards) {
        if (existingIds.has(card.id)) {
          // Update status if card was addressed server-side but still active locally
          if (
            (card.status === "addressed" || card.status === "dismissed") &&
            state.active.some((c) => c.id === card.id)
          ) {
            const idx = newActive.findIndex((c) => c.id === card.id);
            if (idx !== -1) {
              const [moved] = newActive.splice(idx, 1);
              newAddressed.unshift({ ...moved, status: "addressed" as const });
              changed = true;
            }
          }
          continue;
        }
        // New card not in local state
        if (card.status === "addressed" || card.status === "dismissed") {
          newAddressed.push(card);
        } else {
          newActive.unshift(card);
        }
        changed = true;
      }

      if (!changed) return state;

      newActive.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      newAddressed.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return { active: newActive, addressed: newAddressed.slice(0, 20) };
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type TabId = "coaching" | "questions";

// ---------------------------------------------------------------------------
// CoachingFeed
// ---------------------------------------------------------------------------

interface CoachingFeedProps {
  sessionId: string;
  dealId?: string;
  initialCards?: AblyCoachingCardEvent[];
}

export const CoachingFeed = memo(function CoachingFeed({
  sessionId,
  dealId: dealIdProp,
  initialCards,
}: CoachingFeedProps) {
  const params = useParams<{ dealId: string }>();
  const dealId = dealIdProp ?? params.dealId;

  // ---- State ----
  const [state, dispatch] = useReducer(
    cardReducer,
    { active: [], addressed: [] },
    () => {
      if (initialCards && initialCards.length > 0) {
        return cardReducer(
          { active: [], addressed: [] },
          { type: "INIT", cards: initialCards }
        );
      }
      return { active: [], addressed: [] };
    }
  );

  const [activeTab, setActiveTab] = useState<TabId>("coaching");

  // ---- Auto-scroll management ----
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userHasScrolledRef = useRef(false);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // If user scrolled more than 60px from top, mark as "scrolled away"
    userHasScrolledRef.current = el.scrollTop > 60;
  }, []);

  // Scroll to top on new active card
  const prevActiveCountRef = useRef(state.active.length);
  useEffect(() => {
    if (state.active.length > prevActiveCountRef.current) {
      if (!userHasScrolledRef.current && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
    prevActiveCountRef.current = state.active.length;
  }, [state.active.length]);

  // ---- Reconnect: merge new cards from polling without resetting state ----
  const initialCardsIdsRef = useRef<string>("");
  useEffect(() => {
    if (!initialCards || initialCards.length === 0) return;
    const newIds = initialCards.map((c) => c.id).sort().join(",");
    if (newIds !== initialCardsIdsRef.current) {
      initialCardsIdsRef.current = newIds;
      dispatch({ type: "MERGE", cards: initialCards });
    }
  }, [initialCards]);

  // ---- Ably subscriptions ----
  const handleCoachingCard = useCallback(
    (message: Message) => {
      if (!message.data) return;
      dispatch({
        type: "ADD_CARD",
        card: message.data as AblyCoachingCardEvent,
      });
    },
    []
  );

  const handleCardAddressed = useCallback(
    (message: Message) => {
      if (!message.data) return;
      const event = message.data as AblyCardAddressedEvent;
      dispatch({ type: "ADDRESS_CARD", cardId: event.cardId });
    },
    []
  );

  useChannel(`live-session:${sessionId}`, "coaching-card", handleCoachingCard);
  useChannel(
    `live-session:${sessionId}`,
    "card-addressed",
    handleCardAddressed
  );

  // ---- Pop-out handler ----
  const handlePopout = useCallback(() => {
    window.open(
      `/deals/${dealId}/live?popout=true`,
      "angeldesk-coaching",
      "width=400,height=700,menubar=no,toolbar=no,location=no,status=no"
    );
  }, [dealId]);

  // ---- Tab handlers ----
  const setCoachingTab = useCallback(() => setActiveTab("coaching"), []);
  const setQuestionsTab = useCallback(() => setActiveTab("questions"), []);

  // ---- Render ----
  const totalCards = state.active.length + state.addressed.length;

  return (
    <div className="flex h-full flex-col">
      {/* Header with tabs + pop-out */}
      <div className="flex items-center border-b px-3 py-2">
        <div role="tablist" className="flex gap-1">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "coaching"}
            onClick={setCoachingTab}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "coaching"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            Coaching
            {state.active.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                {state.active.length}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "questions"}
            onClick={setQuestionsTab}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "questions"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            Questions analyse
          </button>
        </div>

        <button
          type="button"
          onClick={handlePopout}
          className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Ouvrir dans une fenêtre séparée"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tab content */}
      <div role="tabpanel" className="flex-1 flex flex-col overflow-hidden">
      {activeTab === "coaching" ? (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-3 py-2 space-y-2"
          aria-live="polite"
          role="log"
          aria-label="Fil de coaching en temps réel"
        >
          {/* Empty state */}
          {totalCards === 0 && <EmptyState />}

          {/* Active cards */}
          {state.active.map((card) => (
            <CoachingCard key={card.id} card={card} />
          ))}

          {/* Divider */}
          {state.addressed.length > 0 && state.active.length > 0 && (
            <div className="flex items-center gap-2 py-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] text-muted-foreground/60 select-none">
                Abordés
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}

          {/* Addressed-only: show divider even without active cards */}
          {state.addressed.length > 0 && state.active.length === 0 && totalCards > 0 && (
            <div className="flex items-center gap-2 py-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] text-muted-foreground/60 select-none">
                Abordés
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}

          {/* Addressed cards */}
          {state.addressed.map((card) => (
            <CoachingCard key={card.id} card={card} isAddressed />
          ))}
        </div>
      ) : (
        <AnalysisQuestionsTab dealId={dealId} />
      )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Empty state — pulse animation while waiting for cards
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative">
        <Radio className="h-8 w-8 text-muted-foreground/40" />
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-orange-400 animate-pulse" />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        En attente des suggestions...
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground/50">
        Les cartes de coaching apparaîtront ici en temps réel
      </p>
    </div>
  );
}

