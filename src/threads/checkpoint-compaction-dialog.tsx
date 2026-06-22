import { useMachine } from "@xstate/react";
import { checkpointCompactionMachine } from "./checkpoint-compaction-machine";
import { useEffect, useRef } from "react";

export interface CheckpointCompactionDialogProps {
  threadId: string;
  threadStatus: string;
}

export function CheckpointCompactionDialog({
  threadId,
  threadStatus,
}: CheckpointCompactionDialogProps) {
  const [state, send] = useMachine(checkpointCompactionMachine, {
    input: { threadId },
  });

  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const dismissBtnRef = useRef<HTMLButtonElement>(null);

  const isExecuting = threadStatus === "executing";

  // Auto-focus confirm button when confirming
  useEffect(() => {
    if (state.matches("confirming") && confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    }
  }, [state]);

  // Auto-focus dismiss button when success or failure
  useEffect(() => {
    if ((state.matches("success") || state.matches("failure")) && dismissBtnRef.current) {
      dismissBtnRef.current.focus();
    }
  }, [state]);

  const showModal = state.matches("confirming") || state.matches("compacting");

  return (
    <div className="compaction-section">
      <h3>Checkpoint Compaction</h3>
      <p className="compaction-description">
        Compact this thread's storage by purging all historical checkpoints and checkpoint writes
        except the latest active state. This helps free up space.
      </p>

      {state.matches("idle") && (
        <button
          type="button"
          className="btn btn-secondary btn-danger-outline"
          data-testid="compact-checkpoints-btn"
          onClick={() => send({ type: "START_COMPACT" })}
          disabled={isExecuting}
        >
          Compact Checkpoints
        </button>
      )}

      {state.matches("success") && (
        <div
          className="alert alert-success compaction-status"
          data-testid="compaction-success-alert"
        >
          <span>Compaction completed successfully!</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            ref={dismissBtnRef}
            onClick={() => send({ type: "DISMISS" })}
          >
            Dismiss
          </button>
        </div>
      )}

      {state.matches("failure") && (
        <div
          className="alert alert-danger compaction-status"
          data-testid="compaction-failure-alert"
        >
          <span>Compaction failed: {state.context.errorMessage}</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            ref={dismissBtnRef}
            onClick={() => send({ type: "DISMISS" })}
          >
            Dismiss
          </button>
        </div>
      )}

      {showModal && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 1100 }}
          data-testid="compaction-confirm-modal"
        >
          <div className="modal-content warning-modal">
            <header className="modal-header">
              <h2>Confirm Compaction</h2>
            </header>
            <div className="modal-body">
              <p className="warning-text">
                Are you sure you want to compact the checkpoints for this thread? This will
                permanently delete all historical checkpoints and writes.
              </p>
              <p className="warning-note">
                <strong>Note:</strong> You will no longer be able to Edit, Delete, or Branch from
                messages that occurred before the latest checkpoint.
              </p>
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="btn btn-danger"
                ref={confirmBtnRef}
                onClick={() => send({ type: "CONFIRM_COMPACT" })}
                disabled={state.matches("compacting")}
                data-testid="confirm-compact-btn"
              >
                {state.matches("compacting") ? (
                  <>
                    <span className="spinner spinner-sm"></span> Compacting...
                  </>
                ) : (
                  "Confirm Compact"
                )}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => send({ type: "CANCEL_COMPACT" })}
                disabled={state.matches("compacting")}
                data-testid="cancel-compact-btn"
              >
                Cancel
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
