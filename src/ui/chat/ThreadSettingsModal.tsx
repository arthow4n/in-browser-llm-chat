import React from "react";
import { useMachine } from "@xstate/react";
import {
  Modal,
  ModalBody,
  TextInput,
  Dropdown,
  Button,
  Loading,
  InlineNotification,
} from "@carbon/react";
import { Edit } from "@carbon/icons-react";
import {
  threadSettingsMachine,
  saveThreadSettings,
} from "../../machines/thread/threadSettingsMachine";
import {
  workflowSyncMachine,
  analyzeWorkflowSync,
  performWorkflowSync,
} from "../../machines/thread/workflowSyncMachine";
import {
  checkpointCompactionMachine,
  performCheckpointCompaction,
} from "../../machines/thread/checkpointCompactionMachine";

interface ThreadSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  threadId: string;
  initialTitle: string;
  initialPresetId: string;
  presets: any[];
  onSaveSuccess: () => void;
}

export function ThreadSettingsModal({
  isOpen,
  onClose,
  threadId,
  initialTitle,
  initialPresetId,
  presets,
  onSaveSuccess,
}: ThreadSettingsModalProps) {
  const [settingsState, settingsSend] = useMachine(threadSettingsMachine);
  const [syncState, syncSend] = useMachine(workflowSyncMachine);
  const [compactionState, compactionSend] = useMachine(checkpointCompactionMachine);

  React.useEffect(() => {
    if (isOpen) {
      settingsSend({
        type: "OPEN",
        threadId,
        threadTitle: initialTitle,
        selectedPresetId: initialPresetId,
        presets,
      });
    } else {
      settingsSend({ type: "CLOSE" });
    }
  }, [isOpen, threadId, initialTitle, initialPresetId, presets, settingsSend]);

  // Handle Workflow Sync async logic
  React.useEffect(() => {
    if (syncState.matches("analyzing")) {
      analyzeWorkflowSync(threadId)
        .then((res) => {
          syncSend({ type: "ANALYSIS_COMPLETE", ...res });
        })
        .catch((err) => {
          syncSend({ type: "ANALYSIS_FAILURE", error: err.message });
        });
    }
    if (syncState.matches("syncing")) {
      performWorkflowSync(threadId, syncState.context.isDestructive)
        .then(() => {
          syncSend({ type: "SYNC_SUCCESS" });
        })
        .catch((err) => {
          syncSend({ type: "SYNC_FAILURE", error: err.message });
        });
    }
  }, [syncState.value, threadId, syncSend]);

  // Handle Compaction async logic
  React.useEffect(() => {
    if (compactionState.matches("compacting")) {
      performCheckpointCompaction(threadId)
        .then(() => {
          compactionSend({ type: "COMPACT_SUCCESS" });
        })
        .catch((err) => {
          compactionSend({ type: "COMPACT_FAILURE", error: err.message });
        });
    }
  }, [compactionState.value, threadId, compactionSend]);

  const handleSave = async () => {
    try {
      await saveThreadSettings(
        settingsState.context.threadId,
        settingsState.context.threadTitle,
        settingsState.context.selectedPresetId,
      );
      settingsSend({ type: "SAVE_SUCCESS" });
      onSaveSuccess();
    } catch (err: any) {
      settingsSend({ type: "SAVE_FAILURE", error: err.message });
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      open={isOpen}
      modalHeading="Thread Settings"
      primaryButtonText="Save"
      onRequestSubmit={handleSave}
      secondaryButtonText="Cancel"
      onRequestClose={onClose}
    >
      <ModalBody>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {settingsState.context.errorMessage && (
            <InlineNotification
              kind="error"
              title="Error"
              subtitle={settingsState.context.errorMessage}
              onClose={() => settingsSend({ type: "DISMISS_ERROR" })}
            />
          )}

          <TextInput
            id="thread-title"
            labelText="Thread Title"
            value={settingsState.context.threadTitle}
            readOnly={!settingsState.context.isEditingTitle}
            onChange={(e) => settingsSend({ type: "UPDATE_TITLE", title: e.target.value })}
          >
            {!settingsState.context.isEditingTitle && (
              <Button
                kind="ghost"
                size="sm"
                onClick={() => settingsSend({ type: "EDIT_TITLE" })}
                style={{ position: "absolute", right: "1rem", top: "2.5rem" }}
              >
                <Edit size={16} />
              </Button>
            )}
          </TextInput>

          <Dropdown
            id="preset-select"
            titleText="Active Preset"
            label="Active Preset"
            defaultValue={settingsState.context.selectedPresetId}
            items={presets.map((p) => ({ id: p.id, text: p.name }))}
            onChange={(e) =>
              settingsSend({ type: "CHANGE_PRESET", presetId: (e as any).target.value })
            }
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <Button
              kind="ghost"
              onClick={() => settingsSend({ type: "TRIGGER_SYNC" })}
              disabled={settingsState.matches("opened.saving")}
            >
              Sync Workflow Snapshot
            </Button>

            <Button
              kind="ghost"
              onClick={() => settingsSend({ type: "TRIGGER_COMPACTION" })}
              disabled={settingsState.matches("opened.saving")}
            >
              Compact Checkpoints
            </Button>

            <Button
              kind="danger"
              onClick={() => settingsSend({ type: "TRIGGER_DELETE" })}
              disabled={settingsState.matches("opened.saving")}
            >
              Delete Thread
            </Button>
          </div>

          {/* Workflow Sync UI Overlay/Section */}
          {syncState.value !== "idle" && (
            <div
              style={{
                padding: "1rem",
                background: "#f4f4f4",
                borderRadius: "4px",
                border: "1px solid #ddd",
              }}
            >
              <strong>Workflow Sync</strong>
              {syncState.matches("analyzing") && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Loading /> <span>Analyzing workflow diff...</span>
                </div>
              )}
              {syncState.matches("prompting") && (
                <div>
                  <p>
                    {syncState.context.isDestructive
                      ? "Hard Sync: Graph topology has changed. This will purge all history and checkpoints."
                      : "Soft Sync: Only system prompts/presets changed. History will be preserved."}
                  </p>
                  <Button size="sm" onClick={() => syncSend({ type: "CONFIRM_SYNC" })}>
                    Confirm Sync
                  </Button>
                  <Button size="sm" kind="ghost" onClick={() => syncSend({ type: "CANCEL_SYNC" })}>
                    Cancel
                  </Button>
                </div>
              )}
              {syncState.matches("syncing") && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Loading /> <span>Syncing workflow...</span>
                </div>
              )}
              {syncState.matches("success") && (
                <div>
                  <p>Sync successful!</p>
                  <Button size="sm" onClick={() => syncSend({ type: "DISMISS" })}>
                    OK
                  </Button>
                </div>
              )}
              {syncState.matches("failure") && (
                <div>
                  <p style={{ color: "red" }}>{syncState.context.errorMessage}</p>
                  <Button size="sm" onClick={() => syncSend({ type: "DISMISS" })}>
                    OK
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Compaction UI Overlay/Section */}
          {compactionState.value !== "idle" && (
            <div
              style={{
                padding: "1rem",
                background: "#f4f4f4",
                borderRadius: "4px",
                border: "1px solid #ddd",
              }}
            >
              <strong>Checkpoint Compaction</strong>
              {compactionState.matches("confirming") && (
                <div>
                  <p>
                    Warning: This will delete all historical checkpoints. You will not be able to
                    branch or edit older messages.
                  </p>
                  <Button
                    size="sm"
                    kind="danger"
                    onClick={() => compactionSend({ type: "CONFIRM_COMPACT" })}
                  >
                    Confirm Purge
                  </Button>
                  <Button
                    size="sm"
                    kind="ghost"
                    onClick={() => compactionSend({ type: "CANCEL_COMPACT" })}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              {compactionState.matches("compacting") && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Loading /> <span>Compacting checkpoints...</span>
                </div>
              )}
              {compactionState.matches("success") && (
                <div>
                  <p>Compaction successful!</p>
                  <Button size="sm" onClick={() => compactionSend({ type: "DISMISS" })}>
                    OK
                  </Button>
                </div>
              )}
              {compactionState.matches("failure") && (
                <div>
                  <p style={{ color: "red" }}>{compactionState.context.errorMessage}</p>
                  <Button size="sm" onClick={() => compactionSend({ type: "DISMISS" })}>
                    OK
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
