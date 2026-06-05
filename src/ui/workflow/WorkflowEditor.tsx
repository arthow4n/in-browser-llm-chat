import React, { useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { TextArea, Button, InlineLoading, InlineNotification, Modal, Theme } from "@carbon/react";
import { workflowEditorMachine } from "./workflowEditorMachine.js";

interface WorkflowEditorProps {
  workflowId: string | null;
  onClose: () => void;
}

export const WorkflowEditor: React.FC<WorkflowEditorProps> = ({ workflowId, onClose }) => {
  const [state, send] = useMachine(workflowEditorMachine, {
    input: { workflowId },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousStateRef = useRef<string>("");

  const { jsonContent, isDirty, isBuiltIn, validationErrors, errorMessage } = state.context;

  // Handle transitions to onClose
  useEffect(() => {
    const currentState =
      typeof state.value === "string" ? state.value : Object.keys(state.value)[0];

    if (state.matches("deleteSuccess") || state.matches("discarded")) {
      onClose();
    }

    // If we just successfully saved and transitioned back to editing.clean, navigate away
    if (previousStateRef.current === "saving" && state.matches({ editing: "clean" })) {
      onClose();
    }

    previousStateRef.current = currentState;
  }, [state, onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonContent);
    } catch (err) {
      console.error("Failed to copy JSON:", err);
    }
  };

  const handleExport = () => {
    try {
      const parsed = JSON.parse(jsonContent);
      const name = parsed.name || "workflow";
      const blob = new Blob([jsonContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.toLowerCase().replace(/\s+/g, "_")}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      const blob = new Blob([jsonContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "workflow.json";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        send({ type: "EDIT_JSON", content });
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // Reset input
  };

  const isLoading = state.matches("loading");
  const isValidating = state.matches("validating");
  const isSaving = state.matches("saving");
  const isDeleting = state.matches("deleting");
  const isViewing = state.matches("viewing");

  const isDisabled = isLoading || isValidating || isSaving || isDeleting;

  return (
    <Theme theme="g100">
      <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          <div>
            <h3>
              {isBuiltIn
                ? "View Built-in Workflow"
                : workflowId
                  ? "Edit Workflow"
                  : "Create Workflow"}
            </h3>
            <p style={{ color: "#c6c6c6", fontSize: "0.875rem", marginTop: "0.25rem" }}>
              {isBuiltIn
                ? "Built-in workflows are read-only. Clone them to make edits."
                : "Define agent nodes, tools, and execution routing using JSON."}
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button kind="ghost" size="sm" onClick={handleCopy} disabled={isLoading}>
              Copy JSON
            </Button>
            <Button kind="ghost" size="sm" onClick={handleExport} disabled={isLoading}>
              Export to File
            </Button>
            {!isBuiltIn && (
              <>
                <Button
                  kind="ghost"
                  size="sm"
                  onClick={handleImportClick}
                  disabled={isDisabled || isViewing}
                >
                  Import File
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept=".json"
                  onChange={handleFileChange}
                />
              </>
            )}
          </div>
        </div>

        {errorMessage && (
          <InlineNotification
            kind="error"
            title="Database Error"
            subtitle={errorMessage}
            onClose={() => send({ type: "DISMISS_ERROR" })}
            style={{ marginBottom: "1rem", maxWidth: "100%" }}
          />
        )}

        {validationErrors.length > 0 && (
          <InlineNotification
            kind="error"
            title="Validation Errors"
            hideCloseButton
            style={{ marginBottom: "1rem", maxWidth: "100%" }}
          >
            <ul style={{ paddingLeft: "1.25rem", marginTop: "0.5rem", listStyleType: "disc" }}>
              {validationErrors.map((err, idx) => (
                <li key={idx} style={{ marginBottom: "0.25rem" }}>
                  {err}
                </li>
              ))}
            </ul>
          </InlineNotification>
        )}

        {isLoading ? (
          <InlineLoading description="Loading workflow configuration..." />
        ) : (
          <div style={{ marginBottom: "2rem" }}>
            <TextArea
              id="workflow-json-editor"
              labelText="Workflow JSON Configuration"
              value={jsonContent}
              onChange={(e) => send({ type: "EDIT_JSON", content: e.target.value })}
              readOnly={isBuiltIn || isDisabled}
              rows={25}
              style={{
                fontFamily: "monospace",
                fontSize: "0.875rem",
                lineHeight: "1.4",
                backgroundColor: isBuiltIn ? "#262626" : undefined,
              }}
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            {!isBuiltIn && workflowId && (
              <Button
                kind="danger"
                onClick={() => send({ type: "DELETE_WORKFLOW", workflowId })}
                disabled={isDisabled}
              >
                {isDeleting ? "Deleting..." : "Delete Workflow"}
              </Button>
            )}
          </div>

          <div style={{ display: "flex", gap: "1rem" }}>
            {isBuiltIn && (
              <Button
                kind="primary"
                onClick={() => send({ type: "CLONE_WORKFLOW" })}
                disabled={isDisabled}
              >
                Clone Workflow
              </Button>
            )}

            {!isBuiltIn && (
              <>
                <Button
                  kind="secondary"
                  onClick={() => send({ type: "CANCEL" })}
                  disabled={isDisabled}
                >
                  Cancel
                </Button>
                <Button
                  kind="primary"
                  onClick={() => send({ type: "SAVE" })}
                  disabled={isDisabled || !isDirty || state.matches({ editing: "clean" })}
                >
                  {isSaving ? "Saving..." : "Save Workflow"}
                </Button>
              </>
            )}

            {isBuiltIn && (
              <Button kind="secondary" onClick={onClose} disabled={isDisabled}>
                Close
              </Button>
            )}
          </div>
        </div>

        <Modal
          open={state.matches("promptingDiscard")}
          modalHeading="Unsaved Changes"
          primaryButtonText="Discard Changes"
          secondaryButtonText="Keep Editing"
          onRequestSubmit={() => send({ type: "CONFIRM_DISCARD" })}
          onRequestClose={() => send({ type: "ABORT_DISCARD" })}
        >
          <p>
            You have unsaved changes to this workflow. Are you sure you want to discard them and
            return to the list?
          </p>
        </Modal>
      </div>
    </Theme>
  );
};
