import { describe, it, expect, vi, beforeEach } from "vitest";
import { createActor } from "xstate";
import { graphRunnerActor } from "./graphRunnerActor.js";
import { getThread } from "../db/db.js";

vi.mock("../db/db.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getThread: vi.fn<(...args: unknown[]) => unknown>(),
    getPreset: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue({
      id: "preset-1",
      name: "Default Flash",
      provider: "gemini",
      model: "gemini-2.5-flash",
      temperature: 0.7,
      maxTokens: 100,
    }),
    getSetting: vi.fn<(...args: [string]) => unknown>().mockImplementation((key) => {
      if (key === "api_keys") {
        return { gemini: "test-key" };
      }
      return null;
    }),
    saveThread: vi.fn<(...args: unknown[]) => unknown>(),
    saveMessage: vi.fn<(...args: unknown[]) => unknown>(),
  };
});

vi.mock("./compiler.js", () => ({
  compileWorkflow: vi.fn<(...args: unknown[]) => unknown>().mockReturnValue({
    compile: vi.fn<(...args: unknown[]) => unknown>().mockReturnValue({
      getState: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue({
        next: [],
        config: { configurable: { checkpoint_id: "cp-1", checkpoint_ns: "" } },
      }),
      stream: vi.fn<(...args: unknown[]) => unknown>().mockImplementation(async function* () {
        // Empty generator
      }),
    }),
  }),
}));

describe("graphRunnerActor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize correctly from database settings and complete run", async () => {
    const mockThread = {
      id: "thread-1",
      title: "Test Thread",
      workflowId: "wf-1",
      workflowSnapshot: {
        id: "wf-1",
        name: "Test Wf",
        nodes: [{ id: "input", type: "input", name: "User Input" }],
        edges: [],
      },
      activePresetId: "preset-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "inactive",
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    };
    vi.mocked(getThread).mockResolvedValue(mockThread as never);
    const actor = createActor(graphRunnerActor, {
      input: { threadId: "thread-1" },
    });

    actor.start();

    // Wait for the actor to complete
    await new Promise((resolve) => {
      actor.subscribe((state) => {
        if (state.status === "done") {
          resolve(true);
        }
      });
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.status).toBe("done");
    expect(snapshot.context.presetConfig?.provider).toBe("gemini");
  });
});
