"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DealRenameDialogProps {
  dealName: string | undefined;
  isOpen: boolean;
  onClose: () => void;
  newName: string;
  onNewNameChange: (value: string) => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function DealRenameDialog({
  isOpen,
  onClose,
  newName,
  onNewNameChange,
  onConfirm,
  isLoading,
}: DealRenameDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renommer le deal</DialogTitle>
        </DialogHeader>
        <Input
          value={newName}
          onChange={(e) => onNewNameChange(e.target.value)}
          placeholder="Nouveau nom"
          onKeyDown={(e) => e.key === "Enter" && onConfirm()}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={onConfirm} disabled={isLoading || !newName.trim()}>
            {isLoading ? "..." : "Renommer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DealDeleteDialogProps {
  dealName: string | undefined;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function DealDeleteDialog({
  dealName,
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}: DealDeleteDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce deal ?</AlertDialogTitle>
          <AlertDialogDescription>
            &quot;{dealName}&quot; et toutes ses données (documents, analyses, red flags) seront définitivement supprimés.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? "..." : "Supprimer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
