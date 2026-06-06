import { describe, it, expect, beforeEach } from "vitest";
import { createActor } from "xstate";
import { graphRunnerActor } from "./graphRunnerActor.js";
import * as db from "../db/db.js";


describe("graphRunnerActor", () => {
  beforeEach(async () => {
    const dbInstance = await db.getDB();
    await dbInstance.clear("threads");
    await dbInstance.clear("presets");
    await dbInstance.clear("settings");
  });

  it("should initialize correctly from database settings and complete run", async () => {
    const threadId = "thread-1";
    const presetId = "preset-1";

    await db.savePreset({
      id: presetId,
      name: "Default Flash",
      provider: "gemini",
      model: "gemini-2.5-flash",
      temperature: 0.7,
      maxTokens: 100,
    });

    await db.setSetting("api_keys", { gemini: "test-key" });

    await db.saveThread({
      id: threadId,
      title: "Test Thread",
      workflowId: "wf-1",
      workflowSnapshot: {
        id: "wf-1",
        name: "Test Wf",
        nodes: [
          { id: "input", type: "input", name: "User Input" },
        ],
        edges: [],
      },
      activePresetId: presetId,
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
    });

    const actor = createActor(graphRunnerActor, {
      input: { threadId },
    });

    actor.start();

    console.log("Actor started, current state:", actor.getSnapshot().value);

    // Handle input interrupt
    await new Promise<void>((resolve) => {
      const sub = actor.subscribe((state) => {
        console.log("FIRST SUB State:", state.value);
        if (state.matches({ interrupted: "awaitingToolInput" })) {
          sub.unsubscribe();
          resolve();
        }
      });
    });

    console.log("Sending SUBMIT_TOOL_RESPONSE");
    actor.send({
      type: "SUBMIT_TOOL_RESPONSE",
      response: "Hello",
    });

    // Now wait for completion
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log("FINAL TIMEOUT STATE:", actor.getSnapshot().value);
          reject(new Error("Timeout waiting for completion"));
        }, 4000);

        actor.subscribe((state) => {
          console.log("State transition:", state.value);
          if (state.status === "done") {
            clearTimeout(timeout);
            resolve();
          }
          if (state.matches("failed")) {
            console.log("Actor failed with error:", state.context.errorMessage);
            clearTimeout(timeout);
            resolve();
          }
        });
      });
    } catch (e) {
      console.error(e);
    }

    const snapshot = actor.getSnapshot();
    expect(snapshot.status).toBe("done");
    expect(snapshot.context.presetConfig?.provider).toBe("gemini");
  });
});
