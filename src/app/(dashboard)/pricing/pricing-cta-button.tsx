"use client";

import { Button } from "@/components/ui/button";
import { Gift, Mail } from "lucide-react";

interface PricingCtaButtonProps {
  variant: "card" | "banner";
  packName?: string;
  highlighted?: boolean;
  label?: string;
}

export function PricingCtaButton({ variant, packName, highlighted, label }: PricingCtaButtonProps) {
  const handleClick = () => {
    const subject = packName
      ? encodeURIComponent(`Achat pack ${packName} — Angel Desk`)
      : encodeURIComponent('Accès Angel Desk');
    window.location.href = `mailto:contact@angeldesk.io?subject=${subject}`;
  };

  if (variant === "banner") {
    return (
      <Button
        size="lg"
        variant="secondary"
        className="bg-white/90 text-emerald-700 hover:bg-white"
        onClick={handleClick}
      >
        <Gift className="mr-2 h-5 w-5" />
        {label ?? "Commencer gratuitement"}
      </Button>
    );
  }

  return (
    <Button
      className={`w-full group ${
        highlighted
          ? "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
          : ""
      }`}
      variant={highlighted ? "default" : "outline"}
      onClick={handleClick}
    >
      <Mail className="mr-2 h-4 w-4" />
      Contactez-nous
    </Button>
  );
}
