"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import { BoardErrorBoundary } from "@/components/error-boundary";
import { AIBoardPanelSkeleton } from "./loading-skeletons";

// Dynamic import for AIBoardPanel - loaded only when AI Board tab is active
// This reduces the initial page bundle as the board includes heavy dependencies
const AIBoardPanel = dynamic(
  () => import("./board/ai-board-panel").then((mod) => ({ default: mod.AIBoardPanel })),
  {
    loading: () => <AIBoardPanelSkeleton />,
    ssr: false // AI Board is client-only, no need to SSR
  }
);

interface BoardPanelWrapperProps {
  dealId: string;
  dealName: string;
}

export const BoardPanelWrapper = memo(function BoardPanelWrapper({ dealId, dealName }: BoardPanelWrapperProps) {
  return (
    <BoardErrorBoundary>
      <AIBoardPanel dealId={dealId} dealName={dealName} />
    </BoardErrorBoundary>
  );
});
