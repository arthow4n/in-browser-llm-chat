import React from "react";
import { Button, Dropdown } from "@carbon/react";
import { PresetStore } from "../db/db";

interface ErrorBubbleProps {
  errorMessage: string;
  presets: PresetStore[];
  onRetry: () => void;
  onDismiss: () => void;
  onChangePreset: (presetId: string) => void;
  onEditResubmit: () => void;
}

export const ErrorBubble: React.FC<ErrorBubbleProps> = ({
  errorMessage,
  presets,
  onRetry,
  onDismiss,
  onChangePreset,
  onEditResubmit,
}) => {
  return (
    <div
      style={{
        backgroundColor: "var(--cds-layer-01)",
        border: "1px solid var(--cds-border-error)",
        borderRadius: "0.5rem",
        padding: "1rem",
        marginBottom: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        alignSelf: "center",
        maxWidth: "600px",
        width: "100%",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <strong style={{ color: "var(--cds-text-error)", fontSize: "1rem" }}>
          Execution Error
        </strong>
        <div style={{ fontSize: "0.875rem", color: "var(--cds-text-primary)" }}>{errorMessage}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <Dropdown
            id="preset-select"
            titleText="Change Preset"
            label="Select an alternative preset"
            items={presets.map((p) => ({ id: p.id, text: p.name }))}
            itemToString={(item: { text: string }) => (item ? item.text : "")}
            onChange={(data: unknown) => {
              const item = data as { item?: { id: string }; value?: string };
              const id = item.item?.id || item.value;
              if (id) {
                onChangePreset(id);
              }
            }}
          />
          <Button kind="ghost" onClick={onEditResubmit}>
            Edit & Resubmit
          </Button>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <Button kind="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button onClick={onRetry}>Retry</Button>
        </div>
      </div>
    </div>
  );
};
