import { useMachine } from "@xstate/react";
import { loopControlMachine } from "./loop-control-machine";
import { useEffect } from "react";

export interface LoopControlPanelProps {
  workflowType: "loop" | "sequential";
  currentRound: number;
  turnCount: number;
  tokenStats: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  executionState: "inactive" | "executing" | "awaiting_input" | "error";
  hasCheckpoint: boolean;
  onPause: () => Promise<void> | void;
  onResume: () => Promise<void> | void;
  onAbort: () => Promise<void> | void;
  onForceConsensus?: () => Promise<void> | void;
  onForceSummarize?: () => Promise<void> | void;
}

export function LoopControlPanel({
  workflowType,
  currentRound,
  turnCount,
  tokenStats,
  executionState,
  hasCheckpoint,
  onPause,
  onResume,
  onAbort,
  onForceConsensus,
  onForceSummarize,
}: LoopControlPanelProps) {
  const [state, send] = useMachine(loopControlMachine);

  // Sync state stats from props
  useEffect(() => {
    send({
      type: "SHOW_PANEL",
      workflowType,
      initialStats: {
        currentRound,
        turnCount,
        tokenStats,
      },
    });
  }, [workflowType, currentRound, turnCount, tokenStats, send]);

  const context = state.context;
  const isHidden = state.matches("hidden");

  if (isHidden) {
    return null;
  }

  const stateValue = state.value as Record<string, unknown>;
  const actionState = (stateValue?.visible as Record<string, unknown>)?.action || "idle";
  const isActionDisabled = actionState !== "idle";

  // Pause button: enabled when executing
  const isPauseEnabled = executionState === "executing" && !isActionDisabled;

  // Resume button: enabled when inactive and hasCheckpoint, or when error state
  const isResumeEnabled =
    ((executionState === "inactive" && hasCheckpoint) || executionState === "error") &&
    !isActionDisabled;

  // Abort/Cancel: enabled when executing or awaiting input
  const isAbortEnabled =
    (executionState === "executing" || executionState === "awaiting_input") && !isActionDisabled;

  // Force Consensus / Force Summarize: only for loop workflows, active during executing or awaiting_input
  const isLoopExtraEnabled =
    workflowType === "loop" &&
    (executionState === "executing" || executionState === "awaiting_input") &&
    !isActionDisabled;

  const handlePause = async () => {
    send({ type: "CLICK_PAUSE" });
    try {
      await onPause();
      send({ type: "ACTION_SUCCESS" });
    } catch (err) {
      send({
        type: "ACTION_FAILURE",
        error: err instanceof Error ? err.message : "Failed to pause",
      });
    }
  };

  const handleResume = async () => {
    send({ type: "CLICK_RESUME" });
    try {
      await onResume();
      send({ type: "ACTION_SUCCESS" });
    } catch (err) {
      send({
        type: "ACTION_FAILURE",
        error: err instanceof Error ? err.message : "Failed to resume",
      });
    }
  };

  const handleAbort = async () => {
    send({ type: "CLICK_ABORT" });
    try {
      await onAbort();
      send({ type: "ACTION_SUCCESS" });
    } catch (err) {
      send({
        type: "ACTION_FAILURE",
        error: err instanceof Error ? err.message : "Failed to abort",
      });
    }
  };

  const handleForceConsensus = async () => {
    if (!onForceConsensus) return;
    send({ type: "CLICK_FORCE_CONSENSUS" });
    try {
      await onForceConsensus();
      send({ type: "ACTION_SUCCESS" });
    } catch (err) {
      send({
        type: "ACTION_FAILURE",
        error: err instanceof Error ? err.message : "Failed to force consensus",
      });
    }
  };

  const handleForceSummarize = async () => {
    if (!onForceSummarize) return;
    send({ type: "CLICK_FORCE_SUMMARIZE" });
    try {
      await onForceSummarize();
      send({ type: "ACTION_SUCCESS" });
    } catch (err) {
      send({
        type: "ACTION_FAILURE",
        error: err instanceof Error ? err.message : "Failed to force summarize",
      });
    }
  };

  return (
    <div
      className={`loop-control-panel ${context.isExpanded ? "expanded" : "collapsed"} ${
        context.isMobileOverlayOpen ? "mobile-overlay-open" : ""
      }`}
      data-testid="loop-control-panel"
    >
      <div className="panel-header">
        <div className="panel-title-wrapper">
          <span className="panel-icon">🔁</span>
          <h3>Execution Control Panel</h3>
        </div>
        <div className="panel-header-actions">
          <button
            type="button"
            className="toggle-expanded-btn"
            onClick={() => send({ type: "TOGGLE_PANEL_EXPANDED" })}
            data-testid="toggle-panel-expanded-btn"
            aria-label={context.isExpanded ? "Collapse Panel" : "Expand Panel"}
          >
            {context.isExpanded ? "▲" : "▼"}
          </button>
          <button
            type="button"
            className="mobile-overlay-toggle-btn"
            onClick={() => send({ type: "TOGGLE_MOBILE_OVERLAY" })}
            data-testid="mobile-overlay-toggle-btn"
            aria-label="Toggle Stats Overlay"
          >
            📊
          </button>
        </div>
      </div>

      {context.isExpanded && (
        <div className="panel-body">
          {context.errorMessage && (
            <div className="panel-error-banner" data-testid="panel-error-banner">
              <span>{context.errorMessage}</span>
              <button
                type="button"
                className="dismiss-error-btn"
                onClick={() => send({ type: "DISMISS_ERROR" })}
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          <div className="panel-stats">
            {workflowType === "loop" && (
              <div className="stat-item" data-testid="stat-round">
                <span className="stat-label">Round</span>
                <span className="stat-value">{context.currentRound}</span>
              </div>
            )}
            <div className="stat-item" data-testid="stat-turns">
              <span className="stat-label">Turns</span>
              <span className="stat-value">{context.turnCount}</span>
            </div>
            <div className="stat-item" data-testid="stat-tokens">
              <span className="stat-label">Token Stats</span>
              <span className="stat-value font-mono">
                P: {context.tokenStats.promptTokens} / C: {context.tokenStats.completionTokens}
              </span>
            </div>
          </div>

          <div className="panel-actions">
            <button
              type="button"
              className="panel-btn pause-btn"
              onClick={() => void handlePause()}
              disabled={!isPauseEnabled}
              data-testid="panel-pause-btn"
            >
              Pause
            </button>
            <button
              type="button"
              className="panel-btn resume-btn"
              onClick={() => void handleResume()}
              disabled={!isResumeEnabled}
              data-testid="panel-resume-btn"
            >
              Resume
            </button>
            <button
              type="button"
              className="panel-btn abort-btn"
              onClick={() => void handleAbort()}
              disabled={!isAbortEnabled}
              data-testid="panel-abort-btn"
            >
              Abort
            </button>
            {workflowType === "loop" && onForceConsensus && (
              <button
                type="button"
                className="panel-btn force-consensus-btn"
                onClick={() => void handleForceConsensus()}
                disabled={!isLoopExtraEnabled}
                data-testid="panel-force-consensus-btn"
              >
                Force Consensus
              </button>
            )}
            {workflowType === "loop" && onForceSummarize && (
              <button
                type="button"
                className="panel-btn force-summarize-btn"
                onClick={() => void handleForceSummarize()}
                disabled={!isLoopExtraEnabled}
                data-testid="panel-force-summarize-btn"
              >
                Force Summarize
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sticky bottom status bar for mobile viewports */}
      <div
        className="mobile-status-bar"
        onClick={() => send({ type: "TOGGLE_MOBILE_OVERLAY" })}
        data-testid="mobile-status-bar"
      >
        <span>Status: {executionState.toUpperCase()}</span>
        {workflowType === "loop" && <span>Round: {context.currentRound}</span>}
        <span>Turns: {context.turnCount}</span>
      </div>

      {/* Mobile full-screen overlay for stats/controls */}
      {context.isMobileOverlayOpen && (
        <div
          className="mobile-overlay-modal"
          data-testid="mobile-overlay-modal"
          onClick={() => send({ type: "CLOSE_MOBILE_OVERLAY" })}
        >
          <div className="mobile-overlay-content" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-overlay-header">
              <h3>Execution Statistics & Controls</h3>
              <button
                type="button"
                className="mobile-overlay-close"
                onClick={() => send({ type: "CLOSE_MOBILE_OVERLAY" })}
                aria-label="Close Stats Overlay"
              >
                ✕
              </button>
            </div>
            <div className="mobile-overlay-body">
              <div className="panel-stats">
                {workflowType === "loop" && (
                  <div className="stat-item">
                    <span className="stat-label">Round</span>
                    <span className="stat-value">{context.currentRound}</span>
                  </div>
                )}
                <div className="stat-item">
                  <span className="stat-label">Turns</span>
                  <span className="stat-value">{context.turnCount}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Tokens</span>
                  <span className="stat-value font-mono">
                    P: {context.tokenStats.promptTokens} / C: {context.tokenStats.completionTokens}
                  </span>
                </div>
              </div>
              <div className="panel-actions vertical">
                <button
                  type="button"
                  className="panel-btn pause-btn"
                  onClick={() => void handlePause()}
                  disabled={!isPauseEnabled}
                >
                  Pause
                </button>
                <button
                  type="button"
                  className="panel-btn resume-btn"
                  onClick={() => void handleResume()}
                  disabled={!isResumeEnabled}
                >
                  Resume
                </button>
                <button
                  type="button"
                  className="panel-btn abort-btn"
                  onClick={() => void handleAbort()}
                  disabled={!isAbortEnabled}
                >
                  Abort
                </button>
                {workflowType === "loop" && onForceConsensus && (
                  <button
                    type="button"
                    className="panel-btn force-consensus-btn"
                    onClick={() => void handleForceConsensus()}
                    disabled={!isLoopExtraEnabled}
                  >
                    Force Consensus
                  </button>
                )}
                {workflowType === "loop" && onForceSummarize && (
                  <button
                    type="button"
                    className="panel-btn force-summarize-btn"
                    onClick={() => void handleForceSummarize()}
                    disabled={!isLoopExtraEnabled}
                  >
                    Force Summarize
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
