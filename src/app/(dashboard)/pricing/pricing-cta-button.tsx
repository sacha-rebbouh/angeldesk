"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";

export function PricingCtaButton({ variant }: { variant: "card" | "banner" }) {
  const handleClick = () => {
    toast.info("Bientôt disponible — contactez-nous pour un accès anticipé");
  };

  if (variant === "banner") {
    return (
      <Button size="lg" variant="secondary" className="text-amber-600" onClick={handleClick}>
        <Crown className="mr-2 h-5 w-5" />
        Commencer l&apos;essai PRO
      </Button>
    );
  }

  return (
    <Button
      className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
      onClick={handleClick}
    >
      Passer au PRO
    </Button>
  );
}
