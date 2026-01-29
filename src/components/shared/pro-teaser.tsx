"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import { Lock, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProTeaserProps {
  /** Number of additional items hidden behind paywall */
  hiddenCount?: number;
  /** Label for the hidden items (e.g., "points forts", "questions") */
  itemLabel?: string;
  /** Custom message to display */
  message?: string;
  /** Whether to show the blur effect with fake content */
  showBlur?: boolean;
  /** Height of the blur zone */
  blurHeight?: "sm" | "md" | "lg";
  /** Whether to show upgrade button */
  showUpgradeButton?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * ProTeaser - Displays a teaser for PRO features with blur effect
 * Used to show FREE users what they're missing
 */
export const ProTeaser = memo(function ProTeaser({
  hiddenCount,
  itemLabel = "elements",
  message,
  showBlur = true,
  blurHeight = "md",
  showUpgradeButton = false,
  className,
}: ProTeaserProps) {
  const router = useRouter();
  const heightClasses = {
    sm: "h-12",
    md: "h-20",
    lg: "h-32",
  };

  const displayMessage = message ?? (
    hiddenCount && hiddenCount > 0
      ? `Decouvrez ${hiddenCount} autre${hiddenCount > 1 ? "s" : ""} ${itemLabel} avec PRO`
      : `Disponible avec PRO`
  );

  return (
    <div className={cn("relative", className)}>
      {/* Blur zone with fake content */}
      {showBlur && (
        <div className={cn(
          "relative overflow-hidden rounded-lg",
          heightClasses[blurHeight]
        )}>
          {/* Fake blurred content */}
          <div className="absolute inset-0 bg-gradient-to-b from-muted/30 to-muted/60">
            <div className="space-y-2 p-2 opacity-40 blur-[6px]">
              <div className="h-3 bg-muted-foreground/20 rounded w-3/4" />
              <div className="h-3 bg-muted-foreground/20 rounded w-5/6" />
              <div className="h-3 bg-muted-foreground/20 rounded w-2/3" />
            </div>
          </div>

          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>
      )}

      {/* Teaser message */}
      <div className={cn(
        "flex items-center gap-2 text-sm",
        showBlur ? "mt-2" : "",
        "text-amber-600 dark:text-amber-400"
      )}>
        <Lock className="h-4 w-4 shrink-0" />
        <span className="font-medium">{displayMessage}</span>
        {!showUpgradeButton && (
          <button
            onClick={() => router.push("/pricing")}
            className="text-amber-700 dark:text-amber-300 hover:underline font-semibold"
          >
            &rarr;
          </button>
        )}
      </div>

      {/* Optional upgrade button */}
      {showUpgradeButton && (
        <Button
          size="sm"
          className="mt-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
          onClick={() => router.push("/pricing")}
        >
          <Crown className="mr-2 h-4 w-4" />
          Passer a PRO - 249EUR/mois
        </Button>
      )}
    </div>
  );
});

/**
 * ProTeaserInline - Smaller inline version for use within lists
 */
export const ProTeaserInline = memo(function ProTeaserInline({
  hiddenCount,
  itemLabel = "elements",
}: {
  hiddenCount: number;
  itemLabel?: string;
}) {
  const router = useRouter();
  if (hiddenCount <= 0) return null;

  return (
    <button
      onClick={() => router.push("/pricing")}
      className="w-full flex items-center gap-2 p-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/40 transition-colors text-sm"
    >
      <Lock className="h-4 w-4 shrink-0" />
      <span>
        Decouvrez {hiddenCount} autre{hiddenCount > 1 ? "s" : ""} {itemLabel} avec PRO &rarr;
      </span>
    </button>
  );
});

/**
 * ProTeaserSection - Full section teaser for completely locked features
 */
export const ProTeaserSection = memo(function ProTeaserSection({
  title,
  description,
  icon: Icon,
  previewText,
}: {
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
  previewText?: string;
}) {
  const router = useRouter();
  return (
    <div className="relative p-4 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-700 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
      {/* Lock badge */}
      <div className="absolute -top-3 -right-3 bg-amber-500 text-white rounded-full p-2">
        <Lock className="h-4 w-4" />
      </div>

      <div className="flex items-start gap-3">
        {Icon && (
          <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="flex-1">
          <h4 className="font-semibold text-amber-800 dark:text-amber-200">{title}</h4>
          <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">{description}</p>
          {previewText && (
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-2 font-medium italic">
              &ldquo;{previewText}&rdquo;
            </p>
          )}
        </div>
      </div>

      <Button
        size="sm"
        className="mt-4 w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
        onClick={() => router.push("/pricing")}
      >
        <Crown className="mr-2 h-4 w-4" />
        Debloquer avec PRO
      </Button>
    </div>
  );
});

/**
 * ProTeaserBanner - Banner for PRO upsell at the end of results
 */
export const ProTeaserBanner = memo(function ProTeaserBanner() {
  const router = useRouter();
  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/30 dark:via-orange-950/30 dark:to-amber-950/30 p-6">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-200/50 to-orange-200/50 dark:from-amber-800/20 dark:to-orange-800/20 rounded-full blur-3xl" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <Crown className="h-6 w-6 text-amber-500" />
          <h3 className="text-lg font-bold text-amber-800 dark:text-amber-200">
            Passez a PRO pour une analyse complete
          </h3>
        </div>

        <ul className="space-y-2 mb-4">
          {[
            "Score detaille multi-dimensionnel",
            "Toutes les contradictions detectees",
            "3 scenarios modelises (Bull/Base/Bear)",
            "Analyse Expert Sectoriel",
            "Memo d'investissement PDF",
            "Questions critiques completes",
          ].map((feature, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {feature}
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-4">
          <Button
            className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
            onClick={() => router.push("/pricing")}
          >
            <Crown className="mr-2 h-4 w-4" />
            Passer a PRO - 249EUR/mois
          </Button>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            1 mauvaise decision evitee = 25K EUR sauves
          </p>
        </div>
      </div>
    </div>
  );
});
