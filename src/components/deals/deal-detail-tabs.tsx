"use client";

import { useCallback, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs } from "@/components/ui/tabs";

const VALID_TABS = new Set(["analysis", "overview", "docs-team", "conditions", "live"]);

interface DealDetailTabsProps {
  initialTab: string;
  children: ReactNode;
}

export function DealDetailTabs({ initialTab, children }: DealDetailTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = requestedTab && VALID_TABS.has(requestedTab)
    ? requestedTab
    : VALID_TABS.has(initialTab)
      ? initialTab
      : "analysis";

  const handleTabChange = useCallback(
    (nextTab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextTab === "analysis") {
        params.delete("tab");
      } else {
        params.set("tab", nextTab);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
      {children}
    </Tabs>
  );
}
