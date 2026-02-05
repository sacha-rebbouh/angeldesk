"use client";

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Send, MessageSquare, Loader2, Sparkles } from "lucide-react";

import Markdown from "react-markdown";

import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

// ============================================================================
// TYPES
// ============================================================================

interface DealChatPanelProps {
  dealId: string;
  dealName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMessageData {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  intent: string | null;
  createdAt: string;
}

interface ConversationData {
  id: string;
  title: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

interface ConversationsResponse {
  data: {
    conversations: ConversationData[];
    hasContext: boolean;
    contextVersion: number;
  };
}

interface SendMessageResponse {
  data: {
    conversationId: string;
    isNewConversation: boolean;
    userMessageId: string;
    assistantMessageId: string;
    response: string;
  };
}

interface ConversationWithMessages {
  id: string;
  title: string | null;
  messages: ChatMessageData[];
}

// ============================================================================
// QUICK ACTIONS CONFIG
// ============================================================================

const QUICK_ACTIONS = [
  {
    label: "Explique-moi les red flags",
    prompt: "Explique-moi les red flags identifies dans cette analyse.",
  },
  {
    label: "Compare aux benchmarks",
    prompt: "Compare ce deal aux benchmarks du secteur.",
  },
  {
    label: "Questions au fondateur",
    prompt: "Quelles questions devrais-je poser au fondateur?",
  },
  {
    label: "Resume l'analyse",
    prompt: "Resume les points cles de l'analyse de ce deal.",
  },
] as const;

// ============================================================================
// CHAT MESSAGE COMPONENT
// ============================================================================

interface ChatMessageProps {
  message: ChatMessageData;
}

const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "USER";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-[0.9375rem] [&_h4]:text-sm">
            <Markdown>{message.content}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// TYPING INDICATOR COMPONENT
// ============================================================================

const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
          <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
          <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// QUICK ACTIONS COMPONENT
// ============================================================================

interface QuickActionsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

const QuickActions = memo(function QuickActions({
  onSelect,
  disabled,
}: QuickActionsProps) {
  const handleClick = useCallback(
    (prompt: string) => {
      if (!disabled) {
        onSelect(prompt);
      }
    },
    [onSelect, disabled]
  );

  return (
    <div className="flex flex-wrap gap-2 px-4 py-3 border-t bg-muted/30">
      <div className="flex w-full items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Sparkles className="size-3" />
        <span>Suggestions</span>
      </div>
      {QUICK_ACTIONS.map((action) => (
        <Button
          key={action.label}
          variant="outline"
          size="sm"
          onClick={() => handleClick(action.prompt)}
          disabled={disabled}
          className="h-auto py-1.5 px-3 text-xs font-normal"
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
});

// ============================================================================
// CHAT INPUT COMPONENT
// ============================================================================

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  disabled?: boolean;
}

const ChatInput = memo(function ChatInput({
  value,
  onChange,
  onSend,
  isSending,
  disabled,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !isSending && !disabled) {
          onSend();
        }
      }
    },
    [value, isSending, disabled, onSend]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleSendClick = useCallback(() => {
    if (value.trim() && !isSending && !disabled) {
      onSend();
    }
  }, [value, isSending, disabled, onSend]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [value]);

  return (
    <div className="flex items-end gap-2 border-t p-4 bg-background">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Posez une question sur ce deal..."
        disabled={isSending || disabled}
        className="min-h-10 max-h-[120px] resize-none py-2.5"
        rows={1}
      />
      <Button
        onClick={handleSendClick}
        disabled={!value.trim() || isSending || disabled}
        size="icon"
        className="shrink-0"
      >
        {isSending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
      </Button>
    </div>
  );
});

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

interface EmptyStateProps {
  dealName: string;
}

const EmptyState = memo(function EmptyState({ dealName }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
      <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <MessageSquare className="size-6 text-primary" />
      </div>
      <h3 className="font-semibold text-lg mb-2">Chat IA</h3>
      <p className="text-sm text-muted-foreground max-w-[280px]">
        Posez des questions sur l'analyse de{" "}
        <span className="font-medium text-foreground">{dealName}</span>.
        Utilisez les suggestions ci-dessous pour commencer.
      </p>
    </div>
  );
});

// ============================================================================
// MAIN DEAL CHAT PANEL COMPONENT
// ============================================================================

interface ConversationMessagesResponse {
  data: {
    conversation: {
      id: string;
      messages: ChatMessageData[];
    };
  };
}

export const DealChatPanel = memo(function DealChatPanel({
  dealId,
  dealName,
  isOpen,
  onClose,
}: DealChatPanelProps) {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<ChatMessageData[]>([]);

  // Fetch conversations for this deal
  const { data: conversationsData, isLoading: isLoadingConversations } =
    useQuery<ConversationsResponse>({
      queryKey: queryKeys.chat.conversations(dealId),
      queryFn: async () => {
        const response = await fetch(`/api/chat/${dealId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch conversations");
        }
        return response.json();
      },
      enabled: isOpen,
      staleTime: 30_000,
    });

  // Get latest conversation or create new
  const latestConversation = useMemo(() => {
    if (!conversationsData?.data?.conversations?.length) return null;
    return conversationsData.data.conversations[0];
  }, [conversationsData]);

  // Set active conversation when data loads
  useEffect(() => {
    if (latestConversation && !activeConversationId) {
      setActiveConversationId(latestConversation.id);
    }
  }, [latestConversation, activeConversationId]);

  // Fetch persisted messages for the active conversation
  const { data: conversationData, isLoading: isLoadingMessages } =
    useQuery<ConversationMessagesResponse>({
      queryKey: queryKeys.chat.messages(dealId, activeConversationId ?? ""),
      queryFn: async () => {
        const response = await fetch(
          `/api/chat/${dealId}?conversationId=${activeConversationId}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch messages");
        }
        return response.json();
      },
      enabled: isOpen && !!activeConversationId,
      staleTime: 30_000,
    });

  // Merge persisted messages with optimistic pending messages
  const allMessages = useMemo(() => {
    const persisted: ChatMessageData[] =
      conversationData?.data?.conversation?.messages?.map((m) => ({
        ...m,
        createdAt: typeof m.createdAt === "string" ? m.createdAt : new Date(m.createdAt).toISOString(),
      })) ?? [];
    const persistedIds = new Set(persisted.map((m) => m.id));
    // Only add pending messages that aren't already in persisted data
    const newPending = pendingMessages.filter((m) => !persistedIds.has(m.id));
    return [...persisted, ...newPending];
  }, [conversationData, pendingMessages]);

  // Send message mutation
  const sendMessageMutation = useMutation<
    SendMessageResponse,
    Error,
    { message: string }
  >({
    mutationFn: async ({ message }) => {
      const response = await fetch(`/api/chat/${dealId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          message,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      return response.json();
    },
    onMutate: async ({ message }) => {
      // Optimistic update: add user message immediately
      const optimisticUserMessage: ChatMessageData = {
        id: `temp-user-${Date.now()}`,
        role: "USER",
        content: message,
        intent: null,
        createdAt: new Date().toISOString(),
      };
      setPendingMessages((prev) => [...prev, optimisticUserMessage]);
    },
    onSuccess: (response) => {
      const { conversationId, isNewConversation } = response.data;

      // Set active conversation if this was a new one
      if (!activeConversationId || isNewConversation) {
        setActiveConversationId(conversationId);
      }

      // Clear pending messages and refresh from server
      setPendingMessages([]);
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.messages(dealId, conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations(dealId),
      });
    },
    onError: () => {
      // Remove optimistic message on error
      setPendingMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
    },
  });

  // Scroll to bottom on open and when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [allMessages, sendMessageMutation.isPending, isOpen]);

  // Handle send message
  const handleSendMessage = useCallback(() => {
    const message = inputValue.trim();
    if (!message) return;

    setInputValue("");
    sendMessageMutation.mutate({ message });
  }, [inputValue, sendMessageMutation]);

  // Handle input change
  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
  }, []);

  // Handle quick action select
  const handleQuickActionSelect = useCallback(
    (prompt: string) => {
      setInputValue(prompt);
    },
    []
  );

  // Don't render if not open
  if (!isOpen) return null;

  const isLoading = isLoadingConversations || isLoadingMessages;
  const hasMessages = allMessages.length > 0;
  const isSending = sendMessageMutation.isPending;

  return (
    <Card
      className={cn(
        "fixed right-4 top-20 bottom-4 w-[40%] min-w-[360px] max-w-[600px]",
        "flex flex-col z-50 shadow-lg border bg-background py-0 gap-0"
      )}
    >
      {/* Header */}
      <CardHeader className="border-b px-4 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-5 text-primary" />
            <CardTitle className="text-base font-semibold">Chat IA</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Fermer le chat"
          >
            <X className="size-4" />
          </Button>
        </div>
        {dealName && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {dealName}
          </p>
        )}
      </CardHeader>

      {/* Messages area */}
      <CardContent className="flex-1 overflow-y-auto p-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : hasMessages ? (
          <div className="flex flex-col gap-3 p-4">
            {allMessages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isSending && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <EmptyState dealName={dealName} />
        )}
      </CardContent>

      {/* Quick actions (show only when no messages or always) */}
      {!hasMessages && (
        <QuickActions
          onSelect={handleQuickActionSelect}
          disabled={isSending}
        />
      )}

      {/* Input area */}
      <ChatInput
        value={inputValue}
        onChange={handleInputChange}
        onSend={handleSendMessage}
        isSending={isSending}
        disabled={isLoadingConversations}
      />
    </Card>
  );
});

// ============================================================================
// CHAT TOGGLE BUTTON COMPONENT
// ============================================================================

interface ChatToggleButtonProps {
  onClick: () => void;
  isOpen: boolean;
}

export const ChatToggleButton = memo(function ChatToggleButton({
  onClick,
  isOpen,
}: ChatToggleButtonProps) {
  if (isOpen) return null;

  return (
    <Button
      onClick={onClick}
      size="lg"
      className="fixed right-4 bottom-4 z-40 h-14 w-14 rounded-full shadow-lg"
      aria-label="Ouvrir le chat IA"
    >
      <MessageSquare className="size-6" />
    </Button>
  );
});
