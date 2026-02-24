import { cn } from "@/lib/utils";
import { getScoreColor } from "@/lib/ui-configs";

interface ScoreRingProps {
  score: number;
  /** Outer diameter in px (default 120) */
  size?: number;
  /** SVG stroke width (default 6) */
  strokeWidth?: number;
  /** Show "/100" label below the number (default: true for size >= 80) */
  showLabel?: boolean;
}

function getStrokeColor(score: number): string {
  if (score >= 80) return "stroke-emerald-500";
  if (score >= 60) return "stroke-blue-500";
  if (score >= 40) return "stroke-amber-500";
  if (score >= 20) return "stroke-orange-500";
  return "stroke-red-500";
}

export function ScoreRing({ score, size = 120, strokeWidth = 6, showLabel }: ScoreRingProps) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const isLarge = size >= 80;
  const shouldShowLabel = showLabel ?? isLarge;

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score: ${score} sur 100`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted/50"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={getStrokeColor(score)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn(
          "font-bold tabular-nums tracking-tight",
          isLarge ? "text-3xl" : "text-sm",
          getScoreColor(score),
        )}>
          {score}
        </span>
        {shouldShowLabel && (
          <span className="text-[11px] text-muted-foreground font-medium">/100</span>
        )}
      </div>
    </div>
  );
}
