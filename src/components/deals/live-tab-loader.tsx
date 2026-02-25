"use client";

import dynamic from "next/dynamic";

const LiveTabContent = dynamic(
  () => import("@/components/deals/live-tab-content"),
  {
    ssr: false,
    loading: () => (
      <div className="p-8 text-center text-muted-foreground">
        Chargement...
      </div>
    ),
  }
);

export default function LiveTabLoader({ dealId, dealName }: { dealId: string; dealName: string }) {
  return <LiveTabContent dealId={dealId} dealName={dealName} />;
}
