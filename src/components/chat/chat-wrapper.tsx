"use client";

import { memo, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const DealChatPanel = dynamic(
  () =>
    import("./deal-chat-panel").then((mod) => ({
      default: mod.DealChatPanel,
    })),
  { ssr: false }
);

// Prefetch the chunk on hover so it's ready when user clicks
function prefetchChatPanel() {
  import("./deal-chat-panel");
}

interface ChatWrapperProps {
  dealId: string;
  dealName: string;
  children?: React.ReactNode;
}

export const ChatWrapper = memo(function ChatWrapper({
  dealId,
  dealName,
  children,
}: ChatWrapperProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  // B12.4 P1 #7 — the FAB (`fixed right-4 bottom-4 h-12`) overlaps the
  // bottom of the deal page content on mobile / narrow viewports. The
  // Evidence Health audit showed this on 390x844 where a "Renseigner
  // la date — <doc>" action button sat partially under the FAB,
  // reducing the tap target by ~30%. The fix adds bottom padding to
  // the content wrapper on viewports where the FAB is visible (sub-md
  // = the FAB's effective overlap zone), and zero padding on md+ where
  // the FAB sits next to the right edge but content has enough horizontal
  // space that overlap is rare. The FAB stays fixed; only the content
  // shrinks to leave room.
  //
  // Padding accounts for: bottom-4 (16px) + h-12 (48px) + tap target
  // breathing room (~16px) = ~80px → `pb-20` (5rem).
  const mobileFabPadding = !isOpen ? "pb-20 md:pb-0" : "";

  // Split view: when chat is open, content shrinks on large screens (F86)
  if (children) {
    return (
      <div className="flex gap-0">
        <div className={cn(
          "flex-1 min-w-0 transition-all duration-300",
          mobileFabPadding,
          isOpen && "lg:pr-[42%]"
        )}>
          {children}
        </div>
        {!isOpen && (
          <Button
            onClick={handleOpen}
            onMouseEnter={prefetchChatPanel}
            size="lg"
            className="fixed right-4 bottom-4 z-40 h-12 rounded-full shadow-lg gap-2 px-5"
            aria-label="Ouvrir le chat IA"
          >
            <MessageCircle className="size-5" />
            <span className="text-sm font-medium">Chat IA</span>
          </Button>
        )}
        <DealChatPanel
          dealId={dealId}
          dealName={dealName}
          isOpen={isOpen}
          onClose={handleClose}
        />
      </div>
    );
  }

  return (
    <>
      {!isOpen && (
        <Button
          onClick={handleOpen}
          onMouseEnter={prefetchChatPanel}
          size="lg"
          className="fixed right-4 bottom-4 z-40 h-12 rounded-full shadow-lg gap-2 px-5"
          aria-label="Ouvrir le chat IA"
        >
          <MessageCircle className="size-5" />
          <span className="text-sm font-medium">Chat IA</span>
        </Button>
      )}
      <DealChatPanel
        dealId={dealId}
        dealName={dealName}
        isOpen={isOpen}
        onClose={handleClose}
      />
    </>
  );
});
