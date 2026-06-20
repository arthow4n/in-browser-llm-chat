import { useMachine } from "@xstate/react";
import { presetsMachine } from "./presets-machine";

export function PresetsComponent() {
  const [state, send] = useMachine(presetsMachine);
  const context = state.context;

  const isLoading = state.matches("loading");
  const isList = state.matches("list");
  const isCreating = state.matches("creating");
  const isEditing = state.matches("editing");
  const isSaving = state.matches("saving");
  const isDeleting = state.matches("deleting");
  const isDeleteConfirm = state.matches("deleteConfirm");
  const isTesting = context.isTesting;

  const isFormState =
    isCreating ||
    isEditing ||
    state.matches("validating") ||
    state.matches("testingConnection") ||
    state.matches("saving");
  const isDisabled = isSaving || isTesting || state.matches("validating");

  if (isLoading) {
    return (
      <div className="settings-skeleton-container" data-testid="presets-skeleton">
        <div className="skeleton skeleton-title"></div>
        <div className="skeleton skeleton-field"></div>
        <div className="skeleton skeleton-field"></div>
        <div className="skeleton skeleton-field"></div>
      </div>
    );
  }

  return (
    <div className="settings-panel-container">
      {/* Alert Banners */}
      {context.successMessage && (
        <div className="banner success-banner" role="status" data-testid="presets-success-banner">
          <span className="banner-icon">✓</span>
          <span className="banner-text">{context.successMessage}</span>
          <button
            type="button"
            className="dismiss-banner-btn"
            onClick={() => send({ type: "DISMISS_ALERT" })}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      {context.errorMessage && (
        <div className="banner error-banner" role="alert" data-testid="presets-error-banner">
          <span className="banner-icon">⚠</span>
          <span className="banner-text">{context.errorMessage}</span>
          <button
            type="button"
            className="dismiss-banner-btn"
            onClick={() => send({ type: "DISMISS_ALERT" })}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Preset List View */}
      {isList && (
        <div className="presets-list-view">
          <header
            className="settings-header"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <div>
              <h2>LLM Presets</h2>
              <p className="settings-subtitle">
                Create and manage models, custom API keys, and execution budgets.
              </p>
            </div>
            <button
              type="button"
              className="primary-btn add-preset-btn"
              onClick={() => send({ type: "ADD_PRESET" })}
              data-testid="create-preset-btn"
              style={{ minHeight: "40px", height: "40px" }}
            >
              + Create Preset
            </button>
          </header>

          <div className="presets-table-wrapper" style={{ marginTop: "1.5rem" }}>
            {context.presets.length === 0 ? (
              <div
                className="empty-state"
                style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}
              >
                No presets found. Click "+ Create Preset" to add one.
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
                      Provider
                    </th>
                    <th
                      style={{
                        padding: "0.75rem 1rem",
                        color: "var(--text-secondary)",
                        fontWeight: 500,
                        fontSize: "0.85rem",
                      }}
                    >
                      Model
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
                  {context.presets.map((preset) => (
                    <tr
                      key={preset.id}
                      style={{ borderBottom: "1px solid var(--surface-border)" }}
                      data-testid={`preset-row-${preset.id}`}
                    >
                      <td style={{ padding: "1rem", fontWeight: 500 }}>{preset.name}</td>
                      <td style={{ padding: "1rem", textTransform: "capitalize" }}>
                        {preset.provider}
                      </td>
                      <td style={{ padding: "1rem" }}>{preset.model}</td>
                      <td style={{ padding: "1rem", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => send({ type: "EDIT_PRESET", preset })}
                            data-testid={`edit-preset-${preset.id}`}
                            style={{
                              minHeight: "36px",
                              height: "36px",
                              padding: "0 0.75rem",
                              fontSize: "0.8rem",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="delete-btn"
                            onClick={() => send({ type: "DELETE_PRESET_CLICK", preset })}
                            data-testid={`delete-preset-${preset.id}`}
                            style={{ minHeight: "36px", height: "36px", width: "36px", padding: 0 }}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal/Blocker */}
      {isDeleteConfirm && context.presetToDelete && (
        <div
          className="delete-confirm-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(4px)",
          }}
          data-testid="delete-confirm-modal"
        >
          <div
            className="delete-confirm-modal"
            style={{
              background: "var(--surface-bg)",
              border: "1px solid var(--surface-border)",
              borderRadius: "16px",
              padding: "2rem",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "var(--shadow)",
            }}
          >
            <h3 style={{ marginBottom: "1rem" }}>Confirm Deletion</h3>
            <p
              style={{
                color: "var(--text-secondary)",
                marginBottom: "1.5rem",
                fontSize: "0.95rem",
                lineHeight: 1.5,
              }}
            >
              Are you sure you want to delete preset <strong>{context.presetToDelete.name}</strong>?
              This action cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => send({ type: "CANCEL_DELETE" })}
                disabled={isDeleting}
                data-testid="cancel-delete-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-btn"
                onClick={() => send({ type: "CONFIRM_DELETE" })}
                disabled={isDeleting}
                data-testid="confirm-delete-btn"
                style={{ padding: "0 1.25rem", minWidth: "100px" }}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preset Form View (Create / Edit) */}
      {isFormState && context.currentPreset && (
        <div className="preset-form-view">
          <header className="settings-header">
            <h2>{isCreating ? "Create LLM Preset" : "Edit LLM Preset"}</h2>
            <p className="settings-subtitle">
              Configure parameters, connection settings, and safety policies.
            </p>
          </header>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send({ type: "SUBMIT_FORM" });
            }}
            className="settings-form"
            noValidate
          >
            <div className="settings-section">
              <h3>General Configuration</h3>
              <div className="settings-group">
                <div className="settings-field">
                  <label htmlFor="preset-name">Preset Name *</label>
                  <input
                    id="preset-name"
                    type="text"
                    value={context.currentPreset.name}
                    onChange={(e) =>
                      send({ type: "UPDATE_FIELD", field: "name", value: e.target.value })
                    }
                    placeholder="My Gemini Preset"
                    disabled={isDisabled}
                    className={`settings-input ${context.validationErrors.name ? "input-error" : ""}`}
                    data-testid="preset-name-input"
                  />
                  {context.validationErrors.name && (
                    <span className="error-text" role="alert" data-testid="name-error">
                      {context.validationErrors.name}
                    </span>
                  )}
                </div>

                <div className="settings-field">
                  <label htmlFor="preset-provider">Provider</label>
                  <select
                    id="preset-provider"
                    value={context.currentPreset.provider}
                    onChange={(e) =>
                      send({ type: "UPDATE_FIELD", field: "provider", value: e.target.value })
                    }
                    disabled={isDisabled}
                    className="settings-select"
                    data-testid="preset-provider-select"
                  >
                    <option value="gemini">Gemini</option>
                    <option value="openrouter">OpenRouter</option>
                  </select>
                </div>

                <div className="settings-field">
                  <label htmlFor="preset-model">Model Identification *</label>
                  <input
                    id="preset-model"
                    type="text"
                    value={context.currentPreset.model}
                    onChange={(e) =>
                      send({ type: "UPDATE_FIELD", field: "model", value: e.target.value })
                    }
                    placeholder="gemini-2.5-flash"
                    disabled={isDisabled}
                    className={`settings-input ${context.validationErrors.model ? "input-error" : ""}`}
                    data-testid="preset-model-input"
                  />
                  {context.validationErrors.model && (
                    <span className="error-text" role="alert" data-testid="model-error">
                      {context.validationErrors.model}
                    </span>
                  )}
                </div>

                <div className="settings-field">
                  <label htmlFor="preset-key">API Key Override (Optional)</label>
                  <input
                    id="preset-key"
                    type="password"
                    value={context.currentPreset.apiKey || ""}
                    onChange={(e) =>
                      send({ type: "UPDATE_FIELD", field: "apiKey", value: e.target.value })
                    }
                    placeholder="Leaves blank to use Global Setting"
                    disabled={isDisabled}
                    className="settings-input"
                    data-testid="preset-apiKey-input"
                  />
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h3>Model Hyperparameters</h3>
              <div className="settings-group">
                <div className="settings-field">
                  <label htmlFor="preset-temp">
                    Temperature: {context.currentPreset.temperature.toFixed(1)}
                  </label>
                  <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                    <input
                      id="preset-temp-range"
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={context.currentPreset.temperature}
                      onChange={(e) =>
                        send({ type: "UPDATE_FIELD", field: "temperature", value: e.target.value })
                      }
                      disabled={isDisabled}
                      style={{ flex: 1, accentColor: "var(--accent-color)" }}
                    />
                    <input
                      id="preset-temp"
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={context.currentPreset.temperature}
                      onChange={(e) =>
                        send({ type: "UPDATE_FIELD", field: "temperature", value: e.target.value })
                      }
                      disabled={isDisabled}
                      className={`settings-input ${context.validationErrors.temperature ? "input-error" : ""}`}
                      style={{ width: "70px", padding: "0.5rem" }}
                      data-testid="preset-temperature-input"
                    />
                  </div>
                  {context.validationErrors.temperature && (
                    <span className="error-text" role="alert" data-testid="temperature-error">
                      {context.validationErrors.temperature}
                    </span>
                  )}
                </div>

                <div className="settings-field">
                  <label htmlFor="preset-max-tokens">Max Completion Tokens</label>
                  <input
                    id="preset-max-tokens"
                    type="number"
                    value={
                      context.currentPreset.maxTokens === null
                        ? ""
                        : context.currentPreset.maxTokens
                    }
                    onChange={(e) =>
                      send({ type: "UPDATE_FIELD", field: "maxTokens", value: e.target.value })
                    }
                    placeholder="Unlimited"
                    disabled={isDisabled}
                    className={`settings-input ${context.validationErrors.maxTokens ? "input-error" : ""}`}
                    data-testid="preset-maxTokens-input"
                  />
                  {context.validationErrors.maxTokens && (
                    <span className="error-text" role="alert" data-testid="maxTokens-error">
                      {context.validationErrors.maxTokens}
                    </span>
                  )}
                </div>

                <div className="settings-field">
                  <label htmlFor="preset-reasoning">Reasoning Level (Optional)</label>
                  <input
                    id="preset-reasoning"
                    type="text"
                    value={context.currentPreset.reasoningLevel || ""}
                    onChange={(e) =>
                      send({ type: "UPDATE_FIELD", field: "reasoningLevel", value: e.target.value })
                    }
                    placeholder="e.g. low, medium, high"
                    disabled={isDisabled}
                    className="settings-input"
                    data-testid="preset-reasoningLevel-input"
                  />
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h3>Agent Execution Budgets</h3>
              <div className="settings-group">
                <div className="settings-field">
                  <label htmlFor="preset-max-steps">Max Steps Without User Interrupt *</label>
                  <input
                    id="preset-max-steps"
                    type="number"
                    value={context.currentPreset.budgetPolicy.maxStepsWithoutUser}
                    onChange={(e) =>
                      send({
                        type: "UPDATE_BUDGET_FIELD",
                        field: "maxStepsWithoutUser",
                        value: e.target.value,
                      })
                    }
                    disabled={isDisabled}
                    className={`settings-input ${context.validationErrors.maxStepsWithoutUser ? "input-error" : ""}`}
                    data-testid="preset-maxStepsWithoutUser-input"
                  />
                  {context.validationErrors.maxStepsWithoutUser && (
                    <span
                      className="error-text"
                      role="alert"
                      data-testid="maxStepsWithoutUser-error"
                    >
                      {context.validationErrors.maxStepsWithoutUser}
                    </span>
                  )}
                </div>

                <div className="settings-field">
                  <label htmlFor="preset-budget-tokens">Max Tokens Per Execution Run</label>
                  <input
                    id="preset-budget-tokens"
                    type="number"
                    value={
                      context.currentPreset.budgetPolicy.maxTokensPerRun === null
                        ? ""
                        : context.currentPreset.budgetPolicy.maxTokensPerRun
                    }
                    onChange={(e) =>
                      send({
                        type: "UPDATE_BUDGET_FIELD",
                        field: "maxTokensPerRun",
                        value: e.target.value,
                      })
                    }
                    placeholder="Unlimited"
                    disabled={isDisabled}
                    className={`settings-input ${context.validationErrors.maxTokensPerRun ? "input-error" : ""}`}
                    data-testid="preset-maxTokensPerRun-input"
                  />
                  {context.validationErrors.maxTokensPerRun && (
                    <span className="error-text" role="alert" data-testid="maxTokensPerRun-error">
                      {context.validationErrors.maxTokensPerRun}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Connection Test Display inside Form */}
            {(context.testSuccess !== null || context.testError !== null || isTesting) && (
              <div style={{ marginBottom: "1.5rem" }}>
                {isTesting && (
                  <div
                    className="banner success-banner"
                    style={{
                      background: "rgba(99, 102, 241, 0.1)",
                      borderColor: "rgba(99, 102, 241, 0.2)",
                      color: "#818cf8",
                    }}
                    data-testid="connection-testing-banner"
                  >
                    <span
                      className="spinner small-spinner"
                      style={{ marginRight: "0.5rem" }}
                    ></span>
                    Testing API connection...
                  </div>
                )}
                {context.testSuccess && (
                  <div
                    className="banner success-banner"
                    role="status"
                    data-testid="connection-success-banner"
                  >
                    <span className="banner-icon">✓</span>
                    <span className="banner-text">Connection test successful!</span>
                  </div>
                )}
                {context.testError && (
                  <div
                    className="banner error-banner"
                    role="alert"
                    data-testid="connection-error-banner"
                  >
                    <span className="banner-icon">⚠</span>
                    <span className="banner-text">{context.testError}</span>
                  </div>
                )}
              </div>
            )}

            <footer className="settings-footer" style={{ display: "flex", gap: "1rem" }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => send({ type: "TEST_CONNECTION" })}
                disabled={isDisabled}
                data-testid="test-preset-connection-btn"
                style={{ marginRight: "auto" }}
              >
                Test Connection
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => send({ type: "CANCEL_FORM" })}
                disabled={isDisabled}
                data-testid="cancel-preset-btn"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-btn"
                disabled={isDisabled}
                data-testid="save-preset-btn"
              >
                {isSaving ? "Saving..." : "Save Preset"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
