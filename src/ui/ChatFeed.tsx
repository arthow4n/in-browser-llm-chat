import React, { useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { chatAutoScrollMachine } from "../machines/chatAutoScrollMachine";
import { ChatMessage } from "./ChatMessage";
import { MessageStore } from "../db/db";
import { CoordinatorEvent } from "../workflow/parentCoordinator";

interface ChatFeedProps {
  messages: MessageStore[];
  send: (event: CoordinatorEvent) => void;
  currentThreadId: string | null;
  draftAnswers: Record<string, unknown>;
  budgetExceededCard?: React.ReactNode;
  errorBubble?: React.ReactNode;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({
  messages,
  send,
  currentThreadId,
  draftAnswers,
  budgetExceededCard,
  errorBubble,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [state, scrollSend] = useMachine(chatAutoScrollMachine);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    if (state.matches("enabled")) {
      scrollToBottom();
    }
  }, [messages, state]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const isAtBottom = scrollHeight - scrollTop <= clientHeight + 50;

    if (isAtBottom) {
      scrollSend({ type: "USER_SCROLLED_TO_BOTTOM" });
    } else {
      scrollSend({ type: "USER_SCROLLED_UP" });
    }
  };

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--cds-background)",
      }}
    >
      {messages.length === 0 ? (
        <div style={{ textAlign: "center", marginTop: "2rem", color: "var(--cds-text-disabled)" }}>
          No messages yet. Start a conversation!
        </div>
      ) : (
        <>
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              allMessages={messages}
              send={send}
              currentThreadId={currentThreadId!}
              draftAnswers={draftAnswers}
            />
          ))}
          {budgetExceededCard}
          {errorBubble}
        </>
      )}
    </div>
  );
};
