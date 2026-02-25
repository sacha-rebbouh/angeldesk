"use client";

import { memo } from "react";
import {
  HelpCircle,
  AlertTriangle,
  Lightbulb,
  Scale,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AblyCoachingCardEvent, CoachingCardType, CardPriority } from "@/lib/live/types";

// ---------------------------------------------------------------------------
// Card type config — border color, icon, label (FR), dot color
// ---------------------------------------------------------------------------

const CARD_TYPE_CONFIG: Record<
  CoachingCardType,
  {
    borderClass: string;
    dotClass: string;
    icon: typeof HelpCircle;
    label: string;
  }
> = {
  question: {
    borderClass: "border-l-orange-500",
    dotClass: "bg-orange-500",
    icon: HelpCircle,
    label: "Question",
  },
  contradiction: {
    borderClass: "border-l-red-500",
    dotClass: "bg-red-500",
    icon: AlertTriangle,
    label: "Contradiction",
  },
  new_info: {
    borderClass: "border-l-green-500",
    dotClass: "bg-green-500",
    icon: Lightbulb,
    label: "Nouveau",
  },
  negotiation: {
    borderClass: "border-l-violet-500",
    dotClass: "bg-violet-500",
    icon: Scale,
    label: "Négo",
  },
};

// ---------------------------------------------------------------------------
// Relative time formatter (French)
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 10) return "à l'instant";
  if (diffSec < 60) return `il y a ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `il y a ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  return `il y a ${diffH}h`;
}

// ---------------------------------------------------------------------------
// Priority dot
// ---------------------------------------------------------------------------

function PriorityDot({
  priority,
  dotClass,
}: {
  priority: CardPriority;
  dotClass: string;
}) {
  if (priority === "low") return null;
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full",
        dotClass,
        priority === "high" ? "h-2.5 w-2.5" : "h-1.5 w-1.5"
      )}
      aria-label={`Priorité ${priority}`}
    />
  );
}

// ---------------------------------------------------------------------------
// CoachingCard
// ---------------------------------------------------------------------------

interface CoachingCardProps {
  card: AblyCoachingCardEvent;
  isAddressed?: boolean;
}

export const CoachingCard = memo(function CoachingCard({
  card,
  isAddressed = false,
}: CoachingCardProps) {
  const config = CARD_TYPE_CONFIG[card.type];
  const Icon = config.icon;

  const timeLabel = relativeTime(card.createdAt);

  return (
    <div
      role="article"
      aria-label={`${config.label} - Priorité ${card.priority}`}
      className={cn(
        "rounded-lg border border-l-[3px] px-3 py-2.5 transition-colors animate-in slide-in-from-top-2 duration-300",
        config.borderClass,
        isAddressed
          ? "bg-muted/50 opacity-60"
          : "bg-card dark:bg-card"
      )}
    >
      {/* Header row: icon + label — priority dot — time */}
      <div className="flex items-center gap-2 text-xs">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium text-muted-foreground">
          {isAddressed ? "Abordé" : config.label}
        </span>

        <PriorityDot priority={card.priority} dotClass={config.dotClass} />

        <span className="ml-auto text-[11px] text-muted-foreground/70 tabular-nums">
          {timeLabel}
        </span>

        {isAddressed && (
          <Check className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
        )}
      </div>

      {/* Content */}
      <p className="mt-1 text-sm leading-snug line-clamp-2">
        {card.content}
      </p>

      {/* Suggested question */}
      {card.suggestedQuestion && (
        <p className="mt-1 text-sm italic text-muted-foreground line-clamp-2">
          &laquo;&nbsp;{card.suggestedQuestion}&nbsp;&raquo;
        </p>
      )}

      {/* Reference */}
      {card.reference && (
        <p className="mt-1 text-[11px] text-muted-foreground/60 line-clamp-1">
          Ref: {card.reference}
        </p>
      )}
    </div>
  );
});
