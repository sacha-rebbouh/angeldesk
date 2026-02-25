export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

interface PageProps {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<{ popout?: string }>;
}

async function getDeal(dealId: string, userId: string) {
  return prisma.deal.findFirst({
    where: { id: dealId, userId },
    select: { id: true, name: true },
  });
}

async function getActiveSession(dealId: string, userId: string) {
  return prisma.liveSession.findFirst({
    where: {
      dealId,
      userId,
      status: { in: ["created", "bot_joining", "live", "processing"] },
    },
    include: { coachingCards: true, summary: true },
    orderBy: { createdAt: "desc" },
  });
}

async function getSessionHistory(dealId: string, userId: string) {
  return prisma.liveSession.findMany({
    where: {
      dealId,
      userId,
      status: { in: ["completed", "failed"] },
    },
    include: { summary: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  created: { label: "Créée", variant: "secondary" },
  bot_joining: { label: "Bot en cours...", variant: "secondary" },
  live: { label: "En direct", variant: "default" },
  processing: { label: "Traitement...", variant: "secondary" },
  completed: { label: "Terminée", variant: "outline" },
  failed: { label: "Échouée", variant: "destructive" },
};

export default async function LiveCoachingPage({ params, searchParams }: PageProps) {
  const user = await requireAuth();
  const { dealId } = await params;
  const { popout } = await searchParams;

  const isPopout = popout === "true";

  // Non-popout access: redirect to the deal page Live tab
  if (!isPopout) {
    redirect(`/deals/${dealId}?tab=live`);
  }

  const deal = await getDeal(dealId, user.id);

  if (!deal) {
    notFound();
  }

  const [activeSession, sessions] = await Promise.all([
    getActiveSession(dealId, user.id),
    getSessionHistory(dealId, user.id),
  ]);

  const statusInfo = activeSession
    ? STATUS_LABELS[activeSession.status] ?? { label: activeSession.status, variant: "secondary" as const }
    : null;

  const content = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Live Coaching</h2>
          <p className="text-sm text-muted-foreground">
            Coaching IA en temps réel pendant vos calls
          </p>
        </div>
        {activeSession && statusInfo && (
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        )}
      </div>

      {activeSession ? (
        <div
          data-deal-id={deal.id}
          data-deal-name={deal.name}
          data-session-id={activeSession.id}
          data-session-status={activeSession.status}
        >
          {(activeSession.status === "created" || activeSession.status === "bot_joining") && (
            <div className="rounded-lg border p-8 text-center">
              <div className="animate-pulse mb-3">
                <div className="mx-auto h-8 w-8 rounded-full bg-muted-foreground/20" />
              </div>
              <h3 className="text-lg font-medium mb-1">En attente du bot...</h3>
              <p className="text-sm text-muted-foreground">
                Le bot rejoint votre réunion. Cela peut prendre quelques secondes.
              </p>
            </div>
          )}

          {activeSession.status === "live" && (
            <div className="rounded-lg border p-8 text-center">
              <div className="mx-auto mb-3 h-3 w-3 rounded-full bg-green-500 animate-pulse" />
              <h3 className="text-lg font-medium mb-1">Session en cours</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Composant coaching feed à venir
              </p>
            </div>
          )}

          {activeSession.status === "processing" && (
            <div className="rounded-lg border p-8 text-center">
              <div className="animate-spin mx-auto mb-3 h-6 w-6 border-2 border-muted-foreground/30 border-t-foreground rounded-full" />
              <h3 className="text-lg font-medium mb-1">Génération du rapport...</h3>
              <p className="text-sm text-muted-foreground">
                Analyse de la transcription et génération du rapport post-call.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border p-8 text-center">
          <h3 className="text-lg font-medium mb-1">Lancer une session</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Composant launcher à venir
          </p>
        </div>
      )}

      {sessions.length > 0 && (
        <div>
          <h3 className="text-lg font-medium mb-3">Sessions précédentes</h3>
          <div className="space-y-2">
            {sessions.map((session) => {
              const info = STATUS_LABELS[session.status] ?? {
                label: session.status,
                variant: "secondary" as const,
              };
              return (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant={info.variant}>{info.label}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {session.createdAt.toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {session.summary && (
                    <span className="text-xs text-muted-foreground">
                      Rapport disponible
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-6">
      {content}
    </div>
  );
}
