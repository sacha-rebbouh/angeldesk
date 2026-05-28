import { AlertCircle } from "lucide-react";

type EmptyAgentCardProps = {
  agentLabel: string;
  reason: "failed" | "missing" | "not_activated";
  errorMessage?: string;
};

const REASON_COPY: Record<EmptyAgentCardProps["reason"], { title: string; description: string }> = {
  failed: {
    title: "Analyse non disponible",
    description: "L'agent n'a pas pu produire de résultat exploitable lors de cette analyse.",
  },
  missing: {
    title: "Analyse non exécutée",
    description: "Cet agent n'a pas été déclenché sur ce dossier.",
  },
  not_activated: {
    title: "Lentille spécialisée non activée",
    description:
      "Aucun expert sectoriel n'a été activé sur ce dossier (secteur non détecté ou hors couverture).",
  },
};

export function EmptyAgentCard({ agentLabel, reason, errorMessage }: EmptyAgentCardProps) {
  const copy = REASON_COPY[reason];
  return (
    <article
      className="flex flex-col gap-3 rounded-xl p-4"
      style={{ background: "var(--av-surface-muted)", border: "1px dashed var(--av-line-strong)" }}
    >
      <div className="flex items-center gap-2">
        <AlertCircle size={16} className="text-[var(--av-muted)]" aria-hidden="true" />
        <h4 className="text-[14px] font-semibold text-[var(--av-ink)]">{agentLabel}</h4>
      </div>
      <div>
        <p className="text-[13px] font-medium text-[var(--av-ink)]">{copy.title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--av-muted)]">{copy.description}</p>
      </div>
      {errorMessage ? (
        <p className="rounded-md bg-white/60 px-2 py-1.5 text-[11px] font-mono leading-snug text-[var(--av-muted)]">
          {errorMessage}
        </p>
      ) : null}
    </article>
  );
}
