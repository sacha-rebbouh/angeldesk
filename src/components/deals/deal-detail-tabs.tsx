"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { Tabs } from "@/components/ui/tabs";

const ALL_TABS = ["analysis", "overview", "docs-team", "conditions", "live"] as const;

interface DealDetailTabsProps {
  initialTab: string;
  /**
   * Onglets réellement rendus (selon les feature flags serveur). Par défaut : tous.
   * Empêche une URL `?tab=<archivé>` (bookmark/ancien lien) d'activer un onglet
   * sans `TabsTrigger`/`TabsContent` correspondant → vue vide. Voir
   * isConditionsTabEnabled() / isLiveCoachingEnabled() côté page.tsx.
   */
  allowedTabs?: readonly string[];
  children: ReactNode;
}

export function DealDetailTabs({ initialTab, allowedTabs, children }: DealDetailTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const validTabs = useMemo(() => new Set<string>(allowedTabs ?? ALL_TABS), [allowedTabs]);
  const resolveTab = useCallback(
    (tab: string | null | undefined, fallback = "analysis"): string =>
      tab && validTabs.has(tab) ? tab : fallback,
    [validTabs]
  );

  const [activeTab, setActiveTab] = useState(() =>
    resolveTab(searchParams.get("tab"), resolveTab(initialTab))
  );

  useEffect(() => {
    const nextTab = resolveTab(searchParams.get("tab"), resolveTab(initialTab));
    const timeoutId = window.setTimeout(() => {
      setActiveTab((currentTab) => currentTab === nextTab ? currentTab : nextTab);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialTab, searchParams, resolveTab]);

  const handleTabChange = useCallback(
    (nextTab: string) => {
      if (!validTabs.has(nextTab)) return;
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
    [pathname, searchParams, validTabs]
  );

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
      {children}
    </Tabs>
  );
}
