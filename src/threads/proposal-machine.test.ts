import { describe, it, expect, vi } from "vitest";
import { createActor } from "xstate";
import { proposalMachine } from "./proposal-machine";
import * as dbConn from "../db/db-connection";

vi.mock("../db/db-operations", () => ({
  getThread: vi.fn<() => Promise<unknown>>(),
  saveThread: vi.fn<() => Promise<unknown>>(),
}));

interface MockStore {
  get: unknown;
  put: unknown;
  index: unknown;
}

interface MockTx {
  objectStore: (name: string) => MockStore;
  done: Promise<void>;
}

interface MockDB {
  transaction: (storeNames: string | string[], mode?: string) => MockTx;
}

vi.mock("../db/db-connection", () => {
  const mockPut = vi.fn<() => Promise<void>>();
  const mockGet = vi.fn<() => Promise<unknown>>();
  const mockIndex = vi.fn<() => unknown>(() => ({
    openCursor: vi.fn<() => Promise<unknown>>().mockResolvedValue(null),
  }));
  const mockStore = {
    get: mockGet,
    put: mockPut,
    index: mockIndex,
  };
  const mockTx = {
    objectStore: vi.fn<() => unknown>(() => mockStore),
    done: Promise.resolve(),
  };
  const mockDb = {
    transaction: vi.fn<() => unknown>(() => mockTx),
  };
  return {
    getDB: vi.fn<() => Promise<unknown>>().mockResolvedValue(mockDb),
  };
});

describe("proposalMachine", () => {
  it("should initialize in idle state and load proposal correctly", () => {
    const actor = createActor(proposalMachine).start();
    expect(actor.getSnapshot().value).toBe("idle");

    actor.send({
      type: "LOAD_PROPOSAL",
      threadId: "thread-1",
      toolCallId: "call-1",
      toolName: "declare_consensus",
      proposalData: { topic: "test" },
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("active");
    expect(snapshot.context.threadId).toBe("thread-1");
    expect(snapshot.context.toolCallId).toBe("call-1");
    expect(snapshot.context.toolName).toBe("declare_consensus");
    expect(snapshot.context.proposalData).toEqual({ topic: "test" });
  });

  it("should handle approve state transitions", async () => {
    const mockDb = (await dbConn.getDB()) as unknown as MockDB;
    const mockTx = mockDb.transaction("threads", "readonly");
    const mockStore = mockTx.objectStore("threads");
    vi.mocked(mockStore.get as { mockResolvedValue: (val: unknown) => void }).mockResolvedValue({
      id: "thread-1",
      title: "Test Thread",
      workflowId: "test-flow",
      workflowSnapshot: {},
      activePresetId: "preset-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "awaiting_input",
      activeInterrupt: { type: "approval", toolCallId: "call-1" },
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    });

    const actor = createActor(proposalMachine).start();
    actor.send({
      type: "LOAD_PROPOSAL",
      threadId: "thread-1",
      toolCallId: "call-1",
      toolName: "declare_consensus",
      proposalData: { topic: "test" },
    });

    actor.send({ type: "APPROVE" });
    expect(actor.getSnapshot().value).toBe("submitting");

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(actor.getSnapshot().value).toBe("approved");
  });

  it("should handle reject state transitions", async () => {
    const mockDb = (await dbConn.getDB()) as unknown as MockDB;
    const mockTx = mockDb.transaction("threads", "readonly");
    const mockStore = mockTx.objectStore("threads");
    vi.mocked(mockStore.get as { mockResolvedValue: (val: unknown) => void }).mockResolvedValue({
      id: "thread-1",
      title: "Test Thread",
      workflowId: "test-flow",
      workflowSnapshot: {},
      activePresetId: "preset-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "awaiting_input",
      activeInterrupt: { type: "approval", toolCallId: "call-1" },
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    });

    const actor = createActor(proposalMachine).start();
    actor.send({
      type: "LOAD_PROPOSAL",
      threadId: "thread-1",
      toolCallId: "call-1",
      toolName: "declare_consensus",
      proposalData: { topic: "test" },
    });

    actor.send({ type: "REJECT", reason: "incorrect consensus" });
    expect(actor.getSnapshot().value).toBe("rejecting");

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(actor.getSnapshot().value).toBe("rejected");
  });
});
