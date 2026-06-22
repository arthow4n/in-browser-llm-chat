import { useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { chatFeedScrollMachine } from "./chat-feed-scroll-machine";

export function useChatFeedAutoScroll(messagesCount: number, isStreaming: boolean) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const providedMachine = chatFeedScrollMachine.provide({
    actions: {
      scrollToBottom: () => {
        if (containerRef.current) {
          containerRef.current.scrollTo({
            top: containerRef.current.scrollHeight,
            behavior: "smooth",
          });
        }
      },
    },
  });

  const [state, send] = useMachine(providedMachine);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Check if user is near bottom (e.g., within 15px)
    const isNearBottom = scrollHeight - scrollTop - clientHeight <= 15;
    send({ type: "SCROLL_EVENT", isNearBottom });
  };

  // Trigger scroll to bottom on new message or new tokens if we are locked to bottom
  useEffect(() => {
    if (messagesCount > 0) {
      send({ type: "NEW_MESSAGE" });
    }
  }, [messagesCount, send]);

  useEffect(() => {
    if (isStreaming) {
      send({ type: "NEW_TOKEN" });
    }
  }, [isStreaming, send]);

  const scrollToBottom = () => {
    send({ type: "SCROLL_TO_BOTTOM_CLICKED" });
  };

  return {
    containerRef,
    handleScroll,
    isAtBottom: state.context.isAtBottom,
    scrollToBottom,
  };
}
