import { createMachine, assign, fromPromise } from "xstate";
import type { AskQuestionsQuestion, AskQuestionsResponse, Message } from "../db/db-schema";
import { getThread, saveThread } from "../db/db-operations";
import { getDB } from "../db/db-connection";

export interface AskQuestionsContext {
  threadId: string;
  toolCallId: string;
  questions: AskQuestionsQuestion[];
  answers: Record<string, { selected?: string[]; text?: string }>;
  isValid: boolean;
  validationErrors: Record<string, string>;
  refusalReason: string;
  errorMessage: string | null;
}

export type AskQuestionsEvent =
  | {
      type: "LOAD_QUESTIONS";
      threadId: string;
      toolCallId: string;
      questions: AskQuestionsQuestion[];
      draftAnswers?: Record<string, Record<string, { selected?: string[]; text?: string }>>;
    }
  | {
      type: "UPDATE_ANSWER";
      questionId: string;
      answer: { selected?: string[]; text?: string };
    }
  | {
      type: "VALIDATION_RESULT";
      isValid: boolean;
      validationErrors: Record<string, string>;
    }
  | { type: "SUBMIT" }
  | { type: "SUBMIT_SUCCESS"; message: unknown }
  | { type: "SUBMIT_FAILURE"; error: string }
  | { type: "REFUSE"; refusalReason: string }
  | { type: "REFUSE_SUCCESS" }
  | { type: "REFUSE_FAILURE"; error: string };

function validateAnswers(
  questions: AskQuestionsQuestion[],
  answers: Record<string, { selected?: string[]; text?: string }>,
) {
  const validationErrors: Record<string, string> = {};
  let isValid = true;

  for (const q of questions) {
    if (q.required) {
      const ans = answers[q.id];
      if (!ans) {
        isValid = false;
        validationErrors[q.id] = "This question is required.";
        continue;
      }
      if (q.type === "free-text") {
        if (!ans.text || ans.text.trim() === "") {
          isValid = false;
          validationErrors[q.id] = "Text response is required.";
        }
      } else {
        const hasSelection = ans.selected && ans.selected.length > 0;
        const hasText = ans.text && ans.text.trim() !== "";
        if (!hasSelection && !hasText) {
          isValid = false;
          validationErrors[q.id] = "Selection or comment is required.";
        }
      }
    }
  }

  return { isValid, errors: validationErrors };
}

export async function submitToolResponseTransaction(
  threadId: string,
  toolCallId: string,
  answersPayload: AskQuestionsResponse,
) {
  const db = await getDB();
  const tx = db.transaction(["threads", "messages"], "readwrite");
  const threadsStore = tx.objectStore("threads");
  const messagesStore = tx.objectStore("messages");

  const thread = await threadsStore.get(threadId);
  if (!thread) {
    throw new Error(`Thread ${threadId} not found`);
  }

  if (thread.draftAnswers) {
    delete thread.draftAnswers[toolCallId];
    if (Object.keys(thread.draftAnswers).length === 0) {
      delete thread.draftAnswers;
    }
  }

  if (thread.activeInterrupt?.toolCallId === toolCallId) {
    thread.activeInterrupt = null;
  }
  thread.status = "executing";
  thread.updatedAt = Date.now();
  await threadsStore.put(thread);

  const index = messagesStore.index("threadId");
  const messages: Message[] = [];
  let cursor = await index.openCursor(IDBKeyRange.only(threadId));
  while (cursor) {
    messages.push(cursor.value);
    cursor = await cursor.continue();
  }
  const nextSeq = messages.length > 0 ? Math.max(...messages.map((m) => m.sequence)) + 1 : 1;

  const toolMsg = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `tool-msg-${Date.now()}`,
    threadId,
    sequence: nextSeq,
    role: "tool" as const,
    name: "ask_questions",
    content: JSON.stringify(answersPayload),
    type: "text" as const,
    createdAt: Date.now(),
    checkpointId: null,
    checkpointNs: null,
    toolCallId,
  };
  await messagesStore.put(toolMsg);

  await tx.done;
  return toolMsg;
}

export async function persistDraft(
  threadId: string,
  toolCallId: string,
  answers: Record<string, { selected?: string[]; text?: string }>,
) {
  const thread = await getThread(threadId);
  if (thread) {
    const draftAnswers = thread.draftAnswers || {};
    draftAnswers[toolCallId] = answers;
    thread.draftAnswers = draftAnswers;
    await saveThread(thread);
  }
}

export const askQuestionsMachine = createMachine(
  {
    types: {} as {
      context: AskQuestionsContext;
      events: AskQuestionsEvent;
    },
    id: "askQuestions",
    initial: "idle",
    context: {
      threadId: "",
      toolCallId: "",
      questions: [],
      answers: {},
      isValid: false,
      validationErrors: {},
      refusalReason: "",
      errorMessage: null,
    },
    states: {
      idle: {
        on: {
          LOAD_QUESTIONS: {
            target: "active.validating",
            actions: assign({
              threadId: ({ event }) => event.threadId,
              toolCallId: ({ event }) => event.toolCallId,
              questions: ({ event }) => event.questions,
              answers: ({ event }) => event.draftAnswers?.[event.toolCallId] || {},
              errorMessage: () => null,
            }),
          },
        },
      },
      active: {
        initial: "editing",
        states: {
          editing: {
            on: {
              UPDATE_ANSWER: {
                target: "validating",
                actions: assign(({ context, event }) => {
                  const newAnswers = {
                    ...context.answers,
                    [event.questionId]: {
                      ...context.answers[event.questionId],
                      ...event.answer,
                    },
                  };
                  if (context.threadId && context.toolCallId) {
                    void persistDraft(context.threadId, context.toolCallId, newAnswers);
                  }
                  return { answers: newAnswers };
                }),
              },
              SUBMIT: {
                guard: ({ context }) => context.isValid,
                target: "#askQuestions.submitting",
              },
              REFUSE: {
                target: "#askQuestions.refusing",
                actions: assign({
                  refusalReason: ({ event }) => event.refusalReason,
                }),
              },
            },
          },
          validating: {
            entry: [
              ({ context, self }) => {
                const { isValid, errors } = validateAnswers(context.questions, context.answers);
                self.send({ type: "VALIDATION_RESULT", isValid, validationErrors: errors });
              },
            ],
            on: {
              VALIDATION_RESULT: {
                target: "editing",
                actions: assign({
                  isValid: ({ event }) => event.isValid,
                  validationErrors: ({ event }) => event.validationErrors,
                }),
              },
            },
          },
        },
      },
      submitting: {
        invoke: {
          src: "submitActor",
          input: ({ context }) => ({
            threadId: context.threadId,
            toolCallId: context.toolCallId,
            questions: context.questions,
            answers: context.answers,
          }),
          onDone: {
            target: "submitted",
          },
          onError: {
            target: "active.editing",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Submission failed",
            }),
          },
        },
      },
      refusing: {
        invoke: {
          src: "refuseActor",
          input: ({ context }) => ({
            threadId: context.threadId,
            toolCallId: context.toolCallId,
            questions: context.questions,
            refusalReason: context.refusalReason,
          }),
          onDone: {
            target: "refused",
          },
          onError: {
            target: "active.editing",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Refusal failed",
            }),
          },
        },
      },
      submitted: {
        type: "final",
      },
      refused: {
        type: "final",
      },
    },
  },
  {
    actors: {
      submitActor: fromPromise(
        async ({
          input,
        }: {
          input: {
            threadId: string;
            toolCallId: string;
            questions: AskQuestionsQuestion[];
            answers: Record<string, { selected?: string[]; text?: string }>;
          };
        }) => {
          const { threadId, toolCallId, questions, answers } = input;
          const answersPayload: AskQuestionsResponse = {
            answers: {},
          };
          for (const q of questions) {
            const ans = answers[q.id];
            answersPayload.answers[q.id] = {
              selected: ans?.selected,
              text: ans?.text,
            };
          }
          return submitToolResponseTransaction(threadId, toolCallId, answersPayload);
        },
      ),
      refuseActor: fromPromise(
        async ({
          input,
        }: {
          input: {
            threadId: string;
            toolCallId: string;
            questions: AskQuestionsQuestion[];
            refusalReason: string;
          };
        }) => {
          const { threadId, toolCallId, questions, refusalReason } = input;
          const answersPayload: AskQuestionsResponse = {
            answers: {},
          };
          for (const q of questions) {
            answersPayload.answers[q.id] = {
              refused: true,
              refusalReason,
            };
          }
          return submitToolResponseTransaction(threadId, toolCallId, answersPayload);
        },
      ),
    },
  },
);
