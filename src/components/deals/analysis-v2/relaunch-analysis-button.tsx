"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Loader2, RotateCw } from "lucide-react";

interface RelaunchAnalysisButtonProps {
  onRelaunch: () => void;
  isRelaunching: boolean;
}

/**
 * Bouton « Relancer une analyse » de la vue v2, à côté de l'Export PDF.
 *
 * Présentationnel : toute la logique (POST /api/analyze, gestion crédits / 409,
 * progression live, revue de thèse) est portée par `AnalysisV2Live`. Objectif :
 * la relance reste DANS la v2 (progression + modal de thèse), sans bascule vers
 * l'ancien panel — c'est ce ping-pong qui créait le trou de timing et l'impasse.
 *
 * Le dropdown sert de garde-fou : le clic explicite confirme une relance qui
 * consomme des crédits.
 */
export function RelaunchAnalysisButton({ onRelaunch, isRelaunching }: RelaunchAnalysisButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isRelaunching} className="gap-1.5">
          {isRelaunching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
          Relancer
          <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem
          onClick={onRelaunch}
          className="flex flex-col items-start gap-0.5 py-2.5"
        >
          <div className="flex items-center gap-2 font-medium">
            <RotateCw className="h-4 w-4 text-blue-600" />
            Relancer l'analyse complète
          </div>
          <span className="text-xs text-muted-foreground ml-6">
            Consomme des crédits · lance une nouvelle analyse en arrière-plan
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
