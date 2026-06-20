import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { chatInputMachine } from "./chat-input-machine";

describe("chatInputMachine", () => {
  it("should initialize in disabled state", () => {
    const actor = createActor(chatInputMachine).start();
    expect(actor.getSnapshot().value).toBe("disabled");
    expect(actor.getSnapshot().context.inputText).toBe("");
    expect(actor.getSnapshot().context.selectedRole).toBe("user");
  });

  it("should transition to ready.empty when enabled", () => {
    const actor = createActor(chatInputMachine).start();
    actor.send({ type: "ENABLE" });
    expect(actor.getSnapshot().matches("ready")).toBe(true);
    expect(actor.getSnapshot().matches("ready.empty")).toBe(true);
  });

  it("should transition between empty and hasText depending on input content", () => {
    const actor = createActor(chatInputMachine).start();
    actor.send({ type: "ENABLE" });

    // Change input to non-empty
    actor.send({ type: "INPUT_CHANGED", text: "hello" });
    expect(actor.getSnapshot().matches("ready.hasText")).toBe(true);
    expect(actor.getSnapshot().context.inputText).toBe("hello");

    // Change input back to empty
    actor.send({ type: "INPUT_CHANGED", text: "" });
    expect(actor.getSnapshot().matches("ready.empty")).toBe(true);
    expect(actor.getSnapshot().context.inputText).toBe("");
  });

  it("should change selected role", () => {
    const actor = createActor(chatInputMachine).start();
    actor.send({ type: "ENABLE" });

    actor.send({ type: "ROLE_CHANGED", role: "system" });
    expect(actor.getSnapshot().context.selectedRole).toBe("system");

    actor.send({ type: "ROLE_CHANGED", role: "assistant" });
    expect(actor.getSnapshot().context.selectedRole).toBe("assistant");
  });

  it("should transition to submitting on submit event from hasText, and handle success/failure", () => {
    const actor = createActor(chatInputMachine).start();
    actor.send({ type: "ENABLE" });
    actor.send({ type: "INPUT_CHANGED", text: "query" });

    actor.send({ type: "SUBMIT" });
    expect(actor.getSnapshot().value).toBe("submitting");

    // Test failure transitions back to ready.hasText
    actor.send({ type: "SUBMIT_FAILURE" });
    expect(actor.getSnapshot().matches("ready.hasText")).toBe(true);
    expect(actor.getSnapshot().context.inputText).toBe("query");

    // Test success transitions to disabled and clears text
    actor.send({ type: "SUBMIT" });
    actor.send({ type: "SUBMIT_SUCCESS" });
    expect(actor.getSnapshot().value).toBe("disabled");
    expect(actor.getSnapshot().context.inputText).toBe("");
  });
});
