"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Play, Check, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface Candidate {
  id: string;
  name: string;
  companyName: string | null;
  sector: string | null;
  stage: string | null;
  userId: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

interface AdminThesisBackfillClientProps {
  candidates: Candidate[];
}

export function AdminThesisBackfillClient({ candidates }: AdminThesisBackfillClientProps) {
  const [triggering, setTriggering] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const filtered = candidates.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.companyName?.toLowerCase().includes(q) ?? false) ||
      (c.sector?.toLowerCase().includes(q) ?? false)
    );
  });

  async function triggerBackfill(dealId: string) {
    if (triggering.has(dealId) || done.has(dealId)) return;

    setTriggering((s) => new Set(s).add(dealId));

    try {
      const res = await fetch("/api/admin/thesis/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Backfill failed (${res.status})`);
      }

      setDone((s) => new Set(s).add(dealId));
      toast.success(`Backfill declenche pour ${dealId.slice(0, 8)}... (2cr facturees admin)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setTriggering((s) => {
        const next = new Set(s);
        next.delete(dealId);
        return next;
      });
    }
  }

  async function triggerBatch() {
    const eligible = filtered.filter((c) => !done.has(c.id) && !triggering.has(c.id) && c.documentCount > 0);
    if (eligible.length === 0) {
      toast.info("Aucun deal eligible pour un batch.");
      return;
    }
    if (!confirm(`Declencher backfill pour ${eligible.length} deals ? Cout total : ${eligible.length * 2}cr admin.`)) {
      return;
    }
    for (const c of eligible) {
      await triggerBackfill(c.id);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  if (candidates.length === 0) {
    return (
      <div className="text-center py-10">
        <Check className="h-10 w-10 text-green-600 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          Tous les deals ont une these extraite. Aucun backfill necessaire.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, societe, secteur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          onClick={triggerBatch}
          disabled={filtered.length === 0 || triggering.size > 0}
          variant="default"
          size="sm"
        >
          <Play className="h-3.5 w-3.5 mr-1" />
          Batch ({filtered.filter((c) => c.documentCount > 0 && !done.has(c.id)).length})
        </Button>
      </div>

      <div className="space-y-2">
        {filtered.map((c) => {
          const isTrigger = triggering.has(c.id);
          const isDone = done.has(c.id);
          const canTrigger = c.documentCount > 0 && !isTrigger && !isDone;

          return (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 border rounded-md p-3 bg-card"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{c.name}</span>
                  {c.sector && <Badge variant="outline" className="text-[10px]">{c.sector}</Badge>}
                  {c.stage && <Badge variant="outline" className="text-[10px]">{c.stage}</Badge>}
                  {c.documentCount === 0 && (
                    <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-300">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                      Pas de doc
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {c.documentCount} doc{c.documentCount !== 1 ? "s" : ""} · User {c.userId.slice(0, 8)}... · MAJ{" "}
                  {formatDistanceToNow(new Date(c.updatedAt), { locale: fr, addSuffix: true })}
                </div>
              </div>
              <Button
                size="sm"
                variant={isDone ? "outline" : "default"}
                onClick={() => triggerBackfill(c.id)}
                disabled={!canTrigger}
                className="shrink-0"
              >
                {isTrigger ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    En cours
                  </>
                ) : isDone ? (
                  <>
                    <Check className="h-3 w-3 mr-1 text-green-600" />
                    Declenche
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 mr-1" />
                    Backfill (2cr)
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
