import React, { useEffect } from "react";
import { useMachine } from "@xstate/react";
import {
  Button,
  InlineNotification,
  TextInput,
  Select,
  SelectItem,
  NumberInput,
  InlineLoading,
} from "@carbon/react";
import { Add, TrashCan } from "@carbon/icons-react";
import { globalSettingsMachine } from "./globalSettings.js";
import { ApiKeyInput } from "./ApiKeyInput.js";

export const GlobalSettings: React.FC = () => {
  const [state, send] = useMachine(globalSettingsMachine);

  useEffect(() => {
    send({ type: "LOAD" });
  }, [send]);

  if (state.matches("loading")) {
    return <InlineLoading description="Loading settings..." />;
  }

  const {
    openRouterApiKey,
    geminiApiKey,
    showOpenRouterKey,
    showGeminiKey,
    theme,
    injectedSystemMessages,
    isDirty,
    errorMessage,
    validationErrors,
  } = state.context;

  return (
    <div style={{ padding: "2rem", maxWidth: "800px" }}>
      <h2>Global Settings</h2>
      {errorMessage && (
        <InlineNotification
          kind="error"
          title="Error"
          subtitle={errorMessage}
          onCloseButtonClick={() => send({ type: "DISMISS_ERROR" })}
        />
      )}

      <div style={{ marginBottom: "2rem" }}>
        <h3>API Keys & Security</h3>
        <ApiKeyInput
          id="openrouter-api-key"
          labelText="OpenRouter API Key"
          value={openRouterApiKey}
          onChange={(val) => send({ type: "EDIT_FIELD", field: "openRouterApiKey", value: val })}
          provider="openrouter"
          showPassword={showOpenRouterKey}
          onTogglePasswordVisibility={() =>
            send({ type: "TOGGLE_KEY_VISIBILITY", provider: "openrouter" })
          }
        />
        <ApiKeyInput
          id="gemini-api-key"
          labelText="Gemini API Key"
          value={geminiApiKey}
          onChange={(val) => send({ type: "EDIT_FIELD", field: "geminiApiKey", value: val })}
          provider="gemini"
          showPassword={showGeminiKey}
          onTogglePasswordVisibility={() =>
            send({ type: "TOGGLE_KEY_VISIBILITY", provider: "gemini" })
          }
        />
      </div>

      <div style={{ marginBottom: "2rem" }}>
        <h3>Theme Override</h3>
        <Select
          id="theme-select"
          labelText="Theme"
          value={theme}
          onChange={(e) => send({ type: "EDIT_FIELD", field: "theme", value: e.target.value })}
        >
          <SelectItem value="system" text="System" />
          <SelectItem value="light" text="Light" />
          <SelectItem value="dark" text="Dark" />
        </Select>
      </div>

      <div style={{ marginBottom: "2rem" }}>
        <h3>Injected System Messages</h3>
        {validationErrors.general && (
          <InlineNotification
            kind="error"
            title="Validation Error"
            subtitle={validationErrors.general}
          />
        )}
        {injectedSystemMessages.map((msg, index) => (
          <div
            key={index}
            style={{ display: "flex", alignItems: "flex-end", gap: "1rem", marginBottom: "1rem" }}
          >
            <TextInput
              id={`sys-msg-${index}-content`}
              labelText="Content"
              value={msg.content}
              onChange={(e) =>
                send({
                  type: "UPDATE_INJECTED_MESSAGE",
                  index,
                  field: "content",
                  value: e.target.value,
                })
              }
            />
            <NumberInput
              id={`sys-msg-${index}-depth`}
              label="Depth"
              value={msg.depth}
              onChange={(_, { value }) =>
                send({
                  type: "UPDATE_INJECTED_MESSAGE",
                  index,
                  field: "depth",
                  value: Number(value),
                })
              }
              min={-100}
              max={100}
            />
            <Button
              kind="danger--ghost"
              renderIcon={TrashCan}
              iconDescription="Remove"
              hasIconOnly
              onClick={() => send({ type: "REMOVE_INJECTED_MESSAGE", index })}
            />
          </div>
        ))}
        <Button
          kind="ghost"
          renderIcon={Add}
          onClick={() => send({ type: "ADD_INJECTED_MESSAGE" })}
        >
          Add System Message
        </Button>
      </div>

      <div style={{ display: "flex", gap: "1rem" }}>
        <Button
          onClick={() => send({ type: "SAVE" })}
          disabled={!isDirty || state.matches("saving") || state.matches("validating")}
        >
          {state.matches("saving") ? "Saving..." : "Save Settings"}
        </Button>
        <Button
          kind="secondary"
          onClick={() => send({ type: "RESET_FIELDS" })}
          disabled={!isDirty || state.matches("saving")}
        >
          Reset Fields
        </Button>
      </div>
    </div>
  );
};
