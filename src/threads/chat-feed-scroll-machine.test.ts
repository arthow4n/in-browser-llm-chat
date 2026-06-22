import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { chatFeedScrollMachine } from "./chat-feed-scroll-machine";

describe("chatFeedScrollMachine", () => {
  it("should initialize in lockedToBottom state", () => {
    const actor = createActor(chatFeedScrollMachine).start();
    expect(actor.getSnapshot().value).toBe("lockedToBottom");
    expect(actor.getSnapshot().context.isAtBottom).toBe(true);
  });

  it("should transition to userScrolledUp on SCROLL_EVENT if not near bottom", () => {
    const actor = createActor(chatFeedScrollMachine).start();
    actor.send({ type: "SCROLL_EVENT", isNearBottom: false });
    expect(actor.getSnapshot().value).toBe("userScrolledUp");
    expect(actor.getSnapshot().context.isAtBottom).toBe(false);
  });

  it("should transition back to lockedToBottom on SCROLL_EVENT if near bottom", () => {
    const actor = createActor(chatFeedScrollMachine).start();
    actor.send({ type: "SCROLL_EVENT", isNearBottom: false });
    expect(actor.getSnapshot().value).toBe("userScrolledUp");

    actor.send({ type: "SCROLL_EVENT", isNearBottom: true });
    expect(actor.getSnapshot().value).toBe("lockedToBottom");
    expect(actor.getSnapshot().context.isAtBottom).toBe(true);
  });

  it("should transition from userScrolledUp to lockedToBottom on SCROLL_TO_BOTTOM_CLICKED", () => {
    const actor = createActor(chatFeedScrollMachine).start();
    actor.send({ type: "SCROLL_EVENT", isNearBottom: false });
    expect(actor.getSnapshot().value).toBe("userScrolledUp");

    actor.send({ type: "SCROLL_TO_BOTTOM_CLICKED" });
    expect(actor.getSnapshot().value).toBe("lockedToBottom");
    expect(actor.getSnapshot().context.isAtBottom).toBe(true);
  });
});
