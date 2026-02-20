"use client";

import { memo, useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ShieldCheck, Loader2 } from "lucide-react";

interface ResolutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alertTitle: string;
  alertSeverity: string;
  alertDescription?: string;
  onSubmit: (status: "RESOLVED" | "ACCEPTED", justification: string) => Promise<void>;
  isSubmitting?: boolean;
  existingStatus?: "RESOLVED" | "ACCEPTED";
  existingJustification?: string;
}

export const ResolutionDialog = memo(function ResolutionDialog({
  open,
  onOpenChange,
  alertTitle,
  alertSeverity,
  alertDescription,
  onSubmit,
  isSubmitting = false,
  existingStatus,
  existingJustification,
}: ResolutionDialogProps) {
  const [status, setStatus] = useState<"RESOLVED" | "ACCEPTED">(
    existingStatus ?? "RESOLVED",
  );
  const [justification, setJustification] = useState(
    existingJustification ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  // Re-sync state when props change (e.g. dialog reopened with different alert)
  useEffect(() => {
    if (open) {
      setStatus(existingStatus ?? "RESOLVED");
      setJustification(existingJustification ?? "");
      setError(null);
    }
  }, [open, existingStatus, existingJustification]);

  const handleSubmit = useCallback(async () => {
    if (justification.trim().length < 1) {
      setError("Veuillez entrer une justification.");
      return;
    }
    setError(null);
    try {
      await onSubmit(status, justification.trim());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    }
  }, [status, justification, onSubmit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resoudre l&apos;alerte</DialogTitle>
          <DialogDescription className="flex items-center gap-2 pt-1">
            <Badge variant="outline" className="shrink-0">{alertSeverity}</Badge>
            <span className="truncate">{alertTitle}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {alertDescription && (
            <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              {alertDescription}
            </p>
          )}

          <RadioGroup
            value={status}
            onValueChange={(v) => setStatus(v as "RESOLVED" | "ACCEPTED")}
            className="space-y-3"
          >
            <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="RESOLVED" id="resolved" className="mt-1" />
              <Label htmlFor="resolved" className="cursor-pointer flex-1">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="font-medium">Resolu</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Le probleme a ete verifie et n&apos;est plus d&apos;actualite
                  (corrige, information erronee, non applicable).
                </p>
              </Label>
            </div>
            <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="ACCEPTED" id="accepted" className="mt-1" />
              <Label htmlFor="accepted" className="cursor-pointer flex-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Risque accepte</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Le risque est reel mais j&apos;en suis conscient et je l&apos;accepte
                  (risque calcule, mitigation prevue).
                </p>
              </Label>
            </div>
          </RadioGroup>

          <div>
            <Label htmlFor="justification">
              Justification <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="justification"
              placeholder="Expliquez pourquoi vous resolvez ou acceptez cette alerte..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              className="mt-1.5"
              rows={3}
            />
            {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
