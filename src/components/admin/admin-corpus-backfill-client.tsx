"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  Play,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CorpusBackfillCandidate {
  id: string;
  name: string;
  companyName: string | null;
  sector: string | null;
  stage: string | null;
  userId: string | null;
  documentCount: number;
  processedDocumentCount: number;
  corpusSnapshotId: string | null;
  status: string | null;
  eligible: boolean;
  reasons: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

interface CorpusBackfillPreview {
  candidates: CorpusBackfillCandidate[];
  total: number;
  eligibleCount: number;
  existingSnapshotCount: number;
  missingDocumentsCount: number;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asString).filter((item): item is string => Boolean(item));
  }
  const single = asString(value);
  return single ? [single] : [];
}

function normalizeCandidate(rawValue: unknown): CorpusBackfillCandidate | null {
  const raw = asRecord(rawValue);
  if (!raw) return null;

  const id = asString(raw.id) ?? asString(raw.dealId);
  if (!id) return null;

  const companyName = asString(raw.companyName);
  const name =
    asString(raw.name) ??
    asString(raw.dealName) ??
    companyName ??
    `Deal ${id.slice(0, 8)}...`;

  const documentCount =
    asNumber(raw.documentCount) ??
    asNumber(raw.documentsCount) ??
    asNumber(raw.totalDocumentCount) ??
    0;
  const processedDocumentCount =
    asNumber(raw.processedDocumentCount) ??
    asNumber(raw.completedDocumentCount) ??
    asNumber(raw.readyDocumentCount) ??
    documentCount;
  const corpusSnapshotId =
    asString(raw.corpusSnapshotId) ??
    asString(raw.latestCorpusSnapshotId) ??
    asString(raw.existingCorpusSnapshotId);

  const explicitEligible = asBoolean(raw.eligible) ?? asBoolean(raw.canBackfill);
  const reasons = [
    ...asStringArray(raw.reasons),
    ...asStringArray(raw.reason),
    ...asStringArray(raw.blockers),
    ...asStringArray(raw.warning),
  ];

  return {
    id,
    name,
    companyName,
    sector: asString(raw.sector),
    stage: asString(raw.stage),
    userId: asString(raw.userId),
    documentCount,
    processedDocumentCount,
    corpusSnapshotId,
    status: asString(raw.status) ?? asString(raw.state) ?? asString(raw.backfillStatus),
    eligible: explicitEligible ?? (processedDocumentCount > 0 && !corpusSnapshotId),
    reasons,
    createdAt: asString(raw.createdAt),
    updatedAt: asString(raw.updatedAt),
  };
}

function normalizePreviewResponse(payload: unknown): CorpusBackfillPreview {
  const root = asRecord(payload) ?? {};
  const data = asRecord(root.data) ?? root;

  const rawCandidates =
    (Array.isArray(data.candidates) && data.candidates) ||
    (Array.isArray(data.deals) && data.deals) ||
    (Array.isArray(data.items) && data.items) ||
    (Array.isArray(data.rows) && data.rows) ||
    [];

  const candidates = rawCandidates
    .map((candidate) => normalizeCandidate(candidate))
    .filter((candidate): candidate is CorpusBackfillCandidate => Boolean(candidate));

  const total = asNumber(data.total) ?? asNumber(data.count) ?? candidates.length;
  const eligibleCount = asNumber(data.eligibleCount) ?? candidates.filter((candidate) => candidate.eligible).length;
  const existingSnapshotCount =
    asNumber(data.existingSnapshotCount) ??
    asNumber(data.backfilledCount) ??
    candidates.filter((candidate) => Boolean(candidate.corpusSnapshotId)).length;
  const missingDocumentsCount =
    asNumber(data.missingDocumentsCount) ??
    candidates.filter((candidate) => candidate.processedDocumentCount === 0).length;

  return {
    candidates,
    total,
    eligibleCount,
    existingSnapshotCount,
    missingDocumentsCount,
  };
}

function formatRelativeDate(value: string | null): string {
  if (!value) return "date inconnue";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date inconnue";
  return formatDistanceToNow(date, { locale: fr, addSuffix: true });
}

async function fetchPreview(): Promise<CorpusBackfillPreview> {
  const response = await fetch("/api/admin/corpus/backfill", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (asRecord(error)?.error as string | undefined) ?? `Preview corpus backfill failed (${response.status})`
    );
  }

  return normalizePreviewResponse(await response.json());
}

async function launchBackfillBatch(params: { dealIds: string[]; limit: number }) {
  const response = await fetch("/api/admin/corpus/backfill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dealIds: params.dealIds,
      limit: params.limit,
      dryRun: false,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (asRecord(error)?.error as string | undefined) ?? `Corpus backfill failed (${response.status})`
    );
  }

  return response.json().catch(() => ({}));
}

function buildLaunchSuccessMessage(payload: unknown, fallbackCount: number): string {
  const data = asRecord(asRecord(payload)?.data) ?? asRecord(payload) ?? {};
  const queuedCount =
    asNumber(data.queuedCount) ??
    asNumber(data.triggeredCount) ??
    asNumber(data.processedCount) ??
    asNumber(data.launchedCount) ??
    asNumber(data.count) ??
    fallbackCount;
  const skippedCount = asNumber(data.skippedCount) ?? 0;
  const batchId = asString(data.batchId) ?? asString(data.jobId) ?? asString(data.runId);

  const message = `${queuedCount} deal${queuedCount > 1 ? "s" : ""} envoyé${queuedCount > 1 ? "s" : ""}`;
  const skipped = skippedCount > 0 ? `, ${skippedCount} ignoré${skippedCount > 1 ? "s" : ""}` : "";
  const suffix = batchId ? ` · batch ${batchId.slice(0, 8)}...` : "";
  return `${message}${skipped}${suffix}`;
}

function StatCard({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <Card className={cn("bg-card", muted && "opacity-80")}>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

export function AdminCorpusBackfillClient() {
  const [preview, setPreview] = useState<CorpusBackfillPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [search, setSearch] = useState("");
  const [batchSize, setBatchSize] = useState("25");
  const [launchedIds, setLaunchedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      setError(null);
      const nextPreview = await fetchPreview();
      setPreview(nextPreview);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Erreur inconnue";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const filteredCandidates = useMemo(() => {
    const candidates = preview?.candidates ?? [];
    const query = search.trim().toLowerCase();

    if (!query) return candidates;

    return candidates.filter((candidate) =>
      [
        candidate.name,
        candidate.companyName,
        candidate.sector,
        candidate.stage,
        candidate.userId,
        candidate.id,
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [preview, search]);

  const launchableCandidates = useMemo(
    () => filteredCandidates.filter((candidate) => candidate.eligible && !candidate.corpusSnapshotId && !launchedIds.has(candidate.id)),
    [filteredCandidates, launchedIds]
  );

  const parsedBatchSize = Math.max(1, Number.parseInt(batchSize, 10) || 25);

  async function handleLaunchBatch() {
    const targetIds = launchableCandidates.slice(0, parsedBatchSize).map((candidate) => candidate.id);

    if (targetIds.length === 0) {
      toast.info("Aucun deal eligible dans la preview actuelle.");
      return;
    }

    const confirmed = window.confirm(
      `Lancer le backfill corpus pour ${targetIds.length} deal${targetIds.length > 1 ? "s" : ""} ?`
    );
    if (!confirmed) return;

    setLaunching(true);

    try {
      const payload = await launchBackfillBatch({
        dealIds: targetIds,
        limit: parsedBatchSize,
      });

      setLaunchedIds((current) => {
        const next = new Set(current);
        for (const dealId of targetIds) next.add(dealId);
        return next;
      });

      toast.success(buildLaunchSuccessMessage(payload, targetIds.length));
      await loadPreview(true);
    } catch (launchError) {
      toast.error(launchError instanceof Error ? launchError.message : "Erreur inconnue");
    } finally {
      setLaunching(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Chargement de la preview corpus...
      </div>
    );
  }

  if (error && !preview) {
    return (
      <div className="rounded-lg border border-dashed p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
          <div className="space-y-3">
            <div>
              <div className="font-medium">Preview indisponible</div>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadPreview()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Réessayer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const total = preview?.total ?? 0;
  const eligibleCount = preview?.eligibleCount ?? 0;
  const existingSnapshotCount = preview?.existingSnapshotCount ?? 0;
  const missingDocumentsCount = preview?.missingDocumentsCount ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Candidats" value={total} />
        <StatCard label="Eligibles" value={eligibleCount} />
        <StatCard label="Déjà snapshot" value={existingSnapshotCount} muted />
        <StatCard label="Sans docs prêts" value={missingDocumentsCount} muted />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher par deal, société, secteur, user..."
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            step={1}
            value={batchSize}
            onChange={(event) => setBatchSize(event.target.value)}
            className="w-24"
            aria-label="Taille du batch"
          />
          <Button variant="outline" size="sm" onClick={() => void loadPreview(true)} disabled={refreshing || launching}>
            {refreshing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Rafraîchir
          </Button>
          <Button
            size="sm"
            onClick={handleLaunchBatch}
            disabled={launching || launchableCandidates.length === 0}
          >
            {launching ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-3.5 w-3.5" />
            )}
            Lancer batch ({Math.min(parsedBatchSize, launchableCandidates.length)})
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      {filteredCandidates.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
          <p className="font-medium">Aucun candidat dans cette preview.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajuste la recherche ou relance la preview pour voir les deals à backfill.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCandidates.map((candidate) => {
            const isLaunched = launchedIds.has(candidate.id);
            const hasProcessedDocs = candidate.processedDocumentCount > 0;

            return (
              <div
                key={candidate.id}
                className="flex flex-col gap-3 rounded-lg border bg-card p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{candidate.name}</span>
                    {candidate.companyName && candidate.companyName !== candidate.name ? (
                      <Badge variant="outline" className="text-[10px]">
                        {candidate.companyName}
                      </Badge>
                    ) : null}
                    {candidate.sector ? (
                      <Badge variant="outline" className="text-[10px]">
                        {candidate.sector}
                      </Badge>
                    ) : null}
                    {candidate.stage ? (
                      <Badge variant="outline" className="text-[10px]">
                        {candidate.stage}
                      </Badge>
                    ) : null}
                    {candidate.corpusSnapshotId ? (
                      <Badge className="bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">
                        Snapshot existant
                      </Badge>
                    ) : candidate.eligible ? (
                      <Badge className="bg-sky-600 text-[10px] text-white hover:bg-sky-600">
                        Eligible
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Non éligible
                      </Badge>
                    )}
                    {!hasProcessedDocs ? (
                      <Badge variant="outline" className="border-red-300 bg-red-50 text-[10px] text-red-700">
                        <AlertTriangle className="mr-1 h-2.5 w-2.5" />
                        Pas de docs prêts
                      </Badge>
                    ) : null}
                    {isLaunched ? (
                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700">
                        <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                        Batch lancé
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {candidate.documentCount} doc{candidate.documentCount > 1 ? "s" : ""}
                    </span>
                    <span>
                      {candidate.processedDocumentCount} prêt{candidate.processedDocumentCount > 1 ? "s" : ""}
                    </span>
                    {candidate.userId ? <span>User {candidate.userId.slice(0, 8)}...</span> : null}
                    <span>MAJ {formatRelativeDate(candidate.updatedAt)}</span>
                  </div>

                  {candidate.reasons.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {candidate.reasons.map((reason) => (
                        <Badge key={`${candidate.id}-${reason}`} variant="secondary" className="text-[10px]">
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <Database className="h-3.5 w-3.5" />
                  {candidate.corpusSnapshotId ? (
                    <span>{candidate.corpusSnapshotId.slice(0, 8)}...</span>
                  ) : candidate.status ? (
                    <span>{candidate.status}</span>
                  ) : (
                    <span>En attente</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
