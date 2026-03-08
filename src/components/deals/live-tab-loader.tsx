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

interface LiveTabLoaderProps {
  dealId: string;
  dealName: string;
  userName?: string;
  founderNames?: string[];
}

export default function LiveTabLoader({ dealId, dealName, userName, founderNames }: LiveTabLoaderProps) {
  return (
    <LiveTabContent
      dealId={dealId}
      dealName={dealName}
      userName={userName}
      founderNames={founderNames}
    />
  );
}
