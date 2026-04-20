"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type IntegritySample = {
  dealId: string;
  dealName: string;
  thesisId?: string;
  analysisId?: string;
  corpusSnapshotId?: string | null;
  detail: string;
};

interface CorpusIntegrityOverview {
  generatedAt: string;
  analyses: {
    total: number;
    withSnapshot: number;
    withoutSnapshot: number;
    withDocumentRelationsOnly: number;
    legacyArrayOnly: number;
    unresolvedScope: number;
    legacyDocumentIdsPopulated: number;
  };
  theses: {
    total: number;
    withSnapshot: number;
    withoutSnapshot: number;
    linkedAnalysisSnapshotAvailable: number;
    legacyArrayOnly: number;
    latestSnapshotScopeDrift: number;
  };
  snapshots: {
    total: number;
    membersMissingExtractionRun: number;
  };
  alignment: {
    latestThesisWithoutCanonicalAnalysis: number;
  };
  samples: {
    latestThesisWithoutCanonicalAnalysis: IntegritySample[];
    analysesLegacyArrayOnly: IntegritySample[];
    thesesLegacyArrayOnly: IntegritySample[];
    latestThesisSnapshotDrift: IntegritySample[];
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeSample(value: unknown): IntegritySample | null {
  const record = asRecord(value);
  if (!record) return null;

  const dealId = asString(record.dealId);
  const dealName = asString(record.dealName);
  const detail = asString(record.detail);
  if (!dealId || !dealName || !detail) return null;

  return {
    dealId,
    dealName,
    detail,
    thesisId: asString(record.thesisId) ?? undefined,
    analysisId: asString(record.analysisId) ?? undefined,
    corpusSnapshotId: asString(record.corpusSnapshotId),
  };
}

function normalizeOverview(payload: unknown): CorpusIntegrityOverview {
  const root = asRecord(payload) ?? {};
  const data = asRecord(root.data) ?? root;
  const analyses = asRecord(data.analyses) ?? {};
  const theses = asRecord(data.theses) ?? {};
  const snapshots = asRecord(data.snapshots) ?? {};
  const alignment = asRecord(data.alignment) ?? {};
  const samples = asRecord(data.samples) ?? {};

  const mapSamples = (value: unknown): IntegritySample[] =>
    Array.isArray(value)
      ? value.map((item) => normalizeSample(item)).filter((item): item is IntegritySample => Boolean(item))
      : [];

  return {
    generatedAt: asString(data.generatedAt) ?? new Date().toISOString(),
    analyses: {
      total: asNumber(analyses.total),
      withSnapshot: asNumber(analyses.withSnapshot),
      withoutSnapshot: asNumber(analyses.withoutSnapshot),
      withDocumentRelationsOnly: asNumber(analyses.withDocumentRelationsOnly),
      legacyArrayOnly: asNumber(analyses.legacyArrayOnly),
      unresolvedScope: asNumber(analyses.unresolvedScope),
      legacyDocumentIdsPopulated: asNumber(analyses.legacyDocumentIdsPopulated),
    },
    theses: {
      total: asNumber(theses.total),
      withSnapshot: asNumber(theses.withSnapshot),
      withoutSnapshot: asNumber(theses.withoutSnapshot),
      linkedAnalysisSnapshotAvailable: asNumber(theses.linkedAnalysisSnapshotAvailable),
      legacyArrayOnly: asNumber(theses.legacyArrayOnly),
      latestSnapshotScopeDrift: asNumber(theses.latestSnapshotScopeDrift),
    },
    snapshots: {
      total: asNumber(snapshots.total),
      membersMissingExtractionRun: asNumber(snapshots.membersMissingExtractionRun),
    },
    alignment: {
      latestThesisWithoutCanonicalAnalysis: asNumber(alignment.latestThesisWithoutCanonicalAnalysis),
    },
    samples: {
      latestThesisWithoutCanonicalAnalysis: mapSamples(samples.latestThesisWithoutCanonicalAnalysis),
      analysesLegacyArrayOnly: mapSamples(samples.analysesLegacyArrayOnly),
      thesesLegacyArrayOnly: mapSamples(samples.thesesLegacyArrayOnly),
      latestThesisSnapshotDrift: mapSamples(samples.latestThesisSnapshotDrift),
    },
  };
}

async function fetchIntegrityOverview(): Promise<CorpusIntegrityOverview> {
  const response = await fetch("/api/admin/corpus/integrity", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message =
      (asRecord(error)?.error as string | undefined) ??
      `Integrity overview failed (${response.status})`;
    throw new Error(message);
  }

  return normalizeOverview(await response.json());
}

function formatRelativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date inconnue";
  return formatDistanceToNow(date, { locale: fr, addSuffix: true });
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
    <Card className={cn("bg-card", muted && "opacity-85")}>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function SampleList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: IntegritySample[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4">
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {emptyLabel}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      {items.map((item) => (
        <div key={`${title}-${item.dealId}-${item.analysisId ?? item.thesisId ?? item.detail}`} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{item.dealName}</span>
            {item.analysisId ? (
              <Badge variant="outline" className="text-[10px]">
                Analysis {item.analysisId.slice(0, 8)}...
              </Badge>
            ) : null}
            {item.thesisId ? (
              <Badge variant="outline" className="text-[10px]">
                Thesis {item.thesisId.slice(0, 8)}...
              </Badge>
            ) : null}
            {item.corpusSnapshotId ? (
              <Badge variant="outline" className="text-[10px]">
                Snapshot {item.corpusSnapshotId.slice(0, 8)}...
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

export function AdminCorpusIntegrityClient() {
  const [overview, setOverview] = useState<CorpusIntegrityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      setError(null);
      setOverview(await fetchIntegrityOverview());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erreur inconnue");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const outstandingIssues = useMemo(() => {
    if (!overview) return 0;
    return (
      overview.alignment.latestThesisWithoutCanonicalAnalysis +
      overview.analyses.legacyArrayOnly +
      overview.theses.legacyArrayOnly +
      overview.theses.latestSnapshotScopeDrift +
      overview.snapshots.membersMissingExtractionRun
    );
  }, [overview]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Chargement de l’intégrité canonique...
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="rounded-lg border border-dashed p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-600" />
          <div className="space-y-3">
            <div>
              <div className="font-medium">Integrity overview indisponible</div>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadOverview()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Réessayer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!overview) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Santé du modèle canonique</span>
            {outstandingIssues === 0 ? (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Clean</Badge>
            ) : (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                {outstandingIssues} signaux ouverts
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Snapshot, thèse, analyses et reliquats legacy. Rafraîchi {formatRelativeDate(overview.generatedAt)}.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={() => void loadOverview(true)} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Rafraîchir
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Analyses avec snapshot" value={overview.analyses.withSnapshot} />
        <StatCard label="Thèses avec snapshot" value={overview.theses.withSnapshot} />
        <StatCard label="Latest thesis sans analyse canonique" value={overview.alignment.latestThesisWithoutCanonicalAnalysis} muted />
        <StatCard label="Analyses legacy array-only" value={overview.analyses.legacyArrayOnly} muted />
        <StatCard label="Members sans extractionRun" value={overview.snapshots.membersMissingExtractionRun} muted />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Analyses totales" value={overview.analyses.total} muted />
        <StatCard label="Thèses totales" value={overview.theses.total} muted />
        <StatCard label="Snapshots" value={overview.snapshots.total} muted />
        <StatCard label="Drift latest thesis/snapshot" value={overview.theses.latestSnapshotScopeDrift} muted />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <SampleList
            title="Latest thesis sans analyse canonique"
            items={overview.samples.latestThesisWithoutCanonicalAnalysis}
            emptyLabel="Toutes les latest theses ont une analyse canonique alignée."
          />
          <SampleList
            title="Analyses encore portées par documentIds legacy"
            items={overview.samples.analysesLegacyArrayOnly}
            emptyLabel="Aucune analyse ne dépend plus uniquement du tableau legacy documentIds."
          />
        </div>

        <div className="space-y-4">
          <SampleList
            title="Thèses encore portées uniquement par la source legacy"
            items={overview.samples.thesesLegacyArrayOnly}
            emptyLabel="Aucune thèse ne dépend plus uniquement de sourceDocumentIds legacy."
          />
          <SampleList
            title="Drift latest thesis vs snapshot"
            items={overview.samples.latestThesisSnapshotDrift}
            emptyLabel="Les champs legacy de thèse reflètent bien le snapshot quand il existe."
          />
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
          <div className="space-y-1 text-muted-foreground">
            <p>
              `withDocumentRelationsOnly` = analyses sans snapshot mais déjà reliées par `AnalysisDocument`.
            </p>
            <p>
              `linkedAnalysisSnapshotAvailable` = thèses sans snapshot qui pourraient être raccrochées via une analyse déjà canonique.
            </p>
            <p>
              `membersMissingExtractionRun` reste toléré sur les snapshots historiques créés avant le stockage de `extractionRunId`.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
