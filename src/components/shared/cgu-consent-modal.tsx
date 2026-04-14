"use client";

import { memo, useState, useCallback } from "react";
import { Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * CGU/IA consent modal displayed at first login.
 * Non-dismissible: no X button, no escape, no click outside.
 * User must check the checkbox and click "Accepter et continuer" to proceed.
 */
export const CguConsentModal = memo(function CguConsentModal({
  onAccepted,
}: {
  onAccepted: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccept = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/cgu", { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to record CGU acceptance");
      }
      onAccepted();
    } catch (err) {
      console.error("[CguConsentModal] Error:", err);
      setLoading(false);
    }
  }, [onAccepted]);

  return (
    <Dialog open onOpenChange={() => { /* non-dismissible — noop */ }}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Conditions d&apos;utilisation
          </DialogTitle>
          <DialogDescription>
            Avant de continuer, veuillez prendre connaissance des conditions
            d&apos;utilisation d&apos;Angel Desk.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p>
            Angel Desk utilise l&apos;intelligence artificielle pour analyser
            les opportunités d&apos;investissement. Les résultats fournis sont
            <strong> à titre informatif uniquement</strong> et{" "}
            <strong>ne constituent pas un conseil en investissement</strong>.
          </p>
          <p className="text-muted-foreground">
            Vos données (decks, documents) sont traitées par des modèles d&apos;IA
            pour générer les analyses. Aucune donnée n&apos;est utilisée pour
            entraîner des modèles tiers.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-md border p-3 mt-2">
          <input
            type="checkbox"
            id="cgu-accept"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <Label
            htmlFor="cgu-accept"
            className="text-sm font-normal leading-snug cursor-pointer"
          >
            J&apos;accepte les Conditions Générales d&apos;Utilisation et le
            traitement de mes données par IA
          </Label>
        </div>

        <DialogFooter>
          <Button
            onClick={handleAccept}
            disabled={!checked || loading}
            className="w-full sm:w-auto"
          >
            {loading ? "Enregistrement..." : "Accepter et continuer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

CguConsentModal.displayName = "CguConsentModal";
