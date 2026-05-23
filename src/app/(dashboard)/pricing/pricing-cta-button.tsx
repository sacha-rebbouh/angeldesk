"use client";

import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

interface PricingCtaButtonProps {
  variant: "card";
  packName?: string;
  highlighted?: boolean;
}

export function PricingCtaButton({ packName, highlighted }: PricingCtaButtonProps) {
  const handleClick = () => {
    const subject = packName
      ? encodeURIComponent(`Achat pack ${packName} — Angel Desk`)
      : encodeURIComponent('Accès Angel Desk');
    window.location.href = `mailto:contact@angeldesk.io?subject=${subject}`;
  };

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
