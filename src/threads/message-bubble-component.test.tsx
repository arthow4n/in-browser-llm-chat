import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MessageBubbleComponent } from "./message-bubble-component";
import type { Message } from "../db/db-schema";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-router");
  return {
    ...actual,
    useNavigate: () => vi.fn<(path: string) => void>(),
  };
});

vi.mock("../db/db-operations", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../db/db-operations");
  return {
    ...actual,
    editMessageAndRollback: vi.fn<() => Promise<void>>(),
    deleteMessageAndRollback: vi.fn<() => Promise<void>>(),
    branchThread: vi.fn<() => Promise<string>>(),
  };
});

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

  it("renders nested ask_questions tool calls using AskQuestionsComponent", () => {
    const message = createMockMessage({
      role: "assistant",
      name: "Debater A",
      content: "Hello",
    });
    const nestedTools: Message[] = [
      {
        id: "call-msg-1",
        threadId: "mock-thread-id",
        sequence: 2,
        role: "assistant" as const,
        content: JSON.stringify({
          questions: [
            {
              id: "q1",
              text: "Is this correct?",
              type: "single-select",
              options: ["Yes", "No"],
              required: true,
            },
          ],
        }),
        type: "tool_call" as const,
        toolCallId: "call-1",
        name: "ask_questions",
        createdAt: Date.now(),
        checkpointId: null,
        checkpointNs: null,
      },
      {
        id: "result-msg-1",
        threadId: "mock-thread-id",
        sequence: 3,
        role: "tool" as const,
        content: JSON.stringify({
          answers: {
            q1: { selected: ["Yes"] },
          },
        }),
        type: "tool_result" as const,
        toolCallId: "call-1",
        name: "ask_questions",
        createdAt: Date.now(),
        checkpointId: null,
        checkpointNs: null,
      },
    ];

    render(<MessageBubbleComponent message={message} nestedTools={nestedTools} />);

    // Should render AskQuestionsComponent in submitted state
    expect(screen.getByText("Interactive Questionnaire")).toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText(/Is this correct\?/)).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("renders generic proposal action cards for declare_consensus tool call and result", () => {
    const message = createMockMessage({
      role: "assistant",
      name: "Debater A",
      content: "Hello",
    });
    const nestedTools: Message[] = [
      {
        id: "call-msg-2",
        threadId: "mock-thread-id",
        sequence: 2,
        role: "assistant" as const,
        content: JSON.stringify({
          reason: "consensus reached",
        }),
        type: "tool_call" as const,
        toolCallId: "call-2",
        name: "declare_consensus",
        createdAt: Date.now(),
        checkpointId: null,
        checkpointNs: null,
      },
      {
        id: "result-msg-2",
        threadId: "mock-thread-id",
        sequence: 3,
        role: "tool" as const,
        content: JSON.stringify({
          approved: true,
        }),
        type: "tool_result" as const,
        toolCallId: "call-2",
        name: "declare_consensus",
        createdAt: Date.now(),
        checkpointId: null,
        checkpointNs: null,
      },
    ];

    render(<MessageBubbleComponent message={message} nestedTools={nestedTools} />);

    expect(screen.getByText("Proposal: declare_consensus")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText(/"consensus reached"/)).toBeInTheDocument();
  });

  describe("Message Action & Editor UI Actions", () => {
    it("renders options menu when clicking action trigger button", async () => {
      const message = createMockMessage({
        id: "msg-test-1",
        role: "user",
        content: "Editable content",
      });

      render(
        <MessageBubbleComponent
          message={message}
          threadStatus="inactive"
          allMessages={[message]}
        />,
      );

      const trigger = screen.getByTestId("message-actions-btn-msg-test-1");
      expect(trigger).toBeInTheDocument();

      // Open menu
      await act(async () => {
        trigger.click();
      });

      expect(screen.getByTestId("message-actions-menu-msg-test-1")).toBeInTheDocument();
      expect(screen.getByTestId("message-action-edit-msg-test-1")).toBeInTheDocument();
      expect(screen.getByTestId("message-action-delete-msg-test-1")).toBeInTheDocument();
      expect(screen.getByTestId("message-action-branch-msg-test-1")).toBeInTheDocument();
    });

    it("disables edit/delete/branch and shows tooltip when message is compacted", async () => {
      // Setup message with null checkpoint, but thread has checkpoints elsewhere
      const message = createMockMessage({
        id: "msg-test-2",
        role: "user",
        sequence: 1, // sequence > 0
        checkpointId: null,
        checkpointNs: null,
      });

      const messageWithCp = createMockMessage({
        id: "msg-with-cp",
        role: "assistant",
        sequence: 2,
        checkpointId: "cp-1",
        checkpointNs: "ns-1",
      });

      render(
        <MessageBubbleComponent
          message={message}
          threadStatus="inactive"
          allMessages={[message, messageWithCp]}
        />,
      );

      const trigger = screen.getByTestId("message-actions-btn-msg-test-2");
      await act(async () => {
        trigger.click();
      });

      const editBtn = screen.getByTestId("message-action-edit-msg-test-2");
      const deleteBtn = screen.getByTestId("message-action-delete-msg-test-2");
      const branchBtn = screen.getByTestId("message-action-branch-msg-test-2");

      expect(editBtn).toBeDisabled();
      expect(deleteBtn).toBeDisabled();
      expect(branchBtn).toBeDisabled();

      expect(
        screen.getAllByText("Historical checkpoints for this message have been compacted")[0],
      ).toBeInTheDocument();
    });

    it("activates editing mode when edit is clicked", async () => {
      const message = createMockMessage({
        id: "msg-test-3",
        role: "user",
        content: "Hello original",
      });

      render(
        <MessageBubbleComponent
          message={message}
          threadStatus="inactive"
          allMessages={[message]}
        />,
      );

      const trigger = screen.getByTestId("message-actions-btn-msg-test-3");
      await act(async () => {
        trigger.click();
      });

      const editBtn = screen.getByTestId("message-action-edit-msg-test-3");
      await act(async () => {
        editBtn.click();
      });

      // Menu should close, and editor textarea should appear
      expect(screen.queryByTestId("message-actions-menu-msg-test-3")).not.toBeInTheDocument();
      expect(screen.getByTestId("message-editor-textarea-msg-test-3")).toBeInTheDocument();
      expect(screen.getByTestId("message-editor-textarea-msg-test-3")).toHaveValue(
        "Hello original",
      );
    });

    it("shows discard modal on cancel when message content is edited", async () => {
      const message = createMockMessage({
        id: "msg-test-4",
        role: "user",
        content: "Hello original",
      });

      render(
        <MessageBubbleComponent
          message={message}
          threadStatus="inactive"
          allMessages={[message]}
        />,
      );

      const trigger = screen.getByTestId("message-actions-btn-msg-test-4");
      await act(async () => {
        trigger.click();
      });

      const editBtn = screen.getByTestId("message-action-edit-msg-test-4");
      await act(async () => {
        editBtn.click();
      });

      const textarea = screen.getByTestId("message-editor-textarea-msg-test-4");
      const cancelBtn = screen.getByTestId("message-editor-cancel-msg-test-4");

      // Edit content
      await act(async () => {
        fireEvent.change(textarea, { target: { value: "Hello modified" } });
      });

      await act(async () => {
        cancelBtn.click();
      });

      expect(screen.getByTestId("modal-discard-msg-test-4")).toBeInTheDocument();
    });

    it("renders branch modal when branch is clicked", async () => {
      const message = createMockMessage({
        id: "msg-test-5",
        role: "user",
        content: "Brancheable message",
      });

      render(
        <MessageBubbleComponent
          message={message}
          threadStatus="inactive"
          threadTitle="Super Chat"
          allMessages={[message]}
        />,
      );

      const trigger = screen.getByTestId("message-actions-btn-msg-test-5");
      await act(async () => {
        trigger.click();
      });

      const branchBtn = screen.getByTestId("message-action-branch-msg-test-5");
      await act(async () => {
        branchBtn.click();
      });

      expect(screen.getByTestId("modal-branch-msg-test-5")).toBeInTheDocument();
      expect(screen.getByTestId("modal-branch-input-msg-test-5")).toHaveValue(
        "Branch of Super Chat",
      );
    });

    it("renders delete modal when delete is clicked", async () => {
      const message = createMockMessage({
        id: "msg-test-6",
        role: "user",
        content: "Deletable message",
      });

      render(
        <MessageBubbleComponent
          message={message}
          threadStatus="inactive"
          allMessages={[message]}
        />,
      );

      const trigger = screen.getByTestId("message-actions-btn-msg-test-6");
      await act(async () => {
        trigger.click();
      });

      const deleteBtn = screen.getByTestId("message-action-delete-msg-test-6");
      await act(async () => {
        deleteBtn.click();
      });

      expect(screen.getByTestId("modal-delete-msg-test-6")).toBeInTheDocument();
    });
  });
});
