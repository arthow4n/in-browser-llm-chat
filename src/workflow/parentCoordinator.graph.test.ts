/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect } from "vitest";
import { createActor } from "xstate";
import { getShortestPaths } from "xstate/graph";
import { parentCoordinatorMachine } from "./parentCoordinator.js";

function createTestableMachine(machine: any) {
  function clone(obj: any): any {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(clone);
    const result: any = {};
    for (const key in obj) {
      if (key === "invoke") continue;
      result[key] = clone(obj[key]);
    }
    return result;
  }

  const config = clone(machine.config);

  // Replace invoke transitions
  if (config.states.ViewState.states.initializing) {
    config.states.ViewState.states.initializing.on = {
      ...(config.states.ViewState.states.initializing.on || {}),
      DONE_KEYS_CONFIGURED: { target: "checkingKeys" },
      ERROR_INIT: { target: "error" },
    };
  }

  if (config.states.ExecutionState.states.checkingStatus) {
    config.states.ExecutionState.states.checkingStatus.on = {
      ...(config.states.ExecutionState.states.checkingStatus.on || {}),
      DONE_INACTIVE: { target: "inactive" },
      DONE_EXECUTING: { target: "executing" },
      DONE_AWAITING: { target: "awaitingHumanInput" },
      ERROR_CHECK: { target: "error" },
    };
  }

  if (config.states.ExecutionState.states.executing) {
    config.states.ExecutionState.states.executing.on = {
      ...(config.states.ExecutionState.states.executing.on || {}),
      DONE_EXECUTING_CHILD: { target: "inactive" },
      ERROR_EXECUTING_CHILD: { target: "error" },
    };
  }

  const { createMachine } = require("xstate");
  return createMachine(config);
}

const testMachine = createTestableMachine(parentCoordinatorMachine);

describe("parentCoordinatorMachine model-based testing (ViewState)", () => {
  const paths = getShortestPaths(testMachine, {
    events: [
      { type: "DONE_KEYS_CONFIGURED" },
      { type: "OPEN_SETTINGS" },
      { type: "CLOSE_SETTINGS" },
      { type: "OPEN_PRESET_EDIT", presetId: "p1" } as never,
      { type: "CLOSE_PRESET_EDIT" },
      { type: "OPEN_WORKFLOW_EDIT", workflowId: "w1" } as never,
      { type: "CLOSE_WORKFLOW_EDIT" },
      { type: "ROUTE_CHANGED", threadId: "t1" } as never,
      { type: "API_KEYS_REMOVED" },
      { type: "DONE_INACTIVE" },
    ],
    // Limit to prevent infinite context exploration
    limit: 1000,
  });

  for (const path of paths) {
    // Only test paths that reach a relevant state for ViewState
    if (path.state.value.ViewState === "initializing") continue;

    test(`ViewState resolves to ${String(path.state.value.ViewState)} via path`, async () => {
      const actor = createActor(testMachine).start();

      for (const step of path.steps) {
        actor.send(step.event);
      }

      const actualState = actor.getSnapshot();
      expect(actualState.value.ViewState).toEqual(path.state.value.ViewState);
      actor.stop();
    });
  }
});
