import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MessageBubbleComponent } from "./message-bubble-component";
import type { Message } from "../db/db-schema";

describe("MessageBubbleComponent", () => {
  const createMockMessage = (overrides: Partial<Message> = {}): Message => {
    return {
      id: "mock-message-id",
      threadId: "mock-thread-id",
      sequence: 1,
      role: "user",
      content: "Hello, this is standard text.",
      type: "text",
      createdAt: Date.now(),
      checkpointId: null,
      checkpointNs: null,
      ...overrides,
    };
  };

  it("renders basic user message text", () => {
    const message = createMockMessage({ role: "user", content: "Hello World" });
    render(<MessageBubbleComponent message={message} />);

    expect(screen.getByTestId("message-row-mock-message-id")).toBeInTheDocument();
    expect(screen.getByTestId("message-bubble-mock-message-id")).toHaveClass("user");
    expect(screen.getByTestId("message-sender-mock-message-id")).toHaveTextContent("User");
    expect(screen.getByTestId("message-content-mock-message-id")).toHaveTextContent("Hello World");
  });

  it("renders assistant message with custom agent name", () => {
    const message = createMockMessage({
      role: "assistant",
      name: "Debater 1",
      content: "I disagree.",
    });
    render(<MessageBubbleComponent message={message} />);

    expect(screen.getByTestId("message-bubble-mock-message-id")).toHaveClass("assistant");
    expect(screen.getByTestId("message-sender-mock-message-id")).toHaveTextContent("Debater 1");
    expect(screen.getByTestId("message-content-mock-message-id")).toHaveTextContent("I disagree.");
  });

  it("renders markdown properly", () => {
    const message = createMockMessage({
      role: "assistant",
      content: "This is **bold** text and a [link](https://example.com).",
    });
    render(<MessageBubbleComponent message={message} />);

    const contentEl = screen.getByTestId("message-content-mock-message-id");
    const strongEl = contentEl.querySelector("strong");
    const linkEl = contentEl.querySelector("a");

    expect(strongEl).toBeInTheDocument();
    expect(strongEl).toHaveTextContent("bold");
    expect(linkEl).toBeInTheDocument();
    expect(linkEl).toHaveAttribute("href", "https://example.com");
    expect(linkEl).toHaveAttribute("target", "_blank");
  });

  it("renders LaTeX block math", () => {
    const message = createMockMessage({
      role: "assistant",
      content: "Here is a formula: $$E = mc^2$$",
    });
    render(<MessageBubbleComponent message={message} />);

    const contentEl = screen.getByTestId("message-content-mock-message-id");
    // Katex math elements have class names like 'katex'
    const katexEl = contentEl.querySelector(".katex");
    expect(katexEl).toBeInTheDocument();
  });

  it("renders reasoning bubble with thinking indicator", () => {
    const message = createMockMessage({
      role: "assistant",
      type: "reasoning",
      content: "I need to calculate 2+2.",
    });
    render(<MessageBubbleComponent message={message} />);

    expect(screen.getByTestId("message-bubble-mock-message-id")).toHaveClass("reasoning-bubble");
    expect(screen.getByText("Thinking Process")).toBeInTheDocument();
  });

  it("should debounce rendering text while streaming", async () => {
    vi.useFakeTimers();
    const message = createMockMessage({
      role: "assistant",
      content: "Hello",
    });
    const { rerender } = render(<MessageBubbleComponent message={message} isStreaming={true} />);

    // Initially, it starts streaming, rawText is "", debouncedText is ""
    expect(screen.getByTestId("message-content-mock-message-id")).toHaveTextContent("");

    // Simulate token chunks arriving by updating message content prop
    const message2 = { ...message, content: "Hello World" };
    rerender(<MessageBubbleComponent message={message2} isStreaming={true} />);

    // Should still be debouncing
    expect(screen.getByTestId("message-content-mock-message-id")).toHaveTextContent("");

    // Fast-forward time to trigger debounce render
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByTestId("message-content-mock-message-id")).toHaveTextContent("Hello World");

    // End streaming
    rerender(<MessageBubbleComponent message={message2} isStreaming={false} />);
    expect(screen.getByTestId("message-content-mock-message-id")).toHaveTextContent("Hello World");
    vi.useRealTimers();
  });

  it("renders avatar initials and header bar", () => {
    const message = createMockMessage({
      role: "assistant",
      name: "Debater A",
      content: "Hello",
    });
    render(<MessageBubbleComponent message={message} />);

    expect(screen.getByTestId("message-header-mock-message-id")).toBeInTheDocument();
    expect(screen.getByTestId("message-avatar-mock-message-id")).toHaveTextContent("DE");
  });

  it("renders nested tool calls", () => {
    const message = createMockMessage({
      role: "assistant",
      name: "Debater A",
      content: "Hello",
    });
    const nestedTools: Message[] = [
      {
        id: "tool-msg-1",
        threadId: "mock-thread-id",
        sequence: 2,
        role: "tool" as const,
        content: "Tool result content",
        type: "tool_result" as const,
        toolCallId: "call-1",
        name: "test_tool",
        createdAt: Date.now(),
        checkpointId: null,
        checkpointNs: null,
      },
    ];

    render(<MessageBubbleComponent message={message} nestedTools={nestedTools} />);

    expect(screen.getByTestId("nested-tools-mock-message-id")).toBeInTheDocument();
    expect(screen.getByTestId("nested-tool-tool-msg-1")).toBeInTheDocument();
    expect(screen.getByText("test_tool")).toBeInTheDocument();
    expect(screen.getByText("Tool result content")).toBeInTheDocument();
  });
});
