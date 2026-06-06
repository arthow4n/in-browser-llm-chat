import React from "react";
import { Button } from "@carbon/react";

interface BudgetDetails {
  currentTokens: number;
  maxTokens: number | null;
  stepCount: number;
}

interface BudgetExceededCardProps {
  budgetDetails: BudgetDetails;
  onIncreaseBudget: () => void;
  onAbort: () => void;
}

export const BudgetExceededCard: React.FC<BudgetExceededCardProps> = ({
  budgetDetails,
  onIncreaseBudget,
  onAbort,
}) => {
  return (
    <div
      style={{
        backgroundColor: "var(--cds-layer-01)",
        border: "1px solid var(--cds-border-subtle)",
        borderRadius: "0.5rem",
        padding: "1rem",
        marginBottom: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        alignSelf: "center",
        maxWidth: "600px",
        width: "100%",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <strong style={{ fontSize: "1rem", color: "var(--cds-text-primary)" }}>
          Budget Exceeded
        </strong>
        <div style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
          The autonomous execution limit has been reached to prevent runaway API costs.
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--cds-text-disabled)",
            marginTop: "0.5rem",
            display: "flex",
            gap: "1rem",
          }}
        >
          <span>Steps: {budgetDetails.stepCount}</span>
          {budgetDetails.maxTokens && (
            <span>
              Tokens: {budgetDetails.currentTokens} / {budgetDetails.maxTokens}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
        <Button kind="ghost" onClick={onAbort}>
          Abort
        </Button>
        <Button onClick={onIncreaseBudget}>Increase Budget & Resume</Button>
      </div>
    </div>
  );
};
