import type { WorkflowStore } from "../db/db";

export const BUILT_IN_WORKFLOWS: WorkflowStore[] = [
  {
    id: "builtin-standard-workflow",
    name: "Standard Agent",
    description: "A simple 1-agent loop for general purpose chatting.",
    isBuiltIn: true,
    nodes: [
      {
        id: "builtin-standard-agent",
        type: "agent",
        name: "Agent",
        systemPrompt: "You are a helpful assistant.",
      },
    ],
    edges: [],
  },
  {
    id: "builtin-debate-workflow",
    name: "Debate Workflow",
    description:
      "A workflow consisting of Initiator -> Debaters (loop) -> Evaluators -> Summarizer.",
    isBuiltIn: true,
    nodes: [
      {
        id: "builtin-debate-input",
        type: "input",
        name: "Input",
      },
      {
        id: "builtin-debate-initiator",
        type: "agent",
        name: "Initiator",
        systemPrompt:
          "You are the initiator. Start the debate by presenting the initial argument and key points.",
      },
      {
        id: "builtin-debate-debaters",
        type: "agent",
        name: "Debaters",
        systemPrompt:
          "You are the debaters. Critically analyze the arguments, find flaws, and present counter-arguments.",
      },
      {
        id: "builtin-debate-evaluator",
        type: "consensus_check",
        name: "Evaluator",
        systemPrompt:
          "Evaluate the debate. Determine if a consensus has been reached or if further debate is needed.",
      },
      {
        id: "builtin-debate-summarizer",
        type: "agent",
        name: "Summarizer",
        systemPrompt:
          "Summarize the entire debate, highlighting the key arguments and the final conclusion reached.",
      },
    ],
    edges: [
      {
        from: "builtin-debate-input",
        to: "builtin-debate-initiator",
      },
      {
        from: "builtin-debate-initiator",
        to: "builtin-debate-debaters",
      },
      {
        from: "builtin-debate-debaters",
        to: "builtin-debate-evaluator",
      },
      {
        from: "builtin-debate-evaluator",
        to: "builtin-debate-debaters",
        condition: "on_no_consensus",
      },
      {
        from: "builtin-debate-evaluator",
        to: "builtin-debate-summarizer",
        condition: "on_consensus",
      },
    ],
  },
];
