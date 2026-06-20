import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { loopControlMachine } from "./loop-control-machine";

describe("Loop Control Panel State Machine", () => {
  it("starts in hidden state", () => {
    const actor = createActor(loopControlMachine);
    actor.start();
    expect(actor.getSnapshot().value).toBe("hidden");
  });

  it("transitions to visible when SHOW_PANEL is received", () => {
    const actor = createActor(loopControlMachine);
    actor.start();
    actor.send({
      type: "SHOW_PANEL",
      workflowType: "loop",
      initialStats: {
        currentRound: 2,
        turnCount: 5,
        tokenStats: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      },
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toEqual({
      visible: {
        mobileOverlay: "overlayClosed",
        action: "idle",
      },
    });
    expect(snapshot.context.workflowType).toBe("loop");
    expect(snapshot.context.currentRound).toBe(2);
    expect(snapshot.context.turnCount).toBe(5);
    expect(snapshot.context.tokenStats.totalTokens).toBe(300);
  });

  it("handles toggling mobile overlay", () => {
    const actor = createActor(loopControlMachine);
    actor.start();
    actor.send({ type: "SHOW_PANEL", workflowType: "loop" });
    expect(actor.getSnapshot().context.isMobileOverlayOpen).toBe(false);

    actor.send({ type: "TOGGLE_MOBILE_OVERLAY" });
    expect(actor.getSnapshot().context.isMobileOverlayOpen).toBe(true);
    expect(
      ((actor.getSnapshot().value as Record<string, unknown>).visible as Record<string, unknown>)
        ?.mobileOverlay,
    ).toBe("overlayOpened");

    actor.send({ type: "CLOSE_MOBILE_OVERLAY" });
    expect(actor.getSnapshot().context.isMobileOverlayOpen).toBe(false);
    expect(
      ((actor.getSnapshot().value as Record<string, unknown>).visible as Record<string, unknown>)
        ?.mobileOverlay,
    ).toBe("overlayClosed");
  });

  it("handles toggling desktop panel expanded state", () => {
    const actor = createActor(loopControlMachine);
    actor.start();
    actor.send({ type: "SHOW_PANEL", workflowType: "loop" });
    expect(actor.getSnapshot().context.isExpanded).toBe(true);

    actor.send({ type: "TOGGLE_PANEL_EXPANDED" });
    expect(actor.getSnapshot().context.isExpanded).toBe(false);
  });

  it("transitions to action requesting states", () => {
    const actor = createActor(loopControlMachine);
    actor.start();
    actor.send({ type: "SHOW_PANEL", workflowType: "loop" });

    actor.send({ type: "CLICK_PAUSE" });
    expect(
      ((actor.getSnapshot().value as Record<string, unknown>).visible as Record<string, unknown>)
        ?.action,
    ).toBe("requestingPause");

    actor.send({ type: "ACTION_SUCCESS" });
    expect(
      ((actor.getSnapshot().value as Record<string, unknown>).visible as Record<string, unknown>)
        ?.action,
    ).toBe("idle");
  });

  it("handles action failures and error dismissals", () => {
    const actor = createActor(loopControlMachine);
    actor.start();
    actor.send({ type: "SHOW_PANEL", workflowType: "loop" });

    actor.send({ type: "CLICK_RESUME" });
    actor.send({ type: "ACTION_FAILURE", error: "Connection error" });

    const snapshot = actor.getSnapshot();
    expect(
      ((snapshot.value as Record<string, unknown>).visible as Record<string, unknown>)?.action,
    ).toBe("actionError");
    expect(snapshot.context.errorMessage).toBe("Connection error");

    actor.send({ type: "DISMISS_ERROR" });
    expect(
      ((actor.getSnapshot().value as Record<string, unknown>).visible as Record<string, unknown>)
        ?.action,
    ).toBe("idle");
    expect(actor.getSnapshot().context.errorMessage).toBeNull();
  });
});
