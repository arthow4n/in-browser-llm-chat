import { setup, assign } from "xstate";

export interface Answer {
  selected?: string[];
  text?: string;
  refused?: boolean;
  refusalReason?: string;
}

export interface AskQuestionsContext {
  answers: Record<string, Answer>;
  initialDraftsLoaded: boolean;
}

export type AskQuestionsEvent =
  | { type: "UPDATE_ANSWER"; questionId: string; value: Partial<Answer> }
  | { type: "LOAD_INITIAL_DRAFTS"; drafts: Record<string, Answer> | undefined };

export const askQuestionsMachine = setup({
  types: {
    context: {} as AskQuestionsContext,
    events: {} as AskQuestionsEvent,
    input: {} as { initialDrafts: Record<string, Answer> | undefined },
  },
  actions: {
    updateAnswer: assign({
      answers: ({ context, event }) => {
        if (event.type !== "UPDATE_ANSWER") return context.answers;
        const currentAnswer = context.answers[event.questionId] || {};
        return {
          ...context.answers,
          [event.questionId]: { ...currentAnswer, ...event.value },
        };
      },
    }),
    loadInitialDrafts: assign({
      answers: ({ context, event }) => {
        if (event.type !== "LOAD_INITIAL_DRAFTS") return context.answers;
        if (context.initialDraftsLoaded) return context.answers;
        return event.drafts || {};
      },
      initialDraftsLoaded: true,
    }),
  },
}).createMachine({
  id: "askQuestions",
  context: ({ input }) => ({
    answers: input.initialDrafts || {},
    initialDraftsLoaded: true,
  }),
  initial: "idle",
  states: {
    idle: {
      on: {
        UPDATE_ANSWER: {
          actions: "updateAnswer",
        },
        LOAD_INITIAL_DRAFTS: {
          actions: "loadInitialDrafts",
        },
      },
    },
  },
});
