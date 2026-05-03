"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { Tabs } from "@/components/ui/tabs";

const VALID_TABS = new Set(["analysis", "overview", "docs-team", "conditions", "live"]);

function resolveTab(tab: string | null | undefined, fallback = "analysis"): string {
  return tab && VALID_TABS.has(tab) ? tab : fallback;
}

interface DealDetailTabsProps {
  initialTab: string;
  children: ReactNode;
}

export function DealDetailTabs({ initialTab, children }: DealDetailTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(() =>
    resolveTab(searchParams.get("tab"), resolveTab(initialTab))
  );

  useEffect(() => {
    const nextTab = resolveTab(searchParams.get("tab"), resolveTab(initialTab));
    const timeoutId = window.setTimeout(() => {
      setActiveTab((currentTab) => currentTab === nextTab ? currentTab : nextTab);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialTab, searchParams]);

  const handleTabChange = useCallback(
    (nextTab: string) => {
      if (!VALID_TABS.has(nextTab)) return;
      setActiveTab(nextTab);
      const params = new URLSearchParams(searchParams.toString());
      if (nextTab === "analysis") {
        params.delete("tab");
      } else {
        params.set("tab", nextTab);
      }
      const query = params.toString();
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname, searchParams]
  );

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
      {children}
    </Tabs>
  );
}
