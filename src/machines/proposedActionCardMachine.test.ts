import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { proposedActionCardMachine } from "./proposedActionCardMachine";

describe("proposedActionCardMachine", () => {
  it("should start in idle state", () => {
    const actor = createActor(proposedActionCardMachine).start();
    expect(actor.getSnapshot().matches("idle")).toBe(true);
  });

  it("should transition to awaitingApproval on START_APPROVAL", () => {
    const actor = createActor(proposedActionCardMachine).start();
    actor.send({
      type: "START_APPROVAL",
      payload: {
        toolCallId: "123",
        actionType: "create",
        payload: { name: "Test Workflow" },
      },
    });
    expect(actor.getSnapshot().matches("awaitingApproval")).toBe(true);
    expect(actor.getSnapshot().context.toolCallId).toBe("123");
    expect(actor.getSnapshot().context.actionType).toBe("create");
  });

  it("should transition to approved on APPROVE", () => {
    const actor = createActor(proposedActionCardMachine).start();
    actor.send({
      type: "START_APPROVAL",
      payload: { toolCallId: "123", actionType: "create", payload: {} },
    });
    actor.send({ type: "APPROVE" });
    expect(actor.getSnapshot().matches("approved")).toBe(true);
  });

  it("should transition to denied on DENY", () => {
    const actor = createActor(proposedActionCardMachine).start();
    actor.send({
      type: "START_APPROVAL",
      payload: { toolCallId: "123", actionType: "create", payload: {} },
    });
    actor.send({ type: "DENY" });
    expect(actor.getSnapshot().matches("denied")).toBe(true);
  });
});
