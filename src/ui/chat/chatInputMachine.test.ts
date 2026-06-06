import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { chatInputMachine } from "./chatInputMachine";

describe("chatInputMachine", () => {
  it("should initialize with default values", () => {
    const actor = createActor(chatInputMachine).start();
    const snapshot = actor.getSnapshot();
    expect(snapshot.context.text).toBe("");
    expect(snapshot.context.role).toBe("User");
    expect(snapshot.matches("idle")).toBe(true);
  });

  it("should update text on UPDATE_TEXT", () => {
    const actor = createActor(chatInputMachine).start();
    actor.send({ type: "UPDATE_TEXT", text: "Hello" });
    const snapshot = actor.getSnapshot();
    expect(snapshot.context.text).toBe("Hello");
  });

  it("should update role on UPDATE_ROLE", () => {
    const actor = createActor(chatInputMachine).start();
    actor.send({ type: "UPDATE_ROLE", role: "Assistant" });
    const snapshot = actor.getSnapshot();
    expect(snapshot.context.role).toBe("Assistant");
  });

  it("should transition to submitting on SUBMIT", () => {
    const actor = createActor(chatInputMachine).start();
    actor.send({ type: "SUBMIT" });
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches("submitting")).toBe(true);
  });

  it("should reset text on RESET", () => {
    const actor = createActor(chatInputMachine).start();
    actor.send({ type: "UPDATE_TEXT", text: "Hello" });
    actor.send({ type: "SUBMIT" });
    actor.send({ type: "RESET" });
    const snapshot = actor.getSnapshot();
    expect(snapshot.context.text).toBe("");
    expect(snapshot.matches("idle")).toBe(true);
  });
});
