import React from "react";
import { useMachine } from "@xstate/react";
import { Button, Dropdown, TextArea } from "@carbon/react";
import { Send } from "@carbon/icons-react";
import { chatInputMachine } from "./chatInputMachine";
import { type CoordinatorEvent, type CoordinatorContext } from "../../workflow/parentCoordinator";
import { v4 as uuidv4 } from "uuid";

interface ParentState {
  value: unknown;
  context: CoordinatorContext;
}

interface ChatInputAreaProps {
  parentState: ParentState;
  parentSend: (event: CoordinatorEvent) => void;
}

export function ChatInputArea({ parentState, parentSend }: ChatInputAreaProps) {
  const [state, send] = useMachine(chatInputMachine);

  const { text, role } = state.context;

  // Determine if the input should be disabled
  const viewState = (parentState.value as Record<string, unknown>)?.ViewState as string;
  const executionState = (parentState.value as Record<string, unknown>)?.ExecutionState as string;

  const isDisabled =
    viewState === "onboarding" ||
    executionState === "executing" ||
    executionState === "checkingStatus" ||
    (executionState === "awaitingHumanInput" &&
      (parentState.context.loopControl.activeInterrupt as { type: string })?.type !== "input");

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    send({ type: "UPDATE_TEXT", text: e.target.value });
  };

  const handleRoleChange = (data: unknown) => {
    const item = data as { item?: { value: string }; value?: string };
    const value = item.item?.value || item.value;
    if (value) {
      send({ type: "UPDATE_ROLE", role: value as "User" | "Assistant" | "System" });
    }
  };

  const roleItems = [
    { id: "User", value: "User", label: "User" },
    { id: "Assistant", value: "Assistant", label: "Assistant" },
    { id: "System", value: "System", label: "System" },
  ];

  const handleSend = async () => {
    if (!text.trim()) return;

    const threadId = parentState.context.currentThreadId;
    if (!threadId) {
      console.error("No active thread selected");
      return;
    }

    const message = {
      id: uuidv4(),
      threadId,
      sequence: 0,
      role: role === "User" ? "user" : role === "Assistant" ? "assistant" : "system",
      content: text,
      type: "text",
      createdAt: Date.now(),
      metadata: {},
      checkpointId: null,
      checkpointNs: null,
      name: role,
    };

    parentSend({ type: "SUBMIT_MESSAGE", message: message as CoordinatorEvent["message"] });
    send({ type: "RESET" });
  };

  return (
    <div
      style={{
        padding: "1rem",
        borderTop: "1px solid #ddd",
        backgroundColor: "var(--cds-background, #fff)",
      }}
    >
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          display: "flex",
          gap: "0.5rem",
          alignItems: "flex-end",
        }}
      >
        <Dropdown
          id="role-selector"
          label="Role"
          titleText="Role"
          items={roleItems}
          itemToString={(item: { label: string }) => (item ? item.label : "")}
          onChange={handleRoleChange}
          disabled={isDisabled}
          style={{ width: "100%" }}
        />

        <TextArea
          id="chat-input"
          labelText="Message"
          placeholder="Type your message..."
          value={text}
          onChange={handleTextChange}
          disabled={isDisabled}
          style={{
            flex: 1,
            fontSize: "16px", // Prevent iOS auto-zoom
            minHeight: "44px",
          }}
        />

        <Button
          renderIcon={Send}
          onClick={handleSend}
          disabled={isDisabled || !text.trim()}
          style={{
            minWidth: "44px",
            minHeight: "44px",
          }}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
