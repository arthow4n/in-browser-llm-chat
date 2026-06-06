import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChatInputArea, type ParentState } from "./ChatInputArea";
import { type CoordinatorContext } from "../../workflow/parentCoordinator";

describe("ChatInputArea", () => {
  const mockParentSend =
    vi.fn<(event: import("../../workflow/parentCoordinator").CoordinatorEvent) => void>();
  function createMockState(value: unknown, context?: Partial<CoordinatorContext>): ParentState {
    return {
      value,
      context: {
        currentThreadId: "test-thread-id",
        loopControl: { activeInterrupt: null },
        ...context,
      } as CoordinatorContext,
      matches: function (val: import("xstate").StateValue) {
        if (typeof val === "object" && val !== null) {
          const key = Object.keys(val)[0];
          const typedValue = this.value as Record<string, unknown>;
          const typedVal = val as Record<string, unknown>;
          return typedValue[key] === typedVal[key];
        }
        return false;
      },
    };
  }

  const defaultParentState = createMockState({
    ViewState: "chatting",
    ExecutionState: "inactive",
  });

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
    const onboardingState = createMockState({
      ViewState: "onboarding",
      ExecutionState: "inactive",
    });
    render(<ChatInputArea parentState={onboardingState} parentSend={mockParentSend} />);
    expect(screen.getByLabelText(/Message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /Send/i })).toBeDisabled();
  });

  it("should be disabled when ExecutionState is executing", () => {
    const executingState = createMockState({
      ViewState: "chatting",
      ExecutionState: "executing",
    });
    render(<ChatInputArea parentState={executingState} parentSend={mockParentSend} />);
    expect(screen.getByLabelText(/Message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /Send/i })).toBeDisabled();
  });

  it("should be disabled when ExecutionState is awaitingHumanInput", () => {
    const awaitingState = createMockState(
      {
        ViewState: "chatting",
        ExecutionState: "awaitingHumanInput",
      },
      {
        loopControl: {
          currentRound: 0,
          turnCount: 0,
          tokenStats: null,
          activeInterrupt: { type: "approval" },
        },
      },
    );
    render(<ChatInputArea parentState={awaitingState} parentSend={mockParentSend} />);
    expect(screen.getByLabelText(/Message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /Send/i })).toBeDisabled();
  });
});
