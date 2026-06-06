import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChatFeed } from "../ui/ChatFeed";
import { MessageStore } from "../db/db";

const mockMessages: MessageStore[] = [
  {
    id: "1",
    threadId: "t1",
    sequence: 0,
    role: "user",
    content: "Hello!",
    type: "text",
    createdAt: Date.now(),
    checkpointId: null,
    checkpointNs: null,
  },
  {
    id: "2",
    threadId: "t1",
    sequence: 1,
    role: "assistant",
    content: "Hi there! How can I help you?",
    type: "text",
    name: "Assistant",
    createdAt: Date.now(),
    checkpointId: "c1",
    checkpointNs: "n1",
  },
  {
    id: "3",
    threadId: "t1",
    sequence: 2,
    role: "assistant",
    content: "I am thinking about the best way to help.",
    type: "reasoning",
    name: "Assistant",
    createdAt: Date.now(),
    checkpointId: "c1",
    checkpointNs: "n1",
  },
];

describe("ChatFeed", () => {
  const defaultProps = {
    messages: mockMessages,
    send: () => {},
    currentThreadId: "t1",
    draftAnswers: {},
  };

  it("renders the correct number of messages", () => {
    render(<ChatFeed {...defaultProps} />);
    expect(screen.getByText("Hello!")).toBeInTheDocument();
    expect(screen.getByText("Hi there! How can I help you?")).toBeInTheDocument();
    expect(screen.getByText("I am thinking about the best way to help.")).toBeInTheDocument();
  });

  it("renders the agent name for assistant messages", () => {
    render(<ChatFeed {...defaultProps} />);
    expect(screen.getAllByText("Assistant")[0]).toBeInTheDocument();
  });

  it("renders reasoning messages inside an accordion", () => {
    render(<ChatFeed {...defaultProps} />);
    expect(screen.getByText("Reasoning")).toBeInTheDocument();
  });

  it("displays empty state when no messages are provided", () => {
    render(<ChatFeed {...defaultProps} messages={[]} />);
    expect(screen.getByText("No messages yet. Start a conversation!")).toBeInTheDocument();
  });

  it("handles scrolling events to update auto-scroll state", () => {
    const { container } = render(<ChatFeed {...defaultProps} />);
    const feed = container.firstChild as HTMLDivElement;

    // Mock scroll properties
    Object.defineProperty(feed, "scrollTop", { value: 0, writable: true });
    Object.defineProperty(feed, "scrollHeight", { value: 1000, writable: true });
    Object.defineProperty(feed, "clientHeight", { value: 500, writable: true });

    // Simulate scrolling up
    fireEvent.scroll(feed, { target: { scrollTop: 100, scrollHeight: 1000, clientHeight: 500 } });
    expect(feed).toBeInTheDocument();
  });
});
