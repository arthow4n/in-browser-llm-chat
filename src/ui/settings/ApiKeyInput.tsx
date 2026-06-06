import React, { useEffect, useState } from "react";
import { PasswordInput, InlineLoading, Tooltip } from "@carbon/react";
import { CheckmarkOutline, ErrorOutline } from "@carbon/icons-react";
import { useMachine } from "@xstate/react";
import { apiKeyValidatorMachine } from "./apiKeyValidator.js";

interface ApiKeyInputProps {
  id: string;
  labelText: string;
  value: string;
  onChange: (value: string) => void;
  provider: "openrouter" | "gemini";
  showPassword?: boolean;
  onTogglePasswordVisibility?: () => void;
}

export const ApiKeyInput: React.FC<ApiKeyInputProps> = ({
  id,
  labelText,
  value,
  onChange,
  provider,
  showPassword,
  onTogglePasswordVisibility,
}) => {
  const [state, send] = useMachine(apiKeyValidatorMachine, {
    input: { provider },
  });

  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, 500);
    return () => clearTimeout(handler);
  }, [value]);

  useEffect(() => {
    if (debouncedValue) {
      send({ type: "START_VALIDATION", apiKey: debouncedValue });
    } else {
      send({ type: "INPUT_CHANGED" });
    }
  }, [debouncedValue, send]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    send({ type: "INPUT_CHANGED" });
  };

  return (
    <div style={{ position: "relative", marginBottom: "1rem" }}>
      <PasswordInput
        id={id}
        labelText={labelText}
        value={value}
        onChange={handleChange}
        type={showPassword ? "text" : "password"}
        tooltipPosition="bottom"
        hidePasswordLabel="Hide password"
        showPasswordLabel="Show password"
        onTogglePasswordVisibility={onTogglePasswordVisibility}
      />
      <div
        style={{
          position: "absolute",
          top: "2rem",
          right: "3rem",
          display: "flex",
          alignItems: "center",
        }}
      >
        {state.matches("validating") && (
          <InlineLoading status="active" description="Validating..." />
        )}
        {state.matches("valid") && (
          <Tooltip align="bottom" label="API key is valid">
            <CheckmarkOutline size={20} style={{ color: "green" }} />
          </Tooltip>
        )}
        {state.matches("invalid") && (
          <Tooltip align="bottom" label={state.context.errorMessage || "Invalid API key"}>
            <ErrorOutline size={20} style={{ color: "red" }} />
          </Tooltip>
        )}
      </div>
    </div>
  );
};
