"use client";

/**
 * ThesisStaleBadge — badge affiche sur les cards de deals qui n'ont pas encore
 * de these persistee (deals pre-migration thesis-first).
 *
 * Deux variantes :
 *  - inline (compact) : badge cliquable qui declenche onAnalyze
 *  - full : badge + CTA explicite + description
 *
 * Utilise dans deals-table.tsx et sur le header de chaque deal sans these.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThesisStaleBadgeProps {
  variant?: "inline" | "full";
  onAnalyze?: () => void;
  isAnalyzing?: boolean;
  className?: string;
}

export function ThesisStaleBadge({ variant = "inline", onAnalyze, isAnalyzing = false, className }: ThesisStaleBadgeProps) {
  if (variant === "inline") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "bg-amber-50 text-amber-800 border-amber-300 text-[10px] gap-1",
          onAnalyze && "cursor-pointer hover:bg-amber-100",
          className
        )}
        onClick={onAnalyze}
        role={onAnalyze ? "button" : undefined}
        tabIndex={onAnalyze ? 0 : undefined}
        onKeyDown={(e) => {
          if (onAnalyze && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onAnalyze();
          }
        }}
      >
        <AlertTriangle className="h-2.5 w-2.5" />
        Thèse non analysée
      </Badge>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-amber-300 bg-amber-50 p-3 flex items-start gap-3",
        className
      )}
      role="region"
      aria-label="Thèse non analysée"
    >
      <div className="rounded-full bg-amber-100 p-1.5 shrink-0">
        <AlertTriangle className="h-4 w-4 text-amber-700" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">Thèse non analysée</p>
        <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
          Ce deal date d&apos;avant l&apos;activation de la these-first. Lancez un Deep Dive pour
          obtenir la these d&apos;investissement reformulee + verdict unifie (YC/Thiel/Angel Desk).
          Analyse de these incluse dans le Deep Dive (pas de surcout).
        </p>
      </div>
      {onAnalyze && (
        <Button
          size="sm"
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white h-8 text-xs"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              En cours
            </>
          ) : (
            <>
              <Play className="h-3 w-3 mr-1" />
              Lancer Deep Dive
            </>
          )}
        </Button>
      )}
    </div>
  );
}
