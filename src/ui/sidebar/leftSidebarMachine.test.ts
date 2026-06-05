import { describe, it, expect, beforeEach, vi } from "vitest";
import { createActor } from "xstate";
import { leftSidebarMachine } from "./leftSidebarMachine.js";
import * as db from "../../db/db.js";
import "fake-indexeddb/auto";

vi.mock("../../db/db", async () => {
  const actual = await vi.importActual("../../db/db");
  return {
    ...actual,
    getPaginatedThreads: vi.fn<typeof db.getPaginatedThreads>(),
    deleteThread: vi.fn<typeof db.deleteThread>(),
  };
});

describe("leftSidebarMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should start in loadingInitial state and load threads", async () => {
    const mockThreads: db.ThreadStore[] = [
      {
        id: "t1",
        title: "Test Thread 1",
        workflowId: "w1",
        workflowSnapshot: {},
        activePresetId: "p1",
        createdAt: 1000,
        updatedAt: 1000,
        parentThreadId: null,
        parentMessageId: null,
        status: "inactive",
        activeInterrupt: null,
        errorMessage: null,
        latestCheckpointId: null,
        latestCheckpointNs: null,
        tokenStats: null,
      },
    ];

    vi.mocked(db.getPaginatedThreads).mockResolvedValue({
      threads: mockThreads,
      hasMore: true,
    });

    const actor = createActor(leftSidebarMachine).start();
    expect(actor.getSnapshot().value).toBe("loadingInitial");

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.threads).toEqual(mockThreads);
    expect(actor.getSnapshot().context.hasMore).toBe(true);
    expect(actor.getSnapshot().context.page).toBe(1);
  });

  it("should support filtering and reset page to 1", async () => {
    vi.mocked(db.getPaginatedThreads).mockResolvedValue({
      threads: [],
      hasMore: false,
    });

    const actor = createActor(leftSidebarMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: "FILTER_THREADS", query: "hello" });
    expect(actor.getSnapshot().value).toBe("loadingInitial");
    expect(actor.getSnapshot().context.searchQuery).toBe("hello");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("should load more threads when requested and append them", async () => {
    const initialThread: db.ThreadStore = {
      id: "t1",
      title: "Test Thread 1",
      workflowId: "w1",
      workflowSnapshot: {},
      activePresetId: "p1",
      createdAt: 1000,
      updatedAt: 1000,
      parentThreadId: null,
      parentMessageId: null,
      status: "inactive",
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    };

    const nextThread: db.ThreadStore = {
      id: "t2",
      title: "Test Thread 2",
      workflowId: "w1",
      workflowSnapshot: {},
      activePresetId: "p1",
      createdAt: 2000,
      updatedAt: 2000,
      parentThreadId: null,
      parentMessageId: null,
      status: "inactive",
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    };

    vi.mocked(db.getPaginatedThreads)
      .mockResolvedValueOnce({
        threads: [initialThread],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        threads: [nextThread],
        hasMore: false,
      });

    const actor = createActor(leftSidebarMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().context.threads).toEqual([initialThread]);

    actor.send({ type: "LOAD_MORE" });
    expect(actor.getSnapshot().value).toBe("loadingMore");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.threads).toEqual([initialThread, nextThread]);
    expect(actor.getSnapshot().context.page).toBe(2);
    expect(actor.getSnapshot().context.hasMore).toBe(false);
  });

  it("should delete a thread and update optimistically", async () => {
    const threadToDelete: db.ThreadStore = {
      id: "t1",
      title: "Test Thread 1",
      workflowId: "w1",
      workflowSnapshot: {},
      activePresetId: "p1",
      createdAt: 1000,
      updatedAt: 1000,
      parentThreadId: null,
      parentMessageId: null,
      status: "inactive",
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    };

    vi.mocked(db.getPaginatedThreads).mockResolvedValue({
      threads: [threadToDelete],
      hasMore: false,
    });
    vi.mocked(db.deleteThread).mockResolvedValue(undefined);

    const actor = createActor(leftSidebarMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: "TRIGGER_DELETE", threadId: "t1" });
    expect(actor.getSnapshot().value).toBe("confirmingDelete");
    expect(actor.getSnapshot().context.deletingThreadId).toBe("t1");

    actor.send({ type: "CONFIRM_DELETE" });
    expect(actor.getSnapshot().value).toBe("deleting");
    // Optimistic UI check - status should be set to deleting
    expect(actor.getSnapshot().context.threads[0].status).toBe("deleting");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actor.getSnapshot().value).toBe("idle");
  });
});
