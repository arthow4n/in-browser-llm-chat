import React from "react";
import { useMachine } from "@xstate/react";
import { Button, Dropdown, TextArea } from "@carbon/react";
import { Send } from "@carbon/icons-react";
import { chatInputMachine } from "./chatInputMachine";
import { type CoordinatorEvent, type CoordinatorContext } from "../../workflow/parentCoordinator";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import { StateValue } from "xstate";

export interface ParentState {
  value: unknown;
  context: CoordinatorContext;
  matches: (val: StateValue) => boolean;
}

interface ChatInputAreaProps {
  parentState: ParentState;
  parentSend: (event: CoordinatorEvent) => void;
}

export function ChatInputArea({ parentState, parentSend }: ChatInputAreaProps) {
  const [state, send] = useMachine(chatInputMachine);

  const { text, role } = state.context;

  const isDisabled =
    parentState.matches({ ViewState: "onboarding" }) ||
    parentState.matches({ ExecutionState: "executing" }) ||
    parentState.matches({ ExecutionState: "checkingStatus" }) ||
    parentState.matches({ ExecutionState: "awaitingHumanInput" });

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    send({ type: "UPDATE_TEXT", text: e.target.value });
  };

  const handleRoleChange = (data: unknown) => {
    const RoleChangeSchema = z
      .object({
        selectedItem: z.object({ value: z.string() }).optional(),
        item: z.object({ value: z.string() }).optional(),
        value: z.string().optional(),
      })
      .catchall(z.unknown());

    const parsed = RoleChangeSchema.safeParse(data);
    if (!parsed.success) return;

    const value = parsed.data.selectedItem?.value || parsed.data.item?.value || parsed.data.value;
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

    const message: import("../../db/db").MessageStore = {
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

    parentSend({ type: "SUBMIT_MESSAGE", message });
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
