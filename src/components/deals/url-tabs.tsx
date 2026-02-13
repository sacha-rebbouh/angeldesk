"use client";

import { useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Hook to sync the active tab with ?tab= in the URL.
 * Call onTabChange when user clicks a tab — it updates the URL without reload.
 */
export function useTabSync(defaultTab: string) {
  const router = useRouter();
  const pathname = usePathname();

  const onTabChange = useCallback(
    (value: string) => {
      if (value === defaultTab) {
        router.replace(pathname, { scroll: false });
      } else {
        router.replace(`${pathname}?tab=${value}`, { scroll: false });
      }
    },
    [router, pathname, defaultTab]
  );

  return { onTabChange };
}
