import { useEffect } from "react";
import { useMachine } from "@xstate/react";
import { budgetExceededMachine } from "./budget-exceeded-machine";

export interface BudgetExceededCardProps {
  threadId: string;
  currentTokens: number;
  maxTokens: number | null;
  stepCount: number;
  onSuccess?: () => void;
  isResolved?: boolean;
  resolutionStatus?: "resumed" | "aborted";
}

export function BudgetExceededCard({
  threadId,
  currentTokens,
  maxTokens,
  stepCount,
  onSuccess,
  isResolved = false,
  resolutionStatus,
}: BudgetExceededCardProps) {
  const [state, send] = useMachine(budgetExceededMachine);

  useEffect(() => {
    if (!isResolved) {
      send({
        type: "LOAD_BUDGET_INTERRUPT",
        threadId,
        currentTokens,
        maxTokens,
        stepCount,
      });
    }
  }, [threadId, currentTokens, maxTokens, stepCount, isResolved, send]);

  useEffect(() => {
    if (state.matches("completedResume") || state.matches("completedAbort")) {
      onSuccess?.();
    }
  }, [state, onSuccess]);

  const displayResolved =
    isResolved || state.matches("completedResume") || state.matches("completedAbort");
  const finalStatus =
    resolutionStatus ||
    (state.matches("completedResume")
      ? "resumed"
      : state.matches("completedAbort")
        ? "aborted"
        : undefined);

  if (displayResolved) {
    const badgeText = finalStatus === "resumed" ? "Resumed" : "Aborted";
    const badgeClass = finalStatus === "resumed" ? "approved" : "rejected";

    return (
      <div
        className={`proposal-card read-only budget-exceeded-card ${badgeClass}`}
        data-testid="budget-exceeded-card"
      >
        <header className="card-header">
          <span className="card-icon">⚠️</span>
          <h4>Budget Exceeded</h4>
          <span className={`status-badge ${badgeClass}`}>{badgeText}</span>
        </header>
        <div className="proposal-details">
          <p className="proposal-desc">
            This run executed {stepCount} steps and consumed {currentTokens} tokens.
          </p>
          <p className="resolution-text">
            The run was successfully <strong>{finalStatus}</strong>.
          </p>
        </div>
      </div>
    );
  }

  const { errorMessage } = state.context;
  const isSubmitting = state.matches("resuming") || state.matches("aborted");

  const handleResume = () => {
    if (!isSubmitting) {
      send({ type: "INCREASE_BUDGET" });
    }
  };

  const handleAbort = () => {
    if (!isSubmitting) {
      send({ type: "ABORT" });
    }
  };

  return (
    <div className="proposal-card budget-exceeded-card" data-testid="budget-exceeded-card">
      <header className="card-header">
        <span className="card-icon">⚠️</span>
        <h4>Budget Exceeded</h4>
        <span className="status-badge pending">Awaiting Action</span>
      </header>

      {errorMessage && (
        <div className="card-error-banner" data-testid="card-error">
          {errorMessage}
        </div>
      )}

      <div className="proposal-details">
        <p className="proposal-desc">
          The background execution run has exceeded the budget policy limit:
        </p>
        <ul className="budget-details-list">
          <li>
            <strong>Steps Run:</strong> {stepCount}
          </li>
          <li>
            <strong>Tokens Consumed:</strong> {currentTokens} {maxTokens ? `/ ${maxTokens}` : ""}
          </li>
        </ul>
        <p className="budget-action-warning">
          Please choose to temporarily increase the budget to resume execution, or abort the run
          entirely.
        </p>
      </div>

      <div className="card-actions">
        <button
          type="button"
          className="btn btn-secondary abort-btn"
          disabled={isSubmitting}
          onClick={handleAbort}
          data-testid="budget-abort-btn"
        >
          Abort Run
        </button>
        <button
          type="button"
          className="btn btn-primary resume-btn"
          disabled={isSubmitting}
          onClick={handleResume}
          data-testid="budget-resume-btn"
        >
          {isSubmitting && state.matches("resuming") ? (
            <span className="spinner small-spinner"></span>
          ) : (
            "Increase Budget & Resume"
          )}
        </button>
      </div>
    </div>
  );
}
