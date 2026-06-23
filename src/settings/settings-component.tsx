import { useEffect } from "react";
import { useMachine } from "@xstate/react";
import { settingsFormMachine } from "./settings-machine";
import { StorageManagementModal } from "./storage-management-modal";

export interface SettingsComponentProps {
  onThemeChange?: (theme: "light" | "dark" | "system") => void;
  onSettingsSave?: (settings: { theme: "light" | "dark" | "system"; hasApiKeys: boolean }) => void;
  mode?: "onboarding" | "global";
}

export function SettingsComponent({ onThemeChange, onSettingsSave, mode }: SettingsComponentProps) {
  const [state, send] = useMachine(settingsFormMachine);
  const context = state.context;

  const isSaving = state.matches("saving");
  const isValidating = state.matches("validating");
  const isLoading = state.matches("loading");
  const isTesting = state.matches("testingConnection");
  const isError = state.matches("error");

  const isDisabled = isLoading || isSaving || isValidating || isTesting;

  useEffect(() => {
    if (
      state.matches({ idle: "clean" }) &&
      context.successMessage === "Settings saved successfully!"
    ) {
      onSettingsSave?.({
        theme: context.theme,
        hasApiKeys: !!(context.openRouterApiKey || context.geminiApiKey),
      });
    }
  }, [
    state,
    context.successMessage,
    context.theme,
    context.openRouterApiKey,
    context.geminiApiKey,
    onSettingsSave,
  ]);

  const handleFieldChange = (
    field: "openRouterApiKey" | "geminiApiKey" | "theme",
    value: string,
  ) => {
    send({ type: "EDIT_FIELD", field, value });
    if (field === "theme" && onThemeChange) {
      onThemeChange(value as "light" | "dark" | "system");
    }
  };

  if (isLoading) {
    return (
      <div className="settings-skeleton-container" data-testid="settings-skeleton">
        <div className="skeleton skeleton-title"></div>
        <div className="skeleton skeleton-field"></div>
        <div className="skeleton skeleton-field"></div>
        <div className="skeleton skeleton-field"></div>
      </div>
    );
  }

  return (
    <div className="settings-panel-container">
      {mode !== "onboarding" && mode !== "global" && (
        <header className="settings-header">
          <h2>Global Settings</h2>
          <p className="settings-subtitle">
            Configure API keys, UI theme preferences, and injected system message pipelines.
          </p>
        </header>
      )}

      {/* Success & Error Banners */}
      {context.successMessage && (
        <div className="banner success-banner" role="status" data-testid="success-banner">
          <span className="banner-icon">✓</span>
          <span className="banner-text">{context.successMessage}</span>
        </div>
      )}

      {context.errorMessage && (
        <div className="banner error-banner" role="alert" data-testid="error-banner">
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: "SAVE" });
        }}
        className="settings-form"
        noValidate
      >
        {/* Section: API Configurations */}
        <section className="settings-section">
          <h3>API Keys</h3>
          <div className="settings-group">
            <div className="settings-field">
              <label htmlFor="gemini-key">Gemini API Key</label>
              <div className="input-with-actions">
                <input
                  id="gemini-key"
                  type={context.showGeminiKey ? "text" : "password"}
                  value={context.geminiApiKey}
                  onChange={(e) => handleFieldChange("geminiApiKey", e.target.value)}
                  placeholder="Enter Gemini API Key"
                  disabled={isDisabled}
                  className="settings-input"
                  data-testid="gemini-api-key-input"
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => send({ type: "TOGGLE_KEY_VISIBILITY", provider: "gemini" })}
                  disabled={isDisabled}
                  aria-label={context.showGeminiKey ? "Hide Gemini API Key" : "Show Gemini API Key"}
                >
                  {context.showGeminiKey ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      width="18"
                      height="18"
                      className="icon-svg"
                    >
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      width="18"
                      height="18"
                      className="icon-svg"
                    >
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  className="test-conn-btn"
                  onClick={() => send({ type: "TEST_CONNECTION", provider: "gemini" })}
                  disabled={isDisabled || !context.geminiApiKey}
                  data-testid="test-gemini-connection-btn"
                >
                  {isTesting && context.lastTestProvider === "gemini" ? (
                    <span className="spinner small-spinner"></span>
                  ) : (
                    "Test"
                  )}
                </button>
              </div>
            </div>

            <div className="settings-field">
              <label htmlFor="openrouter-key">OpenRouter API Key</label>
              <div className="input-with-actions">
                <input
                  id="openrouter-key"
                  type={context.showOpenRouterKey ? "text" : "password"}
                  value={context.openRouterApiKey}
                  onChange={(e) => handleFieldChange("openRouterApiKey", e.target.value)}
                  placeholder="Enter OpenRouter API Key"
                  disabled={isDisabled}
                  className="settings-input"
                  data-testid="openrouter-api-key-input"
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => send({ type: "TOGGLE_KEY_VISIBILITY", provider: "openrouter" })}
                  disabled={isDisabled}
                  aria-label={
                    context.showOpenRouterKey
                      ? "Hide OpenRouter API Key"
                      : "Show OpenRouter API Key"
                  }
                >
                  {context.showOpenRouterKey ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      width="18"
                      height="18"
                      className="icon-svg"
                    >
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      width="18"
                      height="18"
                      className="icon-svg"
                    >
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  className="test-conn-btn"
                  onClick={() => send({ type: "TEST_CONNECTION", provider: "openrouter" })}
                  disabled={isDisabled || !context.openRouterApiKey}
                  data-testid="test-openrouter-connection-btn"
                >
                  {isTesting && context.lastTestProvider === "openrouter" ? (
                    <span className="spinner small-spinner"></span>
                  ) : (
                    "Test"
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Section: UI Customization */}
        {mode !== "onboarding" && (
          <section className="settings-section">
            <h3>Appearance</h3>
            <div className="settings-field">
              <label htmlFor="theme-select">Theme Override</label>
              <select
                id="theme-select"
                value={context.theme}
                onChange={(e) => handleFieldChange("theme", e.target.value)}
                disabled={isDisabled}
                className="settings-select"
                data-testid="theme-select"
              >
                <option value="system">Follow System Settings</option>
                <option value="light">Light Mode</option>
                <option value="dark">Dark Mode</option>
              </select>
            </div>
          </section>
        )}

        {/* Section: Storage & Data Management */}
        {mode !== "onboarding" && (
          <section className="settings-section">
            <h3>Storage & Data Management</h3>
            <p className="section-description">
              Inspect IndexedDB storage usage, export database backups, import backups, or perform a
              factory reset.
            </p>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => send({ type: "OPEN_STORAGE_MANAGEMENT" })}
              data-testid="manage-storage-btn"
              style={{ width: "auto" }}
            >
              Manage Storage
            </button>
          </section>
        )}

        {/* Section: Injected System Messages */}
        {mode !== "onboarding" && (
          <section className="settings-section">
            <div className="section-header">
              <h3>Injected System Messages</h3>
              <button
                type="button"
                className="add-btn"
                onClick={() => send({ type: "ADD_INJECTED_MESSAGE" })}
                disabled={isDisabled}
                data-testid="add-system-message-btn"
              >
                + Add Pipeline
              </button>
            </div>
            <p className="section-description">
              System messages automatically merged at target history indices (depth) before sending
              payloads.
            </p>

            <div className="system-messages-list">
              {context.injectedSystemMessages.length === 0 ? (
                <div className="empty-state">No injected system messages configured.</div>
              ) : (
                context.injectedSystemMessages.map((msg, index) => {
                  const depthError = context.validationErrors[`depth_${index}`];
                  return (
                    <div
                      key={index}
                      className="system-message-row"
                      data-testid={`system-message-row-${index}`}
                    >
                      <div className="message-content-field">
                        <label htmlFor={`msg-content-${index}`} className="sr-only">
                          System Message Content
                        </label>
                        <textarea
                          id={`msg-content-${index}`}
                          value={msg.content}
                          onChange={(e) =>
                            send({
                              type: "UPDATE_INJECTED_MESSAGE",
                              index,
                              field: "content",
                              value: e.target.value,
                            })
                          }
                          placeholder="System instructions..."
                          disabled={isDisabled}
                          className="settings-textarea"
                          data-testid={`system-message-content-${index}`}
                        />
                      </div>
                      <div className="message-depth-field">
                        <label htmlFor={`msg-depth-${index}`}>Depth</label>
                        <input
                          id={`msg-depth-${index}`}
                          type="number"
                          value={msg.depth}
                          onChange={(e) =>
                            send({
                              type: "UPDATE_INJECTED_MESSAGE",
                              index,
                              field: "depth",
                              value: e.target.value,
                            })
                          }
                          disabled={isDisabled}
                          className={`settings-input depth-input ${depthError ? "input-error" : ""}`}
                          data-testid={`system-message-depth-${index}`}
                        />
                        {depthError && (
                          <span
                            className="error-text"
                            role="alert"
                            data-testid={`depth-error-${index}`}
                          >
                            {depthError}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="delete-btn"
                        onClick={() => send({ type: "REMOVE_INJECTED_MESSAGE", index })}
                        disabled={isDisabled}
                        aria-label="Remove system message"
                        data-testid={`remove-system-message-${index}`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          width="18"
                          height="18"
                          className="icon-svg"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* Form Controls / Footer */}
        <footer className="settings-footer">
          {mode !== "onboarding" && (
            <button
              type="button"
              className="secondary-btn"
              onClick={() => send({ type: "RESET_FIELDS" })}
              disabled={isDisabled || !context.isDirty}
              data-testid="reset-settings-btn"
            >
              Reset Fields
            </button>
          )}
          <button
            type="submit"
            className="primary-btn"
            disabled={isDisabled || (!context.isDirty && !isError)}
            data-testid="save-settings-btn"
          >
            {isSaving ? (
              <>
                <span className="spinner small-spinner"></span>
                <span>Saving...</span>
              </>
            ) : (
              "Save Settings"
            )}
          </button>
        </footer>
      </form>

      <StorageManagementModal
        isOpen={context.isStorageOpen}
        onClose={() => send({ type: "CLOSE_STORAGE_MANAGEMENT" })}
      />
    </div>
  );
}
