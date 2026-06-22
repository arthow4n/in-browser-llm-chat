import { useMachine } from "@xstate/react";
import { storageManagementMachine } from "./storage-management-machine";

export interface StorageManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StorageManagementModal({ isOpen, onClose }: StorageManagementModalProps) {
  const [state, send] = useMachine(storageManagementMachine);

  if (!isOpen) return null;

  const context = state.context;
  const isLoading = state.matches("loading");
  const isExporting = state.matches("exporting");
  const isImporting = state.matches("importing");
  const isConfirmingReset = state.matches("confirmingFactoryReset");
  const isResetting = state.matches("factoryResetting");

  const isDisabled = isLoading || isExporting || isImporting || isResetting;

  const formatBytes = (bytes: number | null) => {
    if (bytes === null) return "Unknown";
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = 2;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      send({ type: "IMPORT_DATA", file });
    }
  };

  return (
    <div className="modal-backdrop" data-testid="storage-management-modal">
      <div className="modal-content settings-modal storage-modal">
        <header className="modal-header">
          <h2>Storage & Data Management</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
            disabled={isDisabled}
          >
            ✕
          </button>
        </header>

        {context.errorMessage && (
          <div className="banner error-banner" role="alert" data-testid="storage-error-banner">
            <span className="banner-icon">⚠</span>
            <span className="banner-text">{context.errorMessage}</span>
            <button
              type="button"
              className="dismiss-banner-btn"
              onClick={() => send({ type: "DISMISS_ERROR" })}
            >
              ×
            </button>
          </div>
        )}

        <div className="modal-body">
          {isLoading ? (
            <div className="settings-skeleton-container" data-testid="storage-skeleton">
              <div className="skeleton skeleton-title"></div>
              <div className="skeleton skeleton-field"></div>
              <div className="skeleton skeleton-field"></div>
            </div>
          ) : isConfirmingReset ? (
            <div className="factory-reset-confirmation" data-testid="factory-reset-confirmation">
              <div className="danger-zone-alert">
                <h3>⚠ WARNING: Permanent Data Loss ⚠</h3>
                <p>
                  This action will permanently delete the entire local database including all
                  settings, API keys, presets, workflows, threads, messages, and checkpoints. This
                  cannot be undone.
                </p>
                <p>
                  Please type <strong>RESET</strong> in the field below to confirm this action.
                </p>
              </div>

              <div className="form-group" style={{ marginTop: "1rem" }}>
                <label htmlFor="confirm-reset-input">Confirmation Input</label>
                <input
                  id="confirm-reset-input"
                  type="text"
                  className="settings-input"
                  value={context.resetConfirmationText}
                  onChange={(e) =>
                    send({ type: "UPDATE_RESET_CONFIRMATION_TEXT", text: e.target.value })
                  }
                  placeholder="Type 'RESET' to confirm"
                  data-testid="confirm-reset-input"
                  style={{ textTransform: "uppercase" }}
                />
              </div>

              <div className="modal-footer" style={{ marginTop: "1.5rem", padding: 0 }}>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    send({ type: "CANCEL_FACTORY_RESET" });
                  }}
                  data-testid="cancel-factory-reset-btn"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-btn danger-btn"
                  disabled={context.resetConfirmationText !== "RESET"}
                  onClick={() => {
                    send({ type: "CONFIRM_FACTORY_RESET" });
                  }}
                  data-testid="confirm-factory-reset-btn"
                >
                  Confirm Reset
                </button>
              </div>
            </div>
          ) : (
            <div className="storage-management-content">
              {/* Storage Stats */}
              <div className="storage-section">
                <h3>Database Storage Estimate</h3>
                <div className="storage-usage-display" data-testid="storage-usage-display">
                  <span className="storage-usage-number">{formatBytes(context.storageUsage)}</span>
                  <span className="storage-usage-desc">
                    estimated space used by database in your browser.
                  </span>
                </div>
              </div>

              {/* Backup & Restore */}
              <div className="storage-section grid-2">
                <div className="card-sub-section">
                  <h4>Export Database Backup</h4>
                  <p>Save all database stores as a JSON file to your local computer.</p>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => send({ type: "EXPORT_DATA" })}
                    disabled={isDisabled}
                    data-testid="export-db-btn"
                  >
                    {isExporting ? "Exporting..." : "Export Backup (JSON)"}
                  </button>
                </div>

                <div className="card-sub-section">
                  <h4>Import Database Backup</h4>
                  <p>Restore database stores from a JSON file backup. This clears existing data!</p>
                  <label
                    className="file-input-label primary-btn secondary-btn"
                    style={{ display: "inline-block", cursor: "pointer", width: "auto" }}
                  >
                    {isImporting ? "Importing..." : "Import Backup (JSON)"}
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileChange}
                      disabled={isDisabled}
                      style={{ display: "none" }}
                      data-testid="import-db-input"
                    />
                  </label>
                </div>
              </div>

              {/* Inspect & Manage Threads */}
              <div className="storage-section">
                <div className="section-header">
                  <h3>Conversations Inspection</h3>
                  {context.selectedThreads.length > 0 && (
                    <button
                      type="button"
                      className="primary-btn danger-btn"
                      onClick={() => {
                        if (
                          confirm(
                            `Are you sure you want to delete ${context.selectedThreads.length} selected thread(s)?`,
                          )
                        ) {
                          send({ type: "BULK_DELETE_THREADS" });
                        }
                      }}
                      disabled={isDisabled}
                      data-testid="bulk-delete-btn"
                    >
                      Delete Selected ({context.selectedThreads.length})
                    </button>
                  )}
                </div>
                <p className="section-description">
                  Select large threads to perform cascading bulk deletion to reclaim space.
                </p>

                <div className="threads-inspection-list" data-testid="threads-inspection-list">
                  {context.threadsList.length === 0 ? (
                    <div className="empty-state">No threads found in database.</div>
                  ) : (
                    context.threadsList.map((t) => {
                      const isSelected = context.selectedThreads.includes(t.id);
                      return (
                        <div
                          key={t.id}
                          className={`thread-inspection-row ${isSelected ? "selected" : ""}`}
                          onClick={() => send({ type: "TOGGLE_THREAD_SELECTION", threadId: t.id })}
                          data-testid={`thread-row-${t.id}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // toggled by row click
                            onClick={(e) => e.stopPropagation()}
                            disabled={isDisabled}
                            aria-label={`Select thread ${t.title}`}
                          />
                          <div className="thread-inspection-title">
                            {t.title || "Untitled Chat"}
                          </div>
                          <div className="thread-inspection-stats">
                            {t.tokenStats &&
                            typeof t.tokenStats === "object" &&
                            "totalTokens" in t.tokenStats
                              ? `${(t.tokenStats as { totalTokens: number }).totalTokens} tokens`
                              : "No token stats"}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Factory Reset */}
              <div className="storage-section danger-section">
                <h3>Danger Zone</h3>
                <p className="section-description">
                  Reset the application back to factory settings. Wipes all data completely.
                </p>
                <button
                  type="button"
                  className="primary-btn danger-btn"
                  onClick={() => send({ type: "TRIGGER_FACTORY_RESET" })}
                  disabled={isDisabled}
                  data-testid="factory-reset-btn"
                >
                  Factory Reset Database
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
