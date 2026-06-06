import { Button, Modal, ModalHeader, ModalBody } from "@carbon/react";
import { Pause, Play, Stop, Warning, Information } from "@carbon/icons-react";
import { type CoordinatorContext, type CoordinatorEvent } from "../../workflow/parentCoordinator";
import { useWindowSize } from "../../ui/hooks/useWindowSize";

import { StateValue, setup } from "xstate";
import { useMachine } from "@xstate/react";

const executionControlMachine = setup({
  types: {
    events: {} as { type: "OPEN_MODAL" } | { type: "CLOSE_MODAL" },
  },
}).createMachine({
  id: "executionControl",
  initial: "closed",
  states: {
    closed: {
      on: { OPEN_MODAL: "open" },
    },
    open: {
      on: { CLOSE_MODAL: "closed" },
    },
  },
});

interface ExecutionControlPanelProps {
  state: { value: unknown; context: CoordinatorContext; matches: (val: StateValue) => boolean };
  send: (event: CoordinatorEvent) => void;
}

export function ExecutionControlPanel({ state, send }: ExecutionControlPanelProps) {
  const [machineState, machineSend] = useMachine(executionControlMachine);
  const isModalOpen = machineState.matches("open");
  const { width } = useWindowSize();
  const isMobile = width < 672;

  const { loopControl } = state.context;

  const canPause = state.matches({ ExecutionState: "executing" });
  const canResume =
    state.matches({ ExecutionState: "inactive" }) || state.matches({ ExecutionState: "error" });
  const canAbort =
    state.matches({ ExecutionState: "executing" }) ||
    state.matches({ ExecutionState: "awaitingHumanInput" });
  const canForceConsensus =
    state.matches({ ExecutionState: "inactive" }) ||
    state.matches({ ExecutionState: "awaitingHumanInput" });
  const canForceSummarize =
    state.matches({ ExecutionState: "inactive" }) ||
    state.matches({ ExecutionState: "awaitingHumanInput" });

  const stats = (
    <div style={{ display: "flex", gap: "1rem", fontSize: "0.875rem", color: "#525252" }}>
      <div>
        Round: <strong>{loopControl.currentRound}</strong>
      </div>
      <div>
        Turns: <strong>{loopControl.turnCount}</strong>
      </div>
      <div>
        Tokens: <strong>{loopControl.tokenStats?.totalTokens || 0}</strong> (P:{" "}
        {loopControl.tokenStats?.promptTokens || 0}, C:{" "}
        {loopControl.tokenStats?.completionTokens || 0})
      </div>
    </div>
  );

  const controls = (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      {canPause && (
        <Button size="sm" kind="ghost" onClick={() => send({ type: "PAUSE" })} renderIcon={Pause}>
          Pause
        </Button>
      )}
      {canResume && (
        <Button size="sm" kind="primary" onClick={() => send({ type: "RESUME" })} renderIcon={Play}>
          Resume
        </Button>
      )}
      {canAbort && (
        <Button
          size="sm"
          kind="danger"
          onClick={() => send({ type: "CANCEL_EXECUTION" })}
          renderIcon={Stop}
        >
          Abort
        </Button>
      )}
      {canForceConsensus && (
        <Button
          size="sm"
          kind="ghost"
          onClick={() => send({ type: "FORCE_CONSENSUS" })}
          renderIcon={Information}
        >
          Force Consensus
        </Button>
      )}
      {canForceSummarize && (
        <Button
          size="sm"
          kind="ghost"
          onClick={() => send({ type: "FORCE_SUMMARIZE" })}
          renderIcon={Warning}
        >
          Force Summarize
        </Button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.5rem 1rem",
            background: "#f4f4f4",
            borderBottom: "1px solid #ddd",
            cursor: "pointer",
          }}
          onClick={() => machineSend({ type: "OPEN_MODAL" })}
        >
          <div style={{ fontSize: "0.875rem" }}>
            Round: {loopControl.currentRound} | Tokens: {loopControl.tokenStats?.totalTokens || 0}
          </div>
          <Button size="sm" kind="ghost">
            Details
          </Button>
        </div>
        <Modal
          open={isModalOpen}
          onRequestClose={() => machineSend({ type: "CLOSE_MODAL" })}
          modalHeading="Execution Controls"
        >
          <ModalHeader />
          <ModalBody>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1rem 0" }}
            >
              <div>
                <h4 style={{ marginBottom: "0.5rem" }}>Stats</h4>
                {stats}
              </div>
              <div>
                <h4 style={{ marginBottom: "0.5rem" }}>Controls</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {controls}
                </div>
              </div>
            </div>
          </ModalBody>
        </Modal>
      </>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.5rem 1rem",
        background: "#f4f4f4",
        borderBottom: "1px solid #ddd",
        minHeight: "3rem",
      }}
    >
      {stats}
      {controls}
    </div>
  );
}
