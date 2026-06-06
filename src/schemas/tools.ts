import { z } from "zod";

export interface Answer {
  selected?: string[];
  text?: string;
  refused?: boolean;
  refusalReason?: string;
}

export const AskQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      type: z.enum(["single-select", "multi-select", "free-text"]).default("multi-select"),
      options: z.array(z.string()).optional(), // suggested options (required for select types)
      allowFreetext: z.boolean().default(true), // allows comments/free-text alongside select options
      required: z.boolean().default(true), // if true, the user must provide an answer/selection before submitting
    }),
  ),
});

export interface AskQuestionsResponse {
  answers: {
    [questionId: string]: {
      selected?: string[]; // Selected options (for single-select / multi-select options)
      text?: string; // Freetext input or comment
      refused?: boolean; // True if the user clicked "Refuse to Answer" for this question
      refusalReason?: string; // Optional reasoning for refusal
    };
  };
}
