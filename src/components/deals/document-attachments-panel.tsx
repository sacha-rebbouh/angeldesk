"use client";

import { memo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Link2, Loader2, Paperclip, Plus, Sparkles, UserPen, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { clerkFetch } from "@/lib/clerk-fetch";
import { queryKeys } from "@/lib/query-keys";

/**
 * Phase B7 — attachment relations panel.
 *
 *   B7.1: read-only surface for auto + human ATTACHMENT_RELATION.
 *   B7.2: link (POST) + unlink (DELETE). Auto signals are
 *     suppressed (not deleted) when the user unlinks them —
 *     preserves the auto trace; the panel's GET filters
 *     suppressed targets out via the server-side suppression
 *     scan, so the user sees the relation disappear immediately
 *     after the mutation.
 *
 * Provenance distinction:
 *   - `auto` entries: produced by attachment-linker (Sparkles
 *     icon, badge "Auto"). The "Délier" action creates a
 *     suppression on the server.
 *   - `human` entries: produced by manual link (UserPen icon,
 *     badge "Manuel"). The "Délier" action deletes the row.
 *
 * The "Lier à un email" picker lists candidate EMAIL docs from
 * the same deal (returned by the GET endpoint's `candidateEmails`
 * field, so no extra round-trip).
 */
interface AttachmentRelationEntry {
  signalId: string;
  relatedDocumentId: string;
  relatedDocumentName: string;
  relatedDocumentType: string;
  attachmentName: string | null;
  matchMethod: "exact" | "normalized" | "manual" | "unknown";
  matchScore: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  emailSourceDate: string | null;
  reportedAt: string | null;
  createdAt: string;
  provenance: "auto" | "human";
}

interface CandidateEmail {
  id: string;
  name: string;
  sourceDate: string | null;
}

interface AttachmentsPayload {
  data: {
    documentId: string;
    sourceKind: "FILE" | "EMAIL" | "NOTE";
    inbound: AttachmentRelationEntry[];
    outbound: AttachmentRelationEntry[];
    candidateEmails: CandidateEmail[];
  };
}

interface DocumentAttachmentsPanelProps {
  documentId: string;
  enabled: boolean;
}

async function fetchAttachments(documentId: string): Promise<AttachmentsPayload> {
  const response = await clerkFetch(`/api/documents/${documentId}/attachments`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Attachments fetch HTTP ${response.status}`);
  }
  return response.json() as Promise<AttachmentsPayload>;
}

async function createManualLink(
  documentId: string,
  emailDocumentId: string
): Promise<void> {
  const response = await clerkFetch(`/api/documents/${documentId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailDocumentId }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Link HTTP ${response.status}`);
  }
}

async function unlinkSignal(documentId: string, signalId: string): Promise<{ action: "deleted" | "suppressed" }> {
  const response = await clerkFetch(`/api/documents/${documentId}/attachments`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signalId }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Unlink HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { data: { action: "deleted" | "suppressed" } };
  return payload.data;
}

function formatMatchMethod(method: "exact" | "normalized" | "manual" | "unknown"): string {
  switch (method) {
    case "exact":
      return "Exact";
    case "normalized":
      return "Normalisé";
    case "manual":
      return "Manuel";
    default:
      return "—";
  }
}

function confidenceBadgeClass(confidence: "HIGH" | "MEDIUM" | "LOW"): string {
  switch (confidence) {
    case "HIGH":
      return "bg-emerald-100 text-emerald-800";
    case "MEDIUM":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatReportedAt(iso: string | null): string {
  if (!iso) return "Date inconnue";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date invalide";
  return date.toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "2-digit" });
}

function AttachmentEntryRow({
  entry,
  side,
  onUnlink,
  unlinkingSignalId,
}: {
  entry: AttachmentRelationEntry;
  side: "inbound" | "outbound";
  onUnlink: (signalId: string) => void;
  unlinkingSignalId: string | null;
}) {
  const SideIcon = side === "inbound" ? Link2 : Paperclip;
  const ProvenanceIcon = entry.provenance === "auto" ? Sparkles : UserPen;
  const isUnlinking = unlinkingSignalId === entry.signalId;
  return (
    <li className="flex flex-col gap-1 rounded-md border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <SideIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span
          className="min-w-0 flex-1 truncate font-medium"
          title={entry.relatedDocumentName}
        >
          {entry.relatedDocumentName}
        </span>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {entry.relatedDocumentType}
        </Badge>
        <Badge
          variant="outline"
          className="flex items-center gap-1 text-[10px] uppercase tracking-wide"
          title={entry.provenance === "auto" ? "Détecté automatiquement" : "Lien créé manuellement"}
        >
          <ProvenanceIcon className="h-3 w-3" aria-hidden="true" />
          {entry.provenance === "auto" ? "Auto" : "Manuel"}
        </Badge>
        <Badge className={`${confidenceBadgeClass(entry.confidence)} text-[10px] uppercase tracking-wide`}>
          {entry.confidence}
        </Badge>
        {/* B7.2 — per-entry unlink. The button confirms via toast,
            then dispatches the mutation. Server picks safe-delete vs
            suppression based on the signal's scopeKey. */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          aria-label={`Délier ${entry.relatedDocumentName}`}
          title="Délier cette relation"
          disabled={isUnlinking}
          onClick={() => onUnlink(entry.signalId)}
        >
          {isUnlinking ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <X className="h-3 w-3" aria-hidden="true" />
          )}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {entry.attachmentName && (
          <span title="Nom de fichier de la pièce jointe dans l'email">
            <span className="font-medium text-foreground">Fichier :</span> {entry.attachmentName}
          </span>
        )}
        <span title="Méthode de matching utilisée par le linker">
          <span className="font-medium text-foreground">Match :</span> {formatMatchMethod(entry.matchMethod)}
          {entry.matchScore !== null && ` (${Math.round(entry.matchScore * 100)}%)`}
        </span>
        <span>
          <span className="font-medium text-foreground">Transmis :</span> {formatReportedAt(entry.reportedAt)}
        </span>
      </div>
    </li>
  );
}

function ManualLinkPicker({
  documentId,
  candidateEmails,
  disabled,
  onSuccess,
}: {
  documentId: string;
  candidateEmails: CandidateEmail[];
  disabled: boolean;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedEmailId, setSelectedEmailId] = useState<string>("");
  const linkMutation = useMutation({
    mutationFn: (emailId: string) => createManualLink(documentId, emailId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.documentAttachments.byDocument(documentId),
      });
      toast.success("Lien email créé");
      setSelectedEmailId("");
      onSuccess();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Impossible de créer le lien"
      );
    },
  });

  if (candidateEmails.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Aucun email disponible pour créer un lien dans ce deal.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 space-y-1">
        <label
          htmlFor="manual-link-email-picker"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Lier à un email
        </label>
        <Select
          value={selectedEmailId}
          onValueChange={setSelectedEmailId}
          disabled={disabled || linkMutation.isPending}
        >
          <SelectTrigger id="manual-link-email-picker" aria-label="Choisir un email à lier">
            <SelectValue placeholder="Choisir un email…" />
          </SelectTrigger>
          <SelectContent>
            {candidateEmails.map((email) => (
              <SelectItem key={email.id} value={email.id}>
                {email.name}
                {email.sourceDate ? ` — ${formatReportedAt(email.sourceDate)}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={!selectedEmailId || disabled || linkMutation.isPending}
        onClick={() => {
          if (selectedEmailId) linkMutation.mutate(selectedEmailId);
        }}
      >
        {linkMutation.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        Lier
      </Button>
    </div>
  );
}

export const DocumentAttachmentsPanel = memo(function DocumentAttachmentsPanel({
  documentId,
  enabled,
}: DocumentAttachmentsPanelProps) {
  const queryClient = useQueryClient();
  const [unlinkingSignalId, setUnlinkingSignalId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.documentAttachments.byDocument(documentId),
    queryFn: () => fetchAttachments(documentId),
    enabled: enabled && Boolean(documentId),
    staleTime: 60_000,
  });

  const unlinkMutation = useMutation({
    mutationFn: (signalId: string) => unlinkSignal(documentId, signalId),
    onMutate: (signalId) => {
      setUnlinkingSignalId(signalId);
    },
    onSettled: () => {
      setUnlinkingSignalId(null);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.documentAttachments.byDocument(documentId),
      });
      toast.success(
        result.action === "deleted"
          ? "Lien manuel supprimé"
          : "Relation auto masquée (trace préservée)"
      );
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error ? mutationError.message : "Impossible de délier"
      );
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
      >
        Impossible de charger les pièces jointes : {error instanceof Error ? error.message : "erreur inconnue"}
      </div>
    );
  }

  if (!data) return null;
  const { inbound, outbound, candidateEmails } = data.data;

  function handleUnlink(signalId: string) {
    unlinkMutation.mutate(signalId);
  }

  const showEmptyState = inbound.length === 0 && outbound.length === 0;

  return (
    <div className="space-y-4">
      {outbound.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Paperclip className="h-4 w-4" aria-hidden="true" />
            Pièces jointes détectées
            <span className="text-xs font-normal text-muted-foreground">({outbound.length})</span>
          </h3>
          <ul className="space-y-2">
            {outbound.map((entry) => (
              <AttachmentEntryRow
                key={entry.signalId}
                entry={entry}
                side="outbound"
                onUnlink={handleUnlink}
                unlinkingSignalId={unlinkingSignalId}
              />
            ))}
          </ul>
        </section>
      )}

      {inbound.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4" aria-hidden="true" />
            Attaché à
            <span className="text-xs font-normal text-muted-foreground">({inbound.length})</span>
          </h3>
          <ul className="space-y-2">
            {inbound.map((entry) => (
              <AttachmentEntryRow
                key={entry.signalId}
                entry={entry}
                side="inbound"
                onUnlink={handleUnlink}
                unlinkingSignalId={unlinkingSignalId}
              />
            ))}
          </ul>
        </section>
      )}

      {showEmptyState && (
        <div className="rounded-md border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          Aucune pièce jointe détectée pour ce document.
          {data.data.sourceKind !== "EMAIL" && (
            <p className="mt-1 text-xs">
              Les relations email ↔ document sont créées automatiquement quand le document est
              classé comme email. Vous pouvez aussi créer un lien manuel ci-dessous.
            </p>
          )}
        </div>
      )}

      {/* B7.2 — Manual link picker. Rendered for ANY doc that has
          candidate emails in the same deal (i.e. the deal has at
          least one EMAIL doc other than this one). The mutation
          posts to the same endpoint as B7.1's GET; the server's
          400 guards (self-link, cross-deal, non-EMAIL target)
          catch user mistakes. */}
      <section className="space-y-2 border-t pt-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Correction manuelle
        </h3>
        <ManualLinkPicker
          documentId={documentId}
          candidateEmails={candidateEmails}
          disabled={Boolean(unlinkingSignalId)}
          onSuccess={() => {
            /* invalidation done inside the mutation */
          }}
        />
      </section>

      <p className="text-[11px] text-muted-foreground">
        <ExternalLink className="mr-1 inline-block h-3 w-3 align-text-bottom" aria-hidden="true" />
        Les relations automatiques restent en base (audit) même quand vous les déliez ;
        elles deviennent simplement invisibles dans cette vue.
      </p>
    </div>
  );
});
