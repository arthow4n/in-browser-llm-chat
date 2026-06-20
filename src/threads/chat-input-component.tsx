import { useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { chatInputMachine } from "./chat-input-machine";

export interface ChatInputComponentProps {
  isDisabled?: boolean;
  onSubmit: (text: string, role: "user" | "assistant" | "system") => Promise<void> | void;
}

export function ChatInputComponent({
  isDisabled: externalDisabled = false,
  onSubmit,
}: ChatInputComponentProps) {
  const [state, send] = useMachine(chatInputMachine);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync external disabled prop to the state machine
  useEffect(() => {
    if (externalDisabled) {
      send({ type: "DISABLE" });
    } else {
      send({ type: "ENABLE" });
    }
  }, [externalDisabled, send]);

  const context = state.context;
  const isDisabledState = state.matches("disabled");
  const isSubmittingState = state.matches("submitting");
  const isDisabled = isDisabledState || isSubmittingState;

  // Handle textarea height auto-resize
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to calculate scrollHeight properly
    textarea.style.height = "auto";
    // Adjust height based on content
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [context.inputText]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    send({ type: "INPUT_CHANGED", text: e.target.value });
  };

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    send({ type: "ROLE_CHANGED", role: e.target.value as "user" | "assistant" | "system" });
  };

  const triggerSubmit = async () => {
    if (isDisabled || !context.inputText.trim()) return;

    send({ type: "SUBMIT" });
    try {
      await onSubmit(context.inputText, context.selectedRole);
      send({ type: "SUBMIT_SUCCESS" });
    } catch {
      send({ type: "SUBMIT_FAILURE" });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Check if device is likely mobile using screen width
    const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;

    if (e.key === "Enter") {
      if (isMobile) {
        // Mobile layout: Enter inserts newline, does not submit.
        return;
      }

      if (!e.shiftKey) {
        e.preventDefault();
        void triggerSubmit();
      }
    }
  };

  const placeholderText = isDisabledState
    ? "Please wait..."
    : "Type a message... (Press Enter to send, Shift+Enter for newline)";

  return (
    <div className="chat-input-area-container" data-testid="chat-input-area">
      <div className="chat-input-controls">
        <select
          className="chat-role-selector"
          value={context.selectedRole}
          onChange={handleRoleChange}
          disabled={isDisabled}
          aria-label="Select Message Role"
          data-testid="chat-role-selector"
        >
          <option value="user">User</option>
          <option value="assistant">Assistant</option>
          <option value="system">System</option>
        </select>
      </div>

      <div className="chat-input-textarea-wrapper">
        <textarea
          ref={textareaRef}
          className="chat-input-textarea"
          value={context.inputText}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          disabled={isDisabled}
          rows={1}
          aria-label="Chat input message"
          data-testid="chat-input-textarea"
        />

        <button
          className="chat-send-btn"
          onClick={() => void triggerSubmit()}
          disabled={isDisabled || !context.inputText.trim()}
          aria-label="Send Message"
          data-testid="chat-send-btn"
        >
          {isSubmittingState ? (
            <span className="spinner small-spinner" data-testid="send-spinner"></span>
          ) : (
            <span className="send-icon">🛩️</span>
          )}
        </button>
      </div>
    </div>
  );
}
