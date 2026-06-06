import React, { useEffect } from "react";
import { useMachine } from "@xstate/react";
import {
  Form,
  FormGroup,
  TextInput,
  PasswordInput,
  Select,
  SelectItem,
  Button,
  InlineLoading,
  InlineNotification,
  Theme,
  Column,
  Grid,
} from "@carbon/react";
import { CheckmarkOutline, Warning } from "@carbon/icons-react";
import { presetConfigMachine } from "./presetConfigMachine";
import { presetConnectionTesterMachine } from "./presetConnectionTester";
import { POPULAR_MODELS } from "./modelConstants";
import { modelSelectionMachine } from "./modelSelectionMachine";

interface PresetConfigProps {
  presetId: string | null;
  onClose: () => void;
}

export const PresetConfig: React.FC<PresetConfigProps> = ({ presetId, onClose }) => {
  const [configState, sendConfig] = useMachine(presetConfigMachine, {
    input: { presetId },
  });

  const [modelState, sendModel] = useMachine(modelSelectionMachine);
  const [testerState, sendTester] = useMachine(presetConnectionTesterMachine);

  const {
    name,
    provider,
    model,
    apiKey,
    temperature,
    maxTokens,
    reasoningLevel,
    maxStepsWithoutUser,
    maxTokensPerRun,
    validationErrors,
    errorMessage,
  } = configState.context;

  const { isCustomModel, customModelId } = modelState.context;

  const popularList = POPULAR_MODELS[provider as keyof typeof POPULAR_MODELS];

  // Synchronize model selection state with config state
  useEffect(() => {
    sendModel({
      type: "SYNC_MODEL",
      model,
      provider: provider as keyof typeof POPULAR_MODELS,
    });
  }, [model, provider, sendModel]);

  // Handle final save/delete navigation
  useEffect(() => {
    if (configState.matches("saveSuccess") || configState.matches("deleteSuccess")) {
      onClose();
    }
  }, [configState, onClose]);

  const handleModelSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "custom") {
      sendModel({
        type: "SET_CUSTOM_MODEL",
        isCustom: true,
        modelId: customModelId,
      });
      sendConfig({ type: "EDIT_FIELD", field: "model", value: customModelId || "" });
    } else {
      sendModel({ type: "SET_CUSTOM_MODEL", isCustom: false });
      sendConfig({ type: "EDIT_FIELD", field: "model", value: val });
    }
  };

  const handleCustomModelIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    sendModel({ type: "UPDATE_CUSTOM_ID", id: val });
    sendConfig({ type: "EDIT_FIELD", field: "model", value: val });
  };

  const handleTestConnection = () => {
    sendTester({
      type: "TEST_CONNECTION",
      provider,
      model,
      apiKey: apiKey || undefined,
    });
  };

  return (
    <Theme theme="g100">
      <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
        <h3>{presetId ? "Edit LLM Preset" : "Create LLM Preset"}</h3>
        <p style={{ marginBottom: "2rem", color: "#525252" }}>
          Configure connection details, generation parameters, and execution budget limits.
        </p>

        {errorMessage && (
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={errorMessage}
            onClose={() => sendConfig({ type: "DISMISS_ERROR" })}
            style={{ marginBottom: "1.5rem" }}
          />
        )}

        {configState.matches("loading") ? (
          <InlineLoading description="Loading preset details..." />
        ) : (
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              sendConfig({ type: "SAVE" });
            }}
          >
            <Grid style={{ padding: 0 }}>
              <Column sm={4} md={8} lg={12}>
                <FormGroup legendText="Preset Identity">
                  <TextInput
                    id="preset-name"
                    labelText="Preset Name"
                    placeholder="e.g. My Custom Gemini"
                    value={name}
                    onChange={(e) =>
                      sendConfig({ type: "EDIT_FIELD", field: "name", value: e.target.value })
                    }
                    invalid={!!validationErrors.name}
                    invalidText={validationErrors.name}
                    style={{ marginBottom: "1rem" }}
                  />
                  <Select
                    id="preset-provider"
                    labelText="API Provider"
                    value={provider}
                    onChange={(e) =>
                      sendConfig({ type: "EDIT_FIELD", field: "provider", value: e.target.value })
                    }
                    style={{ marginBottom: "1rem" }}
                  >
                    <SelectItem value="gemini" text="Gemini (Google)" />
                    <SelectItem value="openrouter" text="OpenRouter" />
                  </Select>

                  <Select
                    id="preset-model-select"
                    labelText="Model Selection"
                    value={isCustomModel ? "custom" : model}
                    onChange={handleModelSelectChange}
                    style={{ marginBottom: "1rem" }}
                  >
                    {popularList.map((m) => (
                      <SelectItem key={m.value} value={m.value} text={m.label} />
                    ))}
                    <SelectItem value="custom" text="Custom Model ID..." />
                  </Select>

                  {isCustomModel && (
                    <TextInput
                      id="preset-custom-model"
                      labelText="Custom Model ID"
                      placeholder={
                        provider === "gemini"
                          ? "e.g. gemini-2.5-flash"
                          : "e.g. google/gemini-2.5-flash"
                      }
                      value={customModelId}
                      onChange={handleCustomModelIdChange}
                      invalid={!!validationErrors.model}
                      invalidText={validationErrors.model}
                      style={{ marginBottom: "1rem" }}
                    />
                  )}
                </FormGroup>

                <FormGroup legendText="Authentication">
                  <PasswordInput
                    id="preset-api-key"
                    labelText="API Key Override (Optional)"
                    placeholder="Leave empty to use global setting key"
                    value={apiKey}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      sendConfig({ type: "EDIT_FIELD", field: "apiKey", value: e.target.value })
                    }
                    style={{ marginBottom: "1rem" }}
                  />

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      marginBottom: "1.5rem",
                    }}
                  >
                    <Button
                      type="button"
                      kind="tertiary"
                      onClick={handleTestConnection}
                      disabled={testerState.matches("testing")}
                    >
                      {testerState.matches("testing") ? "Testing..." : "Test Connection"}
                    </Button>

                    {testerState.matches("testing") && (
                      <InlineLoading status="active" description="Contacting API..." />
                    )}

                    {testerState.matches("success") && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          color: "#24a148",
                        }}
                      >
                        <CheckmarkOutline size={16} />
                        Connected! ({testerState.context.latency}ms)
                      </span>
                    )}

                    {testerState.matches("failure") && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          color: "#da1e28",
                        }}
                      >
                        <Warning size={16} />
                        Failed to connect: {testerState.context.errorMessage}
                      </span>
                    )}
                  </div>
                </FormGroup>

                <FormGroup legendText="Parameters (Optional)">
                  <TextInput
                    id="preset-temperature"
                    labelText="Temperature"
                    placeholder="0.0 - 2.0 (e.g. 0.7)"
                    value={temperature === undefined ? "" : temperature}
                    onChange={(e) =>
                      sendConfig({
                        type: "EDIT_FIELD",
                        field: "temperature",
                        value: e.target.value,
                      })
                    }
                    invalid={!!validationErrors.temperature}
                    invalidText={validationErrors.temperature}
                    style={{ marginBottom: "1rem" }}
                  />
                  <TextInput
                    id="preset-max-tokens"
                    labelText="Max Outputs Tokens"
                    placeholder="e.g. 2048"
                    value={maxTokens === undefined ? "" : maxTokens}
                    onChange={(e) =>
                      sendConfig({ type: "EDIT_FIELD", field: "maxTokens", value: e.target.value })
                    }
                    invalid={!!validationErrors.maxTokens}
                    invalidText={validationErrors.maxTokens}
                    style={{ marginBottom: "1rem" }}
                  />
                  <TextInput
                    id="preset-reasoning-level"
                    labelText="Reasoning / Thinking Level"
                    placeholder="e.g. low, medium, high (if supported)"
                    value={reasoningLevel}
                    onChange={(e) =>
                      sendConfig({
                        type: "EDIT_FIELD",
                        field: "reasoningLevel",
                        value: e.target.value,
                      })
                    }
                    style={{ marginBottom: "1rem" }}
                  />
                </FormGroup>

                <FormGroup legendText="Execution Budget Limits">
                  <TextInput
                    id="preset-budget-steps"
                    labelText="Max Steps without User"
                    value={maxStepsWithoutUser}
                    onChange={(e) =>
                      sendConfig({
                        type: "EDIT_FIELD",
                        field: "maxStepsWithoutUser",
                        value: e.target.value,
                      })
                    }
                    invalid={!!validationErrors.maxStepsWithoutUser}
                    invalidText={validationErrors.maxStepsWithoutUser}
                    style={{ marginBottom: "1rem" }}
                  />
                  <TextInput
                    id="preset-budget-tokens"
                    labelText="Max Tokens per Run Limit"
                    placeholder="Unlimited (leave blank)"
                    value={maxTokensPerRun === null ? "" : maxTokensPerRun}
                    onChange={(e) =>
                      sendConfig({
                        type: "EDIT_FIELD",
                        field: "maxTokensPerRun",
                        value: e.target.value,
                      })
                    }
                    invalid={!!validationErrors.maxTokensPerRun}
                    invalidText={validationErrors.maxTokensPerRun}
                    style={{ marginBottom: "1.5rem" }}
                  />
                </FormGroup>

                <div style={{ display: "flex", gap: "1rem", marginTop: "2rem" }}>
                  <Button
                    type="submit"
                    kind="primary"
                    disabled={configState.matches("saving") || configState.matches("deleting")}
                  >
                    {configState.matches("saving") ? "Saving..." : "Save Preset"}
                  </Button>
                  <Button
                    type="button"
                    kind="secondary"
                    onClick={onClose}
                    disabled={configState.matches("saving") || configState.matches("deleting")}
                  >
                    Cancel
                  </Button>
                  {presetId && (
                    <Button
                      type="button"
                      kind="danger"
                      onClick={() => sendConfig({ type: "DELETE" })}
                      disabled={configState.matches("saving") || configState.matches("deleting")}
                      style={{ marginLeft: "auto" }}
                    >
                      {configState.matches("deleting") ? "Deleting..." : "Delete Preset"}
                    </Button>
                  )}
                </div>
              </Column>
            </Grid>
          </Form>
        )}
      </div>
    </Theme>
  );
};
