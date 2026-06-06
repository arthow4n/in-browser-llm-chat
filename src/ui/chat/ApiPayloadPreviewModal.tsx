import React from "react";
import { useMachine } from "@xstate/react";
import { Modal, ModalBody, Dropdown, InlineNotification } from "@carbon/react";
import { apiPayloadPreviewMachine } from "../../machines/chat/apiPayloadPreviewMachine";
import { type CompiledPayloadMessage } from "../../workflow/compiler";

interface ApiPayloadPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: Array<{ id: string; name: string }>;
  initialAgentId: string | null;
  payload: CompiledPayloadMessage[] | null;
}

export function ApiPayloadPreviewModal({
  isOpen,
  onClose,
  agents,
  initialAgentId,
  payload,
}: ApiPayloadPreviewModalProps) {
  const [state, send] = useMachine(apiPayloadPreviewMachine, {
    input: {
      activeAgentId: initialAgentId,
    },
  });

  React.useEffect(() => {
    if (payload) {
      send({ type: "LOAD_PAYLOAD", payload });
    }
  }, [payload, send]);

  if (!isOpen) return null;

  return (
    <Modal
      open={isOpen}
      modalHeading="API Payload Preview"
      primaryButtonText="Close"
      onRequestSubmit={onClose}
      secondaryButtonText="Cancel"
      onRequestClose={onClose}
    >
      <ModalBody>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <Dropdown
            id="agent-selector"
            label="Agent Context"
            titleText={
              agents.find((a) => a.id === state.context.activeAgentId)?.name || "Select Agent"
            }
            items={agents.map((a) => ({ id: a.id, label: a.name }))}
            onChange={(data: unknown) => send({ type: "SELECT_AGENT", agentId: (data as any).target.value })}
          />

          {state.context.errorMessage && (
            <InlineNotification
              kind="error"
              title="Error"
              subtitle={state.context.errorMessage}
              onClose={() => send({ type: "DISMISS_ERROR" })}
            />
          )}

          <div
            style={{
              background: "#161616",
              color: "#eeeee",
              padding: "1rem",
              borderRadius: "4px",
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
              overflowX: "auto",
              maxHeight: "60vh",
              overflowY: "auto",
            }}
          >
            {state.context.payload ? (
              state.context.payload.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    marginBottom: "1rem",
                    padding: "0.5rem",
                    borderLeft: msg.isInjected ? "4px solid #393939" : "4px solid transparent",
                    background: msg.isInjected ? "#262626" : "transparent",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#8d8d8d",
                      marginBottom: "0.25rem",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>
                      <strong>{msg.role.toUpperCase()}</strong>
                      {msg.name && ` - ${msg.name}`}
                      {msg.isInjected && (
                        <span
                          style={{
                            marginLeft: "0.5rem",
                            background: "#393939",
                            color: "#fff",
                            padding: "0 4px",
                            borderRadius: "2px",
                            fontSize: "0.7rem",
                          }}
                        >
                          [INJECTED]
                        </span>
                      )}
                    </span>
                  </div>
                  <div>{msg.content}</div>
                </div>
              ))
            ) : (
              <div style={{ color: "#8d8d8d", textAlign: "center" }}>
                No payload available to preview.
              </div>
            )}
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
