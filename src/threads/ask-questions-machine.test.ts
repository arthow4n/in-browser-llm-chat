import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createActor } from "xstate";
import { getDB, resetDBConnection } from "../db/db-connection";
import { saveThread, getThread, getThreadMessages } from "../db/db-operations";
import { askQuestionsMachine } from "./ask-questions-machine";
import type { AskQuestionsQuestion, Thread } from "../db/db-schema";

describe("askQuestionsMachine", () => {
  beforeEach(async () => {
    resetDBConnection();
    const db = await getDB();
    for (const name of Array.from(db.objectStoreNames)) {
      await db.clear(name);
    }
  });

  afterEach(async () => {
    const db = await getDB();
    db.close();
    resetDBConnection();
  });

  const sampleQuestions: AskQuestionsQuestion[] = [
    {
      id: "q1",
      text: "Single Select Q",
      type: "single-select",
      options: ["A", "B"],
      allowFreetext: false,
      required: true,
    },
    {
      id: "q2",
      text: "Free Text Q",
      type: "free-text",
      allowFreetext: true,
      required: false,
    },
  ];

  const threadId = "8a2f463c-ef83-4c93-9f46-7b83887ff66e";
  const presetId = "a2f463ce-f834-c939-f467-b83887ff66e2";

  async function setupMockThread() {
    const thread: Thread = {
      id: threadId,
      title: "Test Thread",
      workflowId: "std",
      workflowSnapshot: {},
      activePresetId: presetId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "awaiting_input",
      activeInterrupt: {
        type: "ask_questions",
        toolCallId: "call-1",
      },
      draftAnswers: {},
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    };
    await saveThread(thread);
  }

  it("should initialize validation on LOAD_QUESTIONS and handle UPDATE_ANSWER", async () => {
    await setupMockThread();
    const actor = createActor(askQuestionsMachine).start();

    actor.send({
      type: "LOAD_QUESTIONS",
      threadId,
      toolCallId: "call-1",
      questions: sampleQuestions,
    });

    // Validating state is synchronous in our entry implementation, so it transitions directly to editing.
    let snapshot = actor.getSnapshot();
    expect(snapshot.value).toEqual({ active: "editing" });
    expect(snapshot.context.isValid).toBe(false); // q1 is required and empty
    expect(snapshot.context.validationErrors.q1).toBeDefined();

    // Now update q1 answer to satisfy required validation
    actor.send({
      type: "UPDATE_ANSWER",
      questionId: "q1",
      answer: { selected: ["A"] },
    });

    snapshot = actor.getSnapshot();
    expect(snapshot.value).toEqual({ active: "editing" });
    expect(snapshot.context.isValid).toBe(true); // q1 answered, q2 is optional

    // Verify draft was saved in DB
    await new Promise((resolve) => setTimeout(resolve, 50));
    const thread = await getThread(threadId);
    expect(thread?.draftAnswers?.["call-1"]).toEqual({
      q1: { selected: ["A"] },
    });
  });

  it("should submit answer payload successfully and clear interrupt & draft", async () => {
    await setupMockThread();
    const actor = createActor(askQuestionsMachine).start();

    actor.send({
      type: "LOAD_QUESTIONS",
      threadId,
      toolCallId: "call-1",
      questions: sampleQuestions,
    });

    actor.send({
      type: "UPDATE_ANSWER",
      questionId: "q1",
      answer: { selected: ["A"] },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    actor.send({ type: "SUBMIT" });

    // Wait for submitting actor to finish and reach submitted final state
    await new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.matches("submitted")) {
          resolve();
        }
      });
    });

    const thread = await getThread(threadId);
    expect(thread?.draftAnswers?.["call-1"]).toBeUndefined();
    expect(thread?.activeInterrupt).toBeNull();
    expect(thread?.status).toBe("executing");

    const messages = await getThreadMessages(threadId);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("tool");
    expect(messages[0].toolCallId).toBe("call-1");
    const content = JSON.parse(messages[0].content);
    expect(content.answers.q1.selected).toEqual(["A"]);
  });

  it("should support refusing to answer all questions", async () => {
    await setupMockThread();
    const actor = createActor(askQuestionsMachine).start();

    actor.send({
      type: "LOAD_QUESTIONS",
      threadId,
      toolCallId: "call-1",
      questions: sampleQuestions,
    });

    actor.send({
      type: "REFUSE",
      refusalReason: "Too personal",
    });

    // Wait for refusing actor to finish and reach refused final state
    await new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.matches("refused")) {
          resolve();
        }
      });
    });

    const thread = await getThread(threadId);
    expect(thread?.activeInterrupt).toBeNull();

    const messages = await getThreadMessages(threadId);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("tool");
    const content = JSON.parse(messages[0].content);
    expect(content.answers.q1.refused).toBe(true);
    expect(content.answers.q1.refusalReason).toBe("Too personal");
  });
});
