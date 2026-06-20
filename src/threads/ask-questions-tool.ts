import { tool } from "ai";
import { AskQuestionsSchema } from "../db/db-schema";

export const askQuestionsTool = tool({
  description:
    "Prompts the user with one or more questions in the chat feed. Questions can be single-select, multi-select, or free-text, optionally allowing freetext comments alongside options.",
  parameters: AskQuestionsSchema,
  execute: async () => {
    return { status: "paused" };
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
