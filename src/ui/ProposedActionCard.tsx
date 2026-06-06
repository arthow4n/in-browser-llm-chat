import React, { useEffect } from "react";
import { Tile, Button, Stack } from "@carbon/react";
import { useMachine } from "@xstate/react";
import { proposedActionCardMachine } from "../machines/proposedActionCardMachine";

interface ProposedActionCardProps {
  toolCallId: string;
  actionType: "create" | "update";
  payload: unknown;
  originalPayload?: unknown;
  onApprove: (toolCallId: string) => void;
  onDeny: (toolCallId: string) => void;
}

export const ProposedActionCard: React.FC<ProposedActionCardProps> = ({
  toolCallId,
  actionType,
  payload,
  originalPayload,
  onApprove,
  onDeny,
}) => {
  const [state, send] = useMachine(proposedActionCardMachine);

  useEffect(() => {
    send({
      type: "START_APPROVAL",
      payload: { toolCallId, actionType, payload, originalPayload },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.matches("approved") || state.matches("denied")) {
    return null;
  }

  const renderDiff = () => {
    if (actionType === "create") {
      return (
        <div style={{ fontFamily: "monospace", fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>
          <pre>{JSON.stringify(payload, null, 2)}</pre>
        </div>
      );
    }

    // Simple JSON diff implementation
    const getDiff = (
      oldObj: Record<string, unknown>,
      newObj: Record<string, unknown>,
    ): React.ReactNode[] => {
      const allKeys = Array.from(
        new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]),
      );

      return allKeys.map((key) => {
        const oldVal = oldObj?.[key];
        const newVal = newObj?.[key];

        if (JSON.stringify(oldVal) === JSON.stringify(newVal)) {
          return (
            <div key={key} style={{ color: "gray" }}>
              {key}: {JSON.stringify(newVal)}
            </div>
          );
        }

        if (
          typeof newVal === "object" &&
          newVal !== null &&
          typeof oldVal === "object" &&
          oldVal !== null
        ) {
          return (
            <div key={key} style={{ marginLeft: "1rem", fontWeight: "bold" }}>
              {key}:{getDiff(oldVal as Record<string, unknown>, newVal as Record<string, unknown>)}
            </div>
          );
        }

        return (
          <div key={key} style={{ marginLeft: "1rem" }}>
            {key}:{" "}
            <span style={{ color: "red", textDecoration: "line-through" }}>
              {JSON.stringify(oldVal)}
            </span>{" "}
            <span style={{ color: "green" }}>{JSON.stringify(newVal)}</span>
          </div>
        );
      });
    };

    return (
      <div style={{ fontFamily: "monospace", fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>
        {getDiff(originalPayload as Record<string, unknown>, payload as Record<string, unknown>)}
      </div>
    );
  };

  return (
    <Tile style={{ marginBottom: "1rem", border: "1px solid #ddd" }}>
      <Stack gap={6}>
        <div style={{ fontWeight: "bold" }}>
          {actionType === "create" ? "Proposed Workflow Creation" : "Proposed Workflow Update"}
        </div>
        <div>{renderDiff()}</div>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <Button
            kind="secondary"
            onClick={() => {
              send({ type: "DENY" });
              onDeny(toolCallId);
            }}
          >
            Deny
          </Button>
          <Button
            kind="primary"
            onClick={() => {
              send({ type: "APPROVE" });
              onApprove(toolCallId);
            }}
          >
            Approve
          </Button>
        </div>
      </Stack>
    </Tile>
  );
};
