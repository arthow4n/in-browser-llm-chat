import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useChatFeedAutoScroll } from "./use-chat-feed-auto-scroll";

describe("useChatFeedAutoScroll hook", () => {
  it("should return containerRef, isAtBottom, and scrollToBottom handler", () => {
    const { result } = renderHook(() => useChatFeedAutoScroll(0, false));
    expect(result.current.containerRef).toBeDefined();
    expect(result.current.isAtBottom).toBe(true);
    expect(typeof result.current.handleScroll).toBe("function");
    expect(typeof result.current.scrollToBottom).toBe("function");
  });

  it("should handle scroll events and update isAtBottom", () => {
    const { result } = renderHook(() => useChatFeedAutoScroll(0, false));

    // Mock container element
    const container = document.createElement("div");
    Object.defineProperty(container, "scrollHeight", { value: 500, writable: true });
    Object.defineProperty(container, "clientHeight", { value: 200, writable: true });
    Object.defineProperty(container, "scrollTop", { value: 100, writable: true });

    result.current.containerRef.current = container;

    // Trigger scroll event further up
    act(() => {
      result.current.handleScroll();
    });

    expect(result.current.isAtBottom).toBe(false);

    // Scroll to bottom
    Object.defineProperty(container, "scrollTop", { value: 300, writable: true });
    act(() => {
      result.current.handleScroll();
    });

    expect(result.current.isAtBottom).toBe(true);
  });
});
