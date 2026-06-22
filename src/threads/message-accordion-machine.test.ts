import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { messageAccordionMachine } from "./message-accordion-machine";

describe("messageAccordionMachine", () => {
  it("should initialize in collapsed state", () => {
    const actor = createActor(messageAccordionMachine).start();
    expect(actor.getSnapshot().value).toBe("collapsed");
    expect(actor.getSnapshot().context.isOpen).toBe(false);
  });

  it("should transition to expanded on TOGGLE_EXPAND", () => {
    const actor = createActor(messageAccordionMachine).start();
    actor.send({ type: "TOGGLE_EXPAND" });
    expect(actor.getSnapshot().value).toBe("expanded");
    expect(actor.getSnapshot().context.isOpen).toBe(true);
  });

  it("should transition back to collapsed on TOGGLE_COLLAPSE", () => {
    const actor = createActor(messageAccordionMachine).start();
    actor.send({ type: "TOGGLE_EXPAND" });
    expect(actor.getSnapshot().value).toBe("expanded");

    actor.send({ type: "TOGGLE_COLLAPSE" });
    expect(actor.getSnapshot().value).toBe("collapsed");
    expect(actor.getSnapshot().context.isOpen).toBe(false);
  });
});
