"use client";

import { memo, useState, useCallback } from "react";
import { LayoutList, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DealsTable } from "@/components/deals/deals-table";
import { DealsKanban } from "@/components/deals/deals-kanban";
import type { CanonicalDealListItem } from "./types";

type ViewMode = "table" | "kanban";

interface DealsViewToggleProps {
  deals: CanonicalDealListItem[];
}

export const DealsViewToggle = memo(function DealsViewToggle({ deals }: DealsViewToggleProps) {
  const [view, setView] = useState<ViewMode>("table");

  const setTable = useCallback(() => setView("table"), []);
  const setKanban = useCallback(() => setView("kanban"), []);

  return (
    <>
      <div className="flex items-center gap-1 border rounded-lg p-0.5">
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-7 px-2", view === "table" && "bg-muted")}
          onClick={setTable}
          title="Vue liste"
        >
          <LayoutList className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-7 px-2", view === "kanban" && "bg-muted")}
          onClick={setKanban}
          title="Vue kanban"
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
      </div>

      {view === "table" ? (
        <DealsTable deals={deals} />
      ) : (
        <DealsKanban deals={deals} />
      )}
    </>
  );
});
