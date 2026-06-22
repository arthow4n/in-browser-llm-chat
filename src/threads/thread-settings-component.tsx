import { useEffect } from "react";
import { useMachine } from "@xstate/react";
import { threadSettingsMachine } from "./thread-settings-machine";
import { workflowSyncingMachine } from "./workflow-syncing-machine";
import { listPresets, getThread } from "../db/db-operations";

export interface ThreadSettingsComponentProps {
  threadId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess?: () => void;
  onHardSyncSuccess?: () => void;
}

export function ThreadSettingsComponent({
  threadId,
  isOpen,
  onClose,
  onSaveSuccess,
  onHardSyncSuccess,
}: ThreadSettingsComponentProps) {
  const [settingsState, sendSettings] = useMachine(threadSettingsMachine);
  const [syncState, sendSync] = useMachine(workflowSyncingMachine, {
    input: { threadId },
  });

  // Load presets and open machine when threadId/isOpen changes
  useEffect(() => {
    if (isOpen && threadId) {
      void (async () => {
        const loadedPresets = await listPresets();

        const thread = await getThread(threadId);
        if (thread) {
          sendSettings({
            type: "OPEN",
            threadId,
            threadTitle: thread.title,
            selectedPresetId: thread.activePresetId,
            presets: loadedPresets,
          });
        }
      })();
    } else {
      sendSettings({ type: "CLOSE" });
    }
  }, [isOpen, threadId, sendSettings]);

  useEffect(() => {
    if (settingsState.matches("closed") && isOpen) {
      onClose();
    }
  }, [settingsState, isOpen, onClose]);

  // Trigger callbacks on success
  useEffect(() => {
    if (syncState.matches("success")) {
      const timer = setTimeout(() => {
        if (syncState.context.isDestructive && onHardSyncSuccess) {
          onHardSyncSuccess();
        } else if (onSaveSuccess) {
          onSaveSuccess();
        }
        sendSync({ type: "DISMISS" });
        sendSettings({ type: "CLOSE" });
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [syncState, onHardSyncSuccess, onSaveSuccess, sendSync, sendSettings]);

  if (!isOpen) return null;

  const context = settingsState.context;
  const isSaving = settingsState.matches({ opened: "saving" });

  const handleSave = () => {
    sendSettings({ type: "SAVE" });
    if (onSaveSuccess) {
      // Small timeout to allow the async DB operation in machine to proceed
      setTimeout(onSaveSuccess, 100);
    }
  };

  return (
    <div className="modal-backdrop" data-testid="thread-settings-modal">
      <div className="modal-content settings-modal">
        <header className="modal-header">
          <h2>Thread Settings</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={() => sendSettings({ type: "CLOSE" })}
            aria-label="Close settings"
            disabled={isSaving}
          >
            ✕
          </button>
        </header>

        {context.errorMessage && (
          <div className="error-banner" data-testid="settings-error-banner">
            <span className="error-text">{context.errorMessage}</span>
            <button
              type="button"
              className="error-dismiss-btn"
              onClick={() => sendSettings({ type: "DISMISS_ERROR" })}
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="modal-body">
          {/* Thread Title Field */}
          <div className="form-group">
            <label htmlFor="thread-title-input">Thread Title</label>
            <div className="title-edit-container">
              {context.isEditingTitle ? (
                <div className="title-editing">
                  <input
                    id="thread-title-input"
                    type="text"
                    value={context.threadTitle}
                    onChange={(e) => sendSettings({ type: "UPDATE_TITLE", title: e.target.value })}
                    disabled={isSaving}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => sendSettings({ type: "CANCEL_EDIT_TITLE" })}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="title-view">
                  <span className="thread-title-value">
                    {context.threadTitle || "Untitled Chat"}
                  </span>
                  <button
                    type="button"
                    className="btn btn-icon"
                    onClick={() => sendSettings({ type: "EDIT_TITLE" })}
                    aria-label="Edit title"
                    disabled={isSaving}
                  >
                    ✏️
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Active Preset Field */}
          <div className="form-group">
            <label htmlFor="preset-select">Active Preset</label>
            <select
              id="preset-select"
              value={context.selectedPresetId}
              onChange={(e) => sendSettings({ type: "CHANGE_PRESET", presetId: e.target.value })}
              disabled={isSaving}
            >
              {context.presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} ({preset.provider}) - {preset.model}
                </option>
              ))}
            </select>
          </div>

          {/* Workflow Sync Section */}
          <div className="sync-section">
            <h3>Workflow Synchronization</h3>
            <p className="sync-description">
              Align the current conversation settings and logic snapshots with the latest
              definitions in your database workflows.
            </p>
            {syncState.matches("idle") && (
              <button
                type="button"
                className="btn btn-secondary"
                data-testid="sync-workflow-btn"
                onClick={() => sendSync({ type: "START_SYNC" })}
                disabled={isSaving}
              >
                Sync to Latest Workflow
              </button>
            )}

            {syncState.matches("analyzing") && (
              <div className="sync-analyzing">
                <span className="spinner"></span>
                <span>Analyzing differences...</span>
              </div>
            )}

            {syncState.matches("promptingSoftSync") && (
              <div className="sync-prompt soft-sync-prompt" data-testid="soft-sync-prompt">
                <div className="alert alert-info">
                  <strong>Soft Sync Available:</strong> Only configurations or system prompts have
                  changed. You can sync without losing messages.
                </div>
                <div className="sync-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    data-testid="confirm-soft-sync-btn"
                    onClick={() => sendSync({ type: "CONFIRM_SYNC" })}
                  >
                    Confirm Soft Sync
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => sendSync({ type: "CANCEL_SYNC" })}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {syncState.matches("promptingHardSync") && (
              <div className="sync-prompt hard-sync-prompt" data-testid="hard-sync-prompt">
                <div className="alert alert-danger">
                  <strong>Warning: Destructive Sync Required.</strong> The workflow structure
                  (nodes/edges) has changed. Confirming this sync will permanently delete all
                  messages and checkpoints for this thread.
                </div>
                <div className="sync-actions">
                  <button
                    type="button"
                    className="btn btn-danger"
                    data-testid="confirm-hard-sync-btn"
                    onClick={() => sendSync({ type: "CONFIRM_SYNC" })}
                  >
                    Confirm Destructive Sync
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => sendSync({ type: "CANCEL_SYNC" })}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {syncState.matches("syncing") && (
              <div className="sync-progress">
                <span className="spinner"></span>
                <span>Syncing in progress...</span>
              </div>
            )}

            {syncState.matches("success") && (
              <div className="alert alert-success" data-testid="sync-success-alert">
                Sync completed successfully!
              </div>
            )}

            {syncState.matches("failure") && (
              <div className="alert alert-danger" data-testid="sync-failure-alert">
                <span>Sync failed: {syncState.context.errorMessage}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => sendSync({ type: "DISMISS" })}
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>

        <footer className="modal-footer">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="save-thread-settings-btn"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => sendSettings({ type: "CLOSE" })}
            disabled={isSaving}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
