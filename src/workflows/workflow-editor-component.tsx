import { useState, useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { workflowEditorMachine } from "./workflow-editor-machine";
import { useWorkflows } from "./workflows-hooks";
import type { Workflow } from "../db/db-schema";

const DEFAULT_NEW_WORKFLOW = {
  id: "",
  name: "New Custom Workflow",
  description: "A description of the custom workflow.",
  isBuiltIn: false,
  nodes: [
    {
      id: "agent",
      type: "agent",
      name: "Agent",
      systemPrompt: "You are a helpful assistant.",
    },
  ],
  edges: [],
};

export function WorkflowEditorComponent() {
  const { workflows, isLoading, error, refresh, deleteWorkflow } = useWorkflows();
  const [state, send] = useMachine(workflowEditorMachine);
  const context = state.context;

  const [mobileBannerDismissed, setMobileBannerDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detect mobile view
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const isEditingState = state.matches("editing");
  const isViewingState = state.matches("viewing");
  const isValidatingState = state.matches("validating");
  const isSavingState = state.matches("saving");
  const isDeletingState = state.matches("deleting");
  const isErrorState = state.matches("error");
  const isPromptingDiscardState = state.matches("promptingDiscard");

  const isActiveEditor =
    isEditingState ||
    isViewingState ||
    isValidatingState ||
    isSavingState ||
    isDeletingState ||
    isErrorState ||
    isPromptingDiscardState;

  const previousStateValue = useRef(state.value);

  useEffect(() => {
    if (state.value === "idle" && previousStateValue.current !== "idle") {
      void refresh();
    }
    previousStateValue.current = state.value;
  }, [state.value, refresh]);

  const handleStartCreate = () => {
    const template = {
      ...DEFAULT_NEW_WORKFLOW,
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2),
    };
    send({
      type: "LOAD_WORKFLOW",
      id: template.id,
      content: JSON.stringify(template, null, 2),
      isBuiltIn: false,
    });
  };

  const handleStartEdit = (wf: Workflow) => {
    send({
      type: "LOAD_WORKFLOW",
      id: wf.id,
      content: JSON.stringify(wf, null, 2),
      isBuiltIn: wf.isBuiltIn,
    });
  };

  const handleCopyToClipboard = () => {
    void navigator.clipboard.writeText(context.jsonContent);
    alert("JSON copied to clipboard!");
  };

  const handleExportToFile = () => {
    try {
      const parsed = JSON.parse(context.jsonContent);
      const filename = `${parsed.name || "workflow"}.json`
        .replace(/[^a-z0-9.]/gi, "_")
        .toLowerCase();
      const blob = new Blob([context.jsonContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Cannot export invalid JSON. Please fix errors first.");
    }
  };

  const handleImportFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result;
      if (typeof result === "string") {
        send({ type: "EDIT_JSON", content: result });
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // reset
  };

  const handleDeleteCustom = async (id: string) => {
    if (confirm("Are you sure you want to delete this custom workflow?")) {
      try {
        await deleteWorkflow(id);
        void refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to delete workflow");
      }
    }
  };

  const controlsDisabled = isSavingState || isDeletingState || isValidatingState;

  if (isLoading) {
    return (
      <div className="settings-skeleton-container" data-testid="workflows-skeleton">
        <div className="skeleton skeleton-title"></div>
        <div className="skeleton skeleton-field"></div>
        <div className="skeleton skeleton-field"></div>
      </div>
    );
  }

  // Render Editor view if a workflow is loaded/active
  if (isActiveEditor) {
    return (
      <div className="settings-panel-container workflow-editor-panel">
        {/* Mobile warning banner */}
        {isMobile && !mobileBannerDismissed && (
          <div className="banner warning-banner mobile-editor-warning" role="status">
            <span className="banner-icon">⚠</span>
            <span className="banner-text">
              Editing complex workflows on mobile devices is not recommended and may lead to syntax
              errors.
            </span>
            <button
              type="button"
              className="dismiss-banner-btn"
              onClick={() => setMobileBannerDismissed(true)}
              aria-label="Dismiss warning"
            >
              ×
            </button>
          </div>
        )}

        {/* Error banner from machine context */}
        {context.errorMessage && (
          <div className="banner error-banner" role="alert" data-testid="workflow-editor-error">
            <span className="banner-icon">⚠</span>
            <span className="banner-text">{context.errorMessage}</span>
            <button
              type="button"
              className="dismiss-banner-btn"
              onClick={() => send({ type: "DISMISS_ERROR" })}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        <header className="settings-header workflow-editor-header">
          <div>
            <h2>
              {context.isBuiltIn
                ? "View Built-in Workflow"
                : context.workflowId
                  ? "Edit Custom Workflow"
                  : "Create Custom Workflow"}
            </h2>
            <p className="settings-subtitle">
              {context.isBuiltIn
                ? "Read-only access to system default workflow structure."
                : "Author workflow configuration as JSON including nodes, edges, and injected system messages."}
            </p>
          </div>
        </header>

        {/* Editor controls bar */}
        <div className="editor-controls-bar">
          <button
            type="button"
            className="secondary-btn"
            onClick={handleCopyToClipboard}
            data-testid="editor-copy-btn"
            disabled={controlsDisabled}
          >
            📋 Copy JSON
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={handleExportToFile}
            data-testid="editor-export-btn"
            disabled={controlsDisabled}
          >
            📥 Export File
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={handleImportFileClick}
            data-testid="editor-import-btn"
            disabled={controlsDisabled || context.isBuiltIn}
          >
            📤 Import File
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: "none" }}
            accept=".json"
          />
          {context.isDirty && <span className="dirty-indicator">● Unsaved Changes</span>}
        </div>

        <div className="workflow-textarea-container">
          <textarea
            className="workflow-json-textarea"
            value={context.jsonContent}
            onChange={(e) => send({ type: "EDIT_JSON", content: e.target.value })}
            readOnly={context.isBuiltIn || controlsDisabled}
            placeholder='{\n  "id": "...",\n  "name": "..."\n}'
            data-testid="workflow-json-editor"
            rows={20}
            style={{
              width: "100%",
              fontFamily: "monospace",
              fontSize: "0.9rem",
              padding: "1rem",
              borderRadius: "8px",
              border: "1px solid var(--surface-border)",
              background: "var(--input-bg, #0b1329)",
              color: "var(--input-text, #e2e8f0)",
              resize: "vertical",
            }}
          />
        </div>

        {/* Validation Errors display */}
        {context.validationErrors.length > 0 && (
          <div className="validation-errors-container" data-testid="validation-errors-list">
            <h4>Syntax / Schema Validation Failures</h4>
            <ul>
              {context.validationErrors.map((err, idx) => (
                <li key={idx} className="error-text">
                  {err}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer controls */}
        <footer className="settings-footer editor-footer">
          {context.workflowId && !context.isBuiltIn && (
            <button
              type="button"
              className="delete-btn"
              onClick={() => send({ type: "DELETE_WORKFLOW", workflowId: context.workflowId! })}
              disabled={controlsDisabled}
              data-testid="editor-delete-btn"
            >
              {isDeletingState ? "Deleting..." : "Delete Workflow"}
            </button>
          )}

          <div style={{ marginLeft: "auto", display: "flex", gap: "1rem" }}>
            {context.isBuiltIn ? (
              <button
                type="button"
                className="primary-btn"
                onClick={() => send({ type: "CLONE_WORKFLOW" })}
                data-testid="editor-clone-btn"
              >
                Clone Workflow
              </button>
            ) : (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => send({ type: "CLONE_WORKFLOW" })}
                data-testid="editor-clone-btn"
                disabled={controlsDisabled}
              >
                Clone
              </button>
            )}

            <button
              type="button"
              className="secondary-btn"
              onClick={() => send({ type: "CANCEL" })}
              disabled={controlsDisabled}
              data-testid="editor-cancel-btn"
            >
              Cancel
            </button>

            {!context.isBuiltIn && (
              <button
                type="button"
                className="primary-btn"
                onClick={() => send({ type: "SAVE" })}
                disabled={controlsDisabled || (!context.isDirty && !isErrorState)}
                data-testid="editor-save-btn"
              >
                {isSavingState ? "Saving..." : "Save Workflow"}
              </button>
            )}
          </div>
        </footer>

        {/* Discard confirmation modal */}
        {isPromptingDiscardState && (
          <div className="delete-confirm-overlay" data-testid="discard-confirm-modal">
            <div className="delete-confirm-modal">
              <h3>Discard Unsaved Changes?</h3>
              <p>You have unsaved changes in the editor. Exiting will lose these changes.</p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                  marginTop: "1.5rem",
                }}
              >
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => send({ type: "ABORT_DISCARD" })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="delete-btn"
                  onClick={() => send({ type: "CONFIRM_DISCARD" })}
                  data-testid="confirm-discard-btn"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Render Workflow list view
  return (
    <div className="settings-panel-container workflows-list-panel">
      {error && (
        <div className="banner error-banner" role="alert">
          <span className="banner-icon">⚠</span>
          <span className="banner-text">{error}</span>
        </div>
      )}

      <header
        className="settings-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div>
          <h2>Agent Workflows</h2>
          <p className="settings-subtitle">
            Configure agent routing paths, consensus rules, and custom multi-agent structures.
          </p>
        </div>
        <button
          type="button"
          className="primary-btn"
          onClick={handleStartCreate}
          data-testid="create-workflow-btn"
          style={{ minHeight: "40px", height: "40px" }}
        >
          + Create Workflow
        </button>
      </header>

      <div className="presets-table-wrapper" style={{ marginTop: "1.5rem" }}>
        {workflows.length === 0 ? (
          <div
            className="empty-state"
            style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}
          >
            No workflows found.
          </div>
        ) : (
          <table
            className="presets-table"
            style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--surface-border)" }}>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "0.85rem",
                  }}
                >
                  Name
                </th>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "0.85rem",
                  }}
                >
                  Description
                </th>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "0.85rem",
                  }}
                >
                  Type
                </th>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "0.85rem",
                    textAlign: "right",
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((wf) => (
                <tr
                  key={wf.id}
                  style={{ borderBottom: "1px solid var(--surface-border)" }}
                  data-testid={`workflow-row-${wf.id}`}
                >
                  <td style={{ padding: "1rem", fontWeight: 500 }}>{wf.name}</td>
                  <td
                    style={{ padding: "1rem", color: "var(--text-secondary)", fontSize: "0.9rem" }}
                  >
                    {wf.description}
                  </td>
                  <td style={{ padding: "1rem" }}>
                    <span
                      className={`badge ${wf.isBuiltIn ? "badge-system" : "badge-custom"}`}
                      style={{
                        padding: "0.25rem 0.5rem",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        background: wf.isBuiltIn
                          ? "rgba(99, 102, 241, 0.15)"
                          : "rgba(34, 197, 94, 0.15)",
                        color: wf.isBuiltIn ? "#818cf8" : "#4ade80",
                      }}
                    >
                      {wf.isBuiltIn ? "Built-in" : "Custom"}
                    </span>
                  </td>
                  <td style={{ padding: "1rem", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => handleStartEdit(wf)}
                        data-testid={`edit-workflow-${wf.id}`}
                        style={{
                          minHeight: "36px",
                          height: "36px",
                          padding: "0 0.75rem",
                          fontSize: "0.8rem",
                        }}
                      >
                        {wf.isBuiltIn ? "View JSON" : "Edit JSON"}
                      </button>
                      {!wf.isBuiltIn && (
                        <button
                          type="button"
                          className="delete-btn"
                          onClick={() => handleDeleteCustom(wf.id)}
                          data-testid={`delete-workflow-${wf.id}`}
                          style={{ minHeight: "36px", height: "36px", width: "36px", padding: 0 }}
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
