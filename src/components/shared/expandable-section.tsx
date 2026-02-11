"use client";

import { memo, useState, useCallback, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ExpandableSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Optional count to display next to title */
  count?: number;
  /** Optional icon to display before title */
  icon?: ReactNode;
}

export const ExpandableSection = memo(function ExpandableSection({
  title,
  children,
  defaultOpen = false,
  count,
  icon,
}: ExpandableSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggleOpen = useCallback(() => setIsOpen(prev => !prev), []);

  return (
    <div className="border rounded-lg">
      <button
        onClick={toggleOpen}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 font-medium text-sm">
          {icon}
          <span>
            {title}
            {count !== undefined && ` (${count})`}
          </span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {isOpen && <div className="p-3 pt-0 border-t">{children}</div>}
    </div>
  );
});

ExpandableSection.displayName = "ExpandableSection";
