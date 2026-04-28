"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  const [activeTab, setActiveTab] = useState(
    VALID_TABS.has(initialTab) ? initialTab : "analysis"
  );

  useEffect(() => {
    const tab = searchParams.get("tab") ?? "analysis";
    if (VALID_TABS.has(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = useCallback(
    (nextTab: string) => {
      setActiveTab(nextTab);
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
