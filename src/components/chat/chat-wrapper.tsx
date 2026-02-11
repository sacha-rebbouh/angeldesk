"use client";

import { memo, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";
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

  // Split view: when chat is open, content shrinks on large screens (F86)
  if (children) {
    return (
      <div className="flex gap-0">
        <div className={cn(
          "flex-1 min-w-0 transition-all duration-300",
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
            aria-label="Ouvrir l'analyste IA"
          >
            <Sparkles className="size-5" />
            <span className="text-sm font-medium">Analyste IA</span>
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
          aria-label="Ouvrir l'analyste IA"
        >
          <Sparkles className="size-5" />
          <span className="text-sm font-medium">Analyste IA</span>
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
