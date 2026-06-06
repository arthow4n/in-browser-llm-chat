import { describe, it, expect, vi, beforeEach } from "vitest";
import { createActor } from "xstate";
import { graphRunnerActor } from "./graphRunnerActor.js";
import * as db from "../db/db.js";
import { http, HttpResponse } from "msw";
import { server } from "../test/msw-setup";

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
          { id: "agent", type: "agent", name: "Agent", systemPrompt: "Say hello" },
        ],
        edges: [{ from: "input", to: "agent" }],
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

    // Mock the Gemini API call
    server.use(
      http.post(/generativelanguage\.googleapis\.com\/v1beta\/models\/.*:generateContent/, () => {
        return HttpResponse.json({ candidates: [] });
      }),
    );

    const actor = createActor(graphRunnerActor, {
      input: { threadId },
    });

    actor.start();

    console.log("Actor started, current state:", actor.getSnapshot().value);

    // Handle input interrupt
    await new Promise((resolve) => {
      actor.subscribe((state) => {
        if (state.matches("interrupted")) {
          actor.send({
            type: "SUBMIT_TOOL_RESPONSE",
            response: "Hello",
          });
          resolve(true);
        }
      });
    });

    // Now wait for completion
    await new Promise((resolve) => {
      actor.subscribe((state) => {
        console.log("State transition:", state.value);
        if (state.status === "done") {
          console.log("Actor reached done status");
          resolve(true);
        }
        if (state.matches("failed")) {
          console.log("Actor failed with error:", state.context.errorMessage);
          resolve(false);
        }
      });
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.status).toBe("done");
    expect(snapshot.context.presetConfig?.provider).toBe("gemini");
  });
});
