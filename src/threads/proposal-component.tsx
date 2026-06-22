import { useState, useEffect } from "react";
import { useMachine } from "@xstate/react";
import { proposalMachine } from "./proposal-machine";

export interface ProposalComponentProps {
  threadId: string;
  toolCallId: string;
  toolName: string;
  proposalData: Record<string, unknown>;
  onSuccess?: () => void;
  isApproved?: boolean;
  isRejected?: boolean;
  rejectionReason?: string;
}

export function ProposalComponent({
  threadId,
  toolCallId,
  toolName,
  proposalData,
  onSuccess,
  isApproved = false,
  isRejected = false,
  rejectionReason = "",
}: ProposalComponentProps) {
  const [state, send] = useMachine(proposalMachine);
  const [rejectMode, setRejectMode] = useState(false);
  const [reasonText, setReasonText] = useState("");

  useEffect(() => {
    if (!isApproved && !isRejected) {
      send({
        type: "LOAD_PROPOSAL",
        threadId,
        toolCallId,
        toolName,
        proposalData,
      });
    }
  }, [threadId, toolCallId, toolName, proposalData, isApproved, isRejected, send]);

  useEffect(() => {
    if (state.matches("approved") || state.matches("rejected")) {
      onSuccess?.();
    }
  }, [state, onSuccess]);

  const displayApproved = isApproved || state.matches("approved");
  const displayRejected = isRejected || state.matches("rejected");

  if (displayApproved || displayRejected) {
    const badgeText = displayApproved ? "Approved" : "Rejected";
    const badgeClass = displayApproved ? "approved" : "rejected";
    const finalReason =
      rejectionReason ||
      state.context.errorMessage ||
      (displayRejected ? "Proposal rejected by user." : "");

    return (
      <div className={`proposal-card read-only ${badgeClass}`} data-testid="proposal-card">
        <header className="card-header">
          <span className="card-icon">⚡</span>
          <h4>Proposal: {toolName}</h4>
          <span className={`status-badge ${badgeClass}`}>{badgeText}</span>
        </header>
        <div className="proposal-details">
          <pre className="proposal-json-view">
            <code>{JSON.stringify(proposalData, null, 2)}</code>
          </pre>
          {displayRejected && (
            <p className="rejection-reason-text" data-testid="rejection-reason">
              <strong>Reason:</strong> {finalReason}
            </p>
          )}
        </div>
      </div>
    );
  }

  const { errorMessage } = state.context;
  const isSubmitting = state.matches("submitting") || state.matches("rejecting");

  const handleApprove = () => {
    if (!isSubmitting) {
      send({ type: "APPROVE" });
    }
  };

  const handleRejectSubmit = () => {
    if (!isSubmitting) {
      send({ type: "REJECT", reason: reasonText });
    }
  };

  return (
    <div className="proposal-card" data-testid="proposal-card">
      <header className="card-header">
        <span className="card-icon">⚡</span>
        <h4>Proposal: {toolName}</h4>
        <span className="status-badge pending">Awaiting Approval</span>
      </header>

      {errorMessage && (
        <div className="card-error-banner" data-testid="card-error">
          {errorMessage}
        </div>
      )}

      <div className="proposal-details">
        <p className="proposal-desc">
          The model proposes to execute <code>{toolName}</code> with the following parameters:
        </p>
        <pre className="proposal-json-view">
          <code>{JSON.stringify(proposalData, null, 2)}</code>
        </pre>
      </div>

      {rejectMode ? (
        <div className="rejection-input-wrapper" data-testid="rejection-input-wrapper">
          <textarea
            className="freetext-input"
            placeholder="Please enter a reason for rejection..."
            value={reasonText}
            disabled={isSubmitting}
            onChange={(e) => setReasonText(e.target.value)}
            style={{ fontSize: "16px", minHeight: "80px" }}
          />
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isSubmitting}
              onClick={() => setRejectMode(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={isSubmitting}
              onClick={handleRejectSubmit}
              data-testid="confirm-reject-btn"
            >
              Confirm Rejection
            </button>
          </div>
        </div>
      ) : (
        <div className="card-actions">
          <button
            type="button"
            className="btn btn-secondary reject-btn"
            disabled={isSubmitting}
            onClick={() => setRejectMode(true)}
            data-testid="reject-btn"
          >
            Reject
          </button>
          <button
            type="button"
            className="btn btn-primary approve-btn"
            disabled={isSubmitting}
            onClick={handleApprove}
            data-testid="approve-btn"
          >
            {isSubmitting ? <span className="spinner small-spinner"></span> : "Approve & Execute"}
          </button>
        </div>
      )}
    </div>
  );
}
