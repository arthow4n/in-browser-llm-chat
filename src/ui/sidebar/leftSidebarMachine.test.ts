import { describe, it, expect, beforeEach } from "vitest";
import { createActor, waitFor } from "xstate";
import { leftSidebarMachine } from "./leftSidebarMachine.js";
import * as db from "../../db/db.js";

describe("leftSidebarMachine", () => {
  beforeEach(async () => {
    await db.clearThreads();
  });

  it("should start in loadingInitial state and load threads", async () => {
    const { threadId } = await db.createNewThread({
      workflowId: "w1",
      workflowSnapshot: {
        id: "w1",
        name: "WF1",
        description: "",
        isBuiltIn: false,
        nodes: [],
        edges: [],
      },
      activePresetId: "p1",
      initialMessage: "Test Thread 1",
    });

    const actor = createActor(leftSidebarMachine).start();
    expect(actor.getSnapshot().matches("loadingInitial")).toBe(true);

    await waitFor(actor, (state) => state.matches("idle"), { timeout: 5000 });

    expect(actor.getSnapshot().matches("idle")).toBe(true);
    expect(actor.getSnapshot().context.threads.length).toBe(1);
    expect(actor.getSnapshot().context.threads[0].id).toBe(threadId);
    expect(actor.getSnapshot().context.hasMore).toBe(false);
    expect(actor.getSnapshot().context.page).toBe(1);
  });

  it("should support filtering and reset page to 1", async () => {
    const actor = createActor(leftSidebarMachine).start();
    await waitFor(actor, (state) => state.matches("idle"), { timeout: 5000 });

    actor.send({ type: "FILTER_THREADS", query: "hello" });
    expect(actor.getSnapshot().matches("loadingInitial")).toBe(true);
    expect(actor.getSnapshot().context.searchQuery).toBe("hello");

    await waitFor(actor, (state) => state.matches("idle"), { timeout: 5000 });
    expect(actor.getSnapshot().matches("idle")).toBe(true);
  });

  it("should load more threads when requested and append them", async () => {
    for (let i = 0; i < 60; i++) {
      await db.createNewThread({
        workflowId: "w1",
        workflowSnapshot: {
          id: "w1",
          name: "WF1",
          description: "",
          isBuiltIn: false,
          nodes: [],
          edges: [],
        },
        activePresetId: "p1",
        initialMessage: `Thread ${i}`,
      });
    }

    const actor = createActor(leftSidebarMachine).start();
    await waitFor(actor, (state) => state.matches("idle"), { timeout: 5000 });

    expect(actor.getSnapshot().context.threads.length).toBe(50);

    actor.send({ type: "LOAD_MORE" });
    expect(actor.getSnapshot().matches("loadingMore")).toBe(true);

    await waitFor(actor, (state) => state.matches("idle"), { timeout: 5000 });
    expect(actor.getSnapshot().matches("idle")).toBe(true);
    expect(actor.getSnapshot().context.threads.length).toBe(60);
    expect(actor.getSnapshot().context.page).toBe(2);
    expect(actor.getSnapshot().context.hasMore).toBe(false);
  });

  it("should delete a thread and update optimistically", async () => {
    const { threadId } = await db.createNewThread({
      workflowId: "w1",
      workflowSnapshot: {
        id: "w1",
        name: "WF1",
        description: "",
        isBuiltIn: false,
        nodes: [],
        edges: [],
      },
      activePresetId: "p1",
      initialMessage: "To Delete",
    });

    const actor = createActor(leftSidebarMachine).start();
    await waitFor(actor, (state) => state.matches("idle"), { timeout: 5000 });

    actor.send({ type: "TRIGGER_DELETE", threadId });
    expect(actor.getSnapshot().matches("confirmingDelete")).toBe(true);
    expect(actor.getSnapshot().context.deletingThreadId).toBe(threadId);

    actor.send({ type: "CONFIRM_DELETE" });
    expect(actor.getSnapshot().matches("deleting")).toBe(true);
    expect(actor.getSnapshot().context.threads.find((t) => t.id === threadId)?.status).toBe(
      "deleting",
    );

    await waitFor(actor, (state) => state.matches("idle"), { timeout: 5000 });
    expect(actor.getSnapshot().matches("idle")).toBe(true);
    while (await db.getThread(threadId)) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(await db.getThread(threadId)).toBeUndefined();
  });
});
