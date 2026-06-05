import React, { useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { useNavigate } from "react-router";
import {
  Select,
  SelectItem,
  TextArea,
  Button,
  InlineNotification,
  SkeletonText,
} from "@carbon/react";
import { Send } from "@carbon/icons-react";
import { newChatFormMachine } from "./newChatFormMachine.js";

/**
 * The New Chat Form is shown in the idle (no active thread) view. It allows
 * the user to select a workflow and preset, enter an optional initial message,
 * and create a new chat thread. After submission the user is navigated to the
 * newly created thread's route.
 */
export const NewChatForm: React.FC = () => {
  const navigate = useNavigate();
  const [state, send] = useMachine(newChatFormMachine);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    selectedWorkflowId,
    selectedPresetId,
    initialMessage,
    workflows,
    presets,
    errorMessage,
    lastCreatedThreadId,
  } = state.context;

  const isLoading = state.matches("loading");
  const isSubmitting = state.matches("submitting");
  const isError = state.matches("error");
  const isDisabled = isLoading || isSubmitting;

  // Navigate to the new thread once it is created
  useEffect(() => {
    if (lastCreatedThreadId) {
      void navigate(`/${lastCreatedThreadId}`);
    }
  }, [lastCreatedThreadId, navigate]);

  // Auto-resize textarea as the user types
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, [initialMessage]);

  const handleWorkflowChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    send({ type: "CHANGE_WORKFLOW", workflowId: e.target.value });
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    send({ type: "CHANGE_PRESET", presetId: e.target.value });
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    send({ type: "UPDATE_MESSAGE", message: e.target.value });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift) to mirror chat app conventions
    if (e.key === "Enter" && !e.shiftKey && !isDisabled) {
      e.preventDefault();
      send({ type: "SUBMIT" });
    }
  };

  const canSubmit = !isDisabled && selectedWorkflowId.length > 0 && selectedPresetId.length > 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        padding: "2rem 1.5rem",
        maxWidth: "640px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      <h1
        style={{
          fontSize: "1.75rem",
          fontWeight: 600,
          margin: 0,
          color: "var(--cds-text-primary)",
        }}
      >
        New Chat
      </h1>

      <p style={{ margin: 0, color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
        Choose a workflow and LLM preset, then optionally type an initial message to seed the
        conversation.
      </p>

      {/* Error Notification */}
      {isError && errorMessage && (
        <InlineNotification
          kind="error"
          title="Error — "
          subtitle={errorMessage}
          onClose={() => send({ type: "DISMISS_ERROR" })}
          lowContrast
        />
      )}

      {/* Workflow Selector */}
      {isLoading ? (
        <div>
          <SkeletonText heading width="40%" />
          <SkeletonText width="100%" />
        </div>
      ) : (
        <Select
          id="new-chat-workflow-select"
          labelText="Workflow"
          value={selectedWorkflowId}
          onChange={handleWorkflowChange}
          disabled={isDisabled}
          style={{ fontSize: "16px" }}
        >
          {workflows.length === 0 ? (
            <SelectItem value="" text="No workflows available" />
          ) : (
            workflows.map((w) => <SelectItem key={w.id} value={w.id} text={w.name} />)
          )}
        </Select>
      )}

      {/* Preset Selector */}
      {isLoading ? (
        <div>
          <SkeletonText heading width="50%" />
          <SkeletonText width="100%" />
        </div>
      ) : (
        <Select
          id="new-chat-preset-select"
          labelText="LLM Preset"
          value={selectedPresetId}
          onChange={handlePresetChange}
          disabled={isDisabled}
          style={{ fontSize: "16px" }}
        >
          {presets.length === 0 ? (
            <SelectItem value="" text="No presets configured" />
          ) : (
            presets.map((p) => <SelectItem key={p.id} value={p.id} text={p.name} />)
          )}
        </Select>
      )}

      {/* Initial Message Input */}
      {isLoading ? (
        <div>
          <SkeletonText heading width="55%" />
          <SkeletonText paragraph lineCount={3} />
        </div>
      ) : (
        <TextArea
          id="new-chat-initial-message"
          ref={textareaRef}
          labelText="Initial message (optional)"
          helperText="Leave blank to start the workflow without a user message. Press Enter to submit, Shift+Enter for a new line."
          placeholder="Type your first message or topic…"
          value={initialMessage}
          onChange={handleMessageChange}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          rows={3}
          style={{
            fontSize: "16px",
            minHeight: "80px",
            maxHeight: "200px",
            resize: "none",
          }}
        />
      )}

      {/* Submit */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          id="new-chat-submit-button"
          renderIcon={Send}
          iconDescription="Start Chat"
          onClick={() => send({ type: "SUBMIT" })}
          disabled={!canSubmit}
          kind="primary"
          style={{ minHeight: "44px" }}
        >
          {isSubmitting ? "Creating…" : "Start Chat"}
        </Button>
      </div>
    </div>
  );
};
