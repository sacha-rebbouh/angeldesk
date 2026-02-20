"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Clock, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import type { TermsVersionData } from "./types";

interface VersionTimelineProps {
  dealId: string;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Saisie manuelle",
  extracted: "Extrait d'un document",
  negotiated: "Negociation",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface VersionWithDelta extends TermsVersionData {
  deltaScore: number | null;
}

export const VersionTimeline = React.memo(function VersionTimeline({ dealId }: VersionTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery<{ versions: VersionWithDelta[] }>({
    queryKey: queryKeys.dealTerms.versions(dealId),
    queryFn: async () => {
      const res = await fetch(`/api/deals/${dealId}/terms/versions`);
      if (!res.ok) throw new Error("Failed to fetch versions");
      return res.json();
    },
    staleTime: 30_000,
  });

  const versions = data?.versions ?? [];

  // Collapse logic: show first 2 + last 3 when > 6 versions
  const displayedVersions = useMemo(() => {
    if (showAll || versions.length <= 6) return versions;
    return [...versions.slice(0, 2), ...versions.slice(-3)];
  }, [versions, showAll]);

  const hiddenCount = versions.length - displayedVersions.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <Clock className="mx-auto h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm">Aucun historique</p>
        <p className="text-xs mt-1">
          Chaque sauvegarde cree automatiquement une version.
          L&apos;historique apparaitra apres votre premiere modification.
        </p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Historique des conditions ({versions.length} version{versions.length > 1 ? "s" : ""})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative ml-4 border-l-2 border-muted pl-6 space-y-4">
          {displayedVersions.map((v, idx) => {
            const isExpanded = expandedId === v.id;
            // Insert "show more" button between slot 2 and last 3
            const shouldShowCollapseButton = !showAll && hiddenCount > 0 && idx === 2;

            return (
              <React.Fragment key={v.id}>
                {shouldShowCollapseButton && (
                  <div className="relative -ml-[calc(1.5rem+1px)]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => setShowAll(true)}
                    >
                      <ChevronDown className="mr-1 h-3 w-3" />
                      {hiddenCount} version{hiddenCount > 1 ? "s" : ""} masquee{hiddenCount > 1 ? "s" : ""}
                    </Button>
                  </div>
                )}

                <div className="relative">
                  {/* Dot on timeline */}
                  <div className={cn(
                    "absolute -left-[calc(1.5rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full border-2",
                    idx === 0 ? "bg-primary border-primary" : "bg-background border-muted-foreground/40"
                  )} />

                  <div
                    className="cursor-pointer hover:bg-muted/50 rounded-lg p-3 -ml-2 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : v.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          v{v.version}
                          {v.label && <span className="text-muted-foreground ml-1">— {v.label}</span>}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {SOURCE_LABELS[v.source] ?? v.source}
                        </Badge>
                        {v.conditionsScore != null && (
                          <Badge variant="secondary" className="text-xs">
                            Score: {v.conditionsScore}/100
                          </Badge>
                        )}
                        {v.deltaScore != null && v.deltaScore !== 0 && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              v.deltaScore > 0 ? "text-green-600 border-green-200" : "text-red-600 border-red-200"
                            )}
                          >
                            {v.deltaScore > 0 ? "+" : ""}{v.deltaScore} pts
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(v.createdAt)}
                        </span>
                        {isExpanded
                          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                      </div>
                    </div>

                    {v.changeNote && (
                      <p className="text-xs text-muted-foreground mt-1">{v.changeNote}</p>
                    )}

                    {isExpanded && (
                      <VersionDetails snapshot={v.termsSnapshot} />
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {showAll && versions.length > 6 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-4 text-xs text-muted-foreground"
            onClick={() => setShowAll(false)}
          >
            <ChevronUp className="mr-1 h-3 w-3" />
            Replier
          </Button>
        )}
      </CardContent>
    </Card>
  );
});

// Render a snapshot as key-value pairs
function VersionDetails({ snapshot }: { snapshot: Record<string, unknown> }) {
  const terms = (snapshot.terms ?? snapshot) as Record<string, unknown>;
  const mode = snapshot.mode as string | undefined;
  const tranches = snapshot.tranches as Array<Record<string, unknown>> | null | undefined;

  const entries = Object.entries(terms).filter(
    ([, v]) => v != null && v !== "" && v !== false
  );

  return (
    <div className="mt-3 pt-3 border-t space-y-2">
      {mode && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground font-medium">Mode:</span>
          <Badge variant="outline" className="text-xs">{mode}</Badge>
        </div>
      )}

      {entries.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {entries.slice(0, 20).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1">
              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50" />
              <span className="text-muted-foreground">{key}:</span>
              <span className="font-medium truncate max-w-[200px]">
                {typeof val === "boolean" ? (val ? "Oui" : "Non") : String(val)}
              </span>
            </div>
          ))}
        </div>
      )}

      {tranches && tranches.length > 0 && (
        <div className="text-xs space-y-1">
          <span className="text-muted-foreground font-medium">Tranches ({tranches.length}):</span>
          {tranches.map((t, i) => (
            <div key={i} className="flex items-center gap-1 ml-2">
              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50" />
              <span>
                {(t.label as string) || `Tranche ${i + 1}`} — {t.trancheType as string}
                {t.amount != null && ` — ${Number(t.amount).toLocaleString("fr-FR")} EUR`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
