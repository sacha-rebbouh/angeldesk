"use client";

import { useState, useCallback, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, X, Edit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";

// ============================================================================
// TYPES
// ============================================================================

interface PendingReview {
  id: string;
  factKey: string;
  category: string;
  newValue: unknown;
  newDisplayValue: string;
  newSource: string;
  newConfidence: number;
  existingValue: unknown;
  existingDisplayValue: string | null;
  existingSource: string | null;
  existingConfidence: number | null;
  contradictionReason: string | null;
  createdAt: string;
}

interface FactReviewPanelProps {
  dealId: string;
}

type Decision = "ACCEPT_NEW" | "KEEP_EXISTING" | "OVERRIDE";

// ============================================================================
// REVIEW ITEM COMPONENT
// ============================================================================

interface ReviewItemProps {
  review: PendingReview;
  onResolve: (review: PendingReview) => void;
}

const ReviewItem = memo(function ReviewItem({
  review,
  onResolve,
}: ReviewItemProps) {
  const handleResolveClick = useCallback(() => {
    onResolve(review);
  }, [review, onResolve]);

  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{review.factKey}</Badge>
          <Badge variant="secondary">{review.category}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {review.existingDisplayValue ?? "N/A"} ({review.existingSource ?? "N/A"})
          {" -> "}
          {review.newDisplayValue} ({review.newSource})
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={handleResolveClick}>
        Resoudre
      </Button>
    </div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const FactReviewPanel = memo(function FactReviewPanel({
  dealId,
}: FactReviewPanelProps) {
  const queryClient = useQueryClient();
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(
    null
  );
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [overrideValue, setOverrideValue] = useState("");

  // Fetch pending reviews
  const { data: reviews, isLoading } = useQuery<PendingReview[]>({
    queryKey: queryKeys.factReviews.byDeal(dealId),
    queryFn: async () => {
      const res = await fetch(`/api/facts/${dealId}/reviews`);
      if (!res.ok) throw new Error("Failed to fetch reviews");
      const json = await res.json();
      return json.data;
    },
  });

  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: async (data: {
      reviewId: string;
      decision: string;
      reason: string;
      overrideValue?: string;
      overrideDisplayValue?: string;
    }) => {
      const res = await fetch(`/api/facts/${dealId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to resolve review");
      return res.json();
    },
    onSuccess: () => {
      // Invalidate only the specific queries affected
      queryClient.invalidateQueries({ queryKey: queryKeys.factReviews.byDeal(dealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.facts.byDeal(dealId) });
      resetDialog();
    },
  });

  // Handlers
  const resetDialog = useCallback(() => {
    setSelectedReview(null);
    setDecision(null);
    setReason("");
    setOverrideValue("");
  }, []);

  const handleSelectReview = useCallback((review: PendingReview) => {
    setSelectedReview(review);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setSelectedReview(null);
    setDecision(null);
    setReason("");
    setOverrideValue("");
  }, []);

  const handleDecisionSelect = useCallback((d: Decision) => {
    setDecision(d);
  }, []);

  const handleReasonChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setReason(e.target.value);
    },
    []
  );

  const handleOverrideValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setOverrideValue(e.target.value);
    },
    []
  );

  const handleConfirm = useCallback(() => {
    if (selectedReview && decision) {
      resolveMutation.mutate({
        reviewId: selectedReview.id,
        decision,
        reason,
        overrideValue: decision === "OVERRIDE" ? overrideValue : undefined,
        overrideDisplayValue: decision === "OVERRIDE" ? overrideValue : undefined,
      });
    }
  }, [selectedReview, decision, reason, overrideValue, resolveMutation]);

  // Loading state
  if (isLoading) {
    return (
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
          <span className="ml-2 text-sm text-amber-700">Chargement...</span>
        </CardContent>
      </Card>
    );
  }

  // No reviews
  if (!reviews || reviews.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            {reviews.length} contradiction{reviews.length > 1 ? "s" : ""} a
            resoudre
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {reviews.map((review) => (
            <ReviewItem
              key={review.id}
              review={review}
              onResolve={handleSelectReview}
            />
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!selectedReview} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resoudre la contradiction</DialogTitle>
          </DialogHeader>

          {selectedReview && (
            <div className="space-y-4">
              {/* Value comparison */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">
                    Valeur actuelle
                  </p>
                  <p className="font-medium">
                    {selectedReview.existingDisplayValue ?? "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Source: {selectedReview.existingSource ?? "N/A"} (
                    {selectedReview.existingConfidence ?? 0}%)
                  </p>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-xs text-muted-foreground mb-1">
                    Nouvelle valeur
                  </p>
                  <p className="font-medium">{selectedReview.newDisplayValue}</p>
                  <p className="text-xs text-muted-foreground">
                    Source: {selectedReview.newSource} (
                    {selectedReview.newConfidence}%)
                  </p>
                </div>
              </div>

              {/* Contradiction reason */}
              {selectedReview.contradictionReason && (
                <p className="text-sm text-muted-foreground">
                  {selectedReview.contradictionReason}
                </p>
              )}

              {/* Decision buttons */}
              <div className="flex gap-2">
                <Button
                  variant={decision === "ACCEPT_NEW" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleDecisionSelect("ACCEPT_NEW")}
                >
                  <Check className="h-4 w-4 mr-1" /> Accepter nouvelle
                </Button>
                <Button
                  variant={decision === "KEEP_EXISTING" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleDecisionSelect("KEEP_EXISTING")}
                >
                  <X className="h-4 w-4 mr-1" /> Garder actuelle
                </Button>
                <Button
                  variant={decision === "OVERRIDE" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleDecisionSelect("OVERRIDE")}
                >
                  <Edit2 className="h-4 w-4 mr-1" /> Corriger
                </Button>
              </div>

              {/* Override input */}
              {decision === "OVERRIDE" && (
                <Input
                  placeholder="Nouvelle valeur..."
                  value={overrideValue}
                  onChange={handleOverrideValueChange}
                />
              )}

              {/* Reason textarea */}
              <Textarea
                placeholder="Raison de votre decision..."
                value={reason}
                onChange={handleReasonChange}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Annuler
            </Button>
            <Button
              disabled={!decision || !reason || resolveMutation.isPending}
              onClick={handleConfirm}
            >
              {resolveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Traitement...
                </>
              ) : (
                "Confirmer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

export default FactReviewPanel;
