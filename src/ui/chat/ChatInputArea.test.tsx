import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChatInputArea } from "./ChatInputArea";

describe("ChatInputArea", () => {
  const mockParentSend = vi.fn();
  const defaultParentState: any = {
    value: {
      ViewState: "chatting",
      ExecutionState: "inactive",
    },
    context: {
      currentThreadId: "test-thread-id",
      loopControl: {
        activeInterrupt: null,
      },
    },
  };

  it("should render correctly", () => {
    render(<ChatInputArea parentState={defaultParentState} parentSend={mockParentSend} />);
    expect(screen.getByLabelText(/Message/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send/i })).toBeInTheDocument();
  });

  it("should update text on change", () => {
    render(<ChatInputArea parentState={defaultParentState} parentSend={mockParentSend} />);
    const input = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Hello world" } });
    expect(input.value).toBe("Hello world");
  });

  it("should call parentSend on submit", () => {
    render(<ChatInputArea parentState={defaultParentState} parentSend={mockParentSend} />);
    const input = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Hello world" } });

    const sendButton = screen.getByRole("button", { name: /Send/i });
    fireEvent.click(sendButton);

    expect(mockParentSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SUBMIT_MESSAGE",
        message: expect.objectContaining({
          content: "Hello world",
          threadId: "test-thread-id",
        }),
      }),
    );
  });

  it("should be disabled when ViewState is onboarding", () => {
    const onboardingState = {
      ...defaultParentState,
      value: {
        ...defaultParentState.value,
        ViewState: "onboarding",
      },
    };
    render(<ChatInputArea parentState={onboardingState} parentSend={mockParentSend} />);
    expect(screen.getByLabelText(/Message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /Send/i })).toBeDisabled();
  });

  it("should be disabled when ExecutionState is executing", () => {
    const executingState = {
      ...defaultParentState,
      value: {
        ...defaultParentState.value,
        ExecutionState: "executing",
      },
    };
    render(<ChatInputArea parentState={executingState} parentSend={mockParentSend} />);
    expect(screen.getByLabelText(/Message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /Send/i })).toBeDisabled();
  });

  it("should be disabled when ExecutionState is awaitingHumanInput and no input interrupt", () => {
    const awaitingState = {
      ...defaultParentState,
      value: {
        ...defaultParentState.value,
        ExecutionState: "awaitingHumanInput",
      },
      context: {
        ...defaultParentState.context,
        loopControl: {
          activeInterrupt: { type: "approval" },
        },
      },
    };
    render(<ChatInputArea parentState={awaitingState} parentSend={mockParentSend} />);
    expect(screen.getByLabelText(/Message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /Send/i })).toBeDisabled();
  });

  it("should be enabled when ExecutionState is awaitingHumanInput and input interrupt", () => {
    const awaitingInputState = {
      ...defaultParentState,
      value: {
        ...defaultParentState.value,
        ExecutionState: "awaitingHumanInput",
      },
      context: {
        ...defaultParentState.context,
        loopControl: {
          activeInterrupt: { type: "input" },
        },
      },
    };
    render(<ChatInputArea parentState={awaitingInputState} parentSend={mockParentSend} />);
    const input = screen.getByLabelText(/Message/i) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Hello" } });
    expect(input).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Send/i })).not.toBeDisabled();
  });
});
