import React, { useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { chatAutoScrollMachine } from "../machines/chatAutoScrollMachine";
import { ChatMessage } from "./ChatMessage";
import { MessageStore } from "../db/db";

interface ChatFeedProps {
  messages: MessageStore[];
}

export const ChatFeed: React.FC<ChatFeedProps> = ({ messages }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [state, send] = useMachine(chatAutoScrollMachine);

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
      send({ type: "USER_SCROLLED_TO_BOTTOM" });
    } else {
      send({ type: "USER_SCROLLED_UP" });
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
        messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
      )}
    </div>
  );
};
