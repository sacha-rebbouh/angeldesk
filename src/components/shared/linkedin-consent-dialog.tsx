"use client";

import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LinkedInConsentDialogProps {
  open: boolean;
  founderName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const LinkedInConsentDialog = memo(function LinkedInConsentDialog({
  open,
  founderName,
  onConfirm,
  onCancel,
}: LinkedInConsentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Enrichissement LinkedIn
          </DialogTitle>
          <DialogDescription>
            Vous etes sur le point de recuperer les informations publiques du
            profil LinkedIn de <strong>{founderName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            Cette action va consulter les donnees <strong>publiquement accessibles</strong> sur
            LinkedIn (experiences, formation, competences) via une API tierce.
          </p>
          <p className="text-muted-foreground">
            Base legale : Interet legitime pour l&apos;analyse de due diligence (Art. 6.1.f RGPD).
            Les donnees sont supprimables a tout moment depuis le dashboard.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button onClick={onConfirm}>
            Confirmer l&apos;enrichissement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

LinkedInConsentDialog.displayName = "LinkedInConsentDialog";
