import { act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createActor } from "xstate";
import { streamingMessageBubbleMachine } from "./streaming-message-bubble-machine";

describe("streamingMessageBubbleMachine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should initialize in idle state and handle events", () => {
    const actor = createActor(streamingMessageBubbleMachine).start();
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.rawText).toBe("");
    expect(actor.getSnapshot().context.debouncedText).toBe("");
    expect(actor.getSnapshot().context.isStreaming).toBe(false);

    // Stream start
    actor.send({ type: "STREAM_START" });
    expect(actor.getSnapshot().value).toBe("streaming");
    expect(actor.getSnapshot().context.isStreaming).toBe(true);

    // Token received
    actor.send({ type: "TOKEN_RECEIVED", token: "Hello" });
    expect(actor.getSnapshot().context.rawText).toBe("Hello");
    // Debounced text shouldn't be updated immediately
    expect(actor.getSnapshot().context.debouncedText).toBe("");

    // Advance timers by 100ms to trigger debounce tick
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(actor.getSnapshot().context.debouncedText).toBe("Hello");

    // Stream end
    actor.send({ type: "STREAM_END" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.isStreaming).toBe(false);
    expect(actor.getSnapshot().context.debouncedText).toBe("Hello");
  });

  it("should defer rendering incomplete LaTeX blocks as math", () => {
    const actor = createActor(streamingMessageBubbleMachine).start();
    actor.send({ type: "STREAM_START" });

    // Incomplete math block $$
    actor.send({ type: "TOKEN_RECEIVED", token: "Formula: $$E = mc^2" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // Should escape $$ to block math rendering
    expect(actor.getSnapshot().context.debouncedText).toContain("\\$\\$");

    // Close math block
    actor.send({ type: "TOKEN_RECEIVED", token: "$$" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // Should be unescaped now that it is closed
    expect(actor.getSnapshot().context.debouncedText).toBe("Formula: $$E = mc^2$$");
  });
});
