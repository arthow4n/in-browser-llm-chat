import {
  getWorkflow as dbGetWorkflow,
  saveWorkflow as dbSaveWorkflow,
  deleteWorkflow as dbDeleteWorkflow,
  listWorkflows as dbListWorkflows,
  listThreads,
} from "../db/db-operations";
import type { Workflow } from "../db/db-schema";
import { validateWorkflowStructure } from "./workflow-validation";

export const BUILT_IN_WORKFLOW_IDS = new Set(["standard-1-agent", "debate"]);

export const BUILT_IN_WORKFLOWS: Workflow[] = [
  {
    id: "standard-1-agent",
    name: "Standard 1-Agent",
    description: "A standard single-agent chat conversation.",
    isBuiltIn: true,
    nodes: [
      { id: "agent", type: "agent", name: "Agent", systemPrompt: "You are a helpful assistant." },
    ],
    edges: [],
  },
  {
    id: "debate",
    name: "Debate",
    description:
      "A multi-agent debate workflow. Seed the debate with a topic, then let two agents debate in a loop until consensus is reached or the round limit is hit. A summarizer then synthesises the outcome.",
    isBuiltIn: true,
    nodes: [
      {
        id: "input",
        type: "input",
        name: "Topic Input",
      },
      {
        id: "initiator",
        type: "agent",
        name: "Initiator",
        systemPrompt:
          "You are the debate moderator. The user has proposed the following debate topic:\n\n{{topic}}\n\nWrite a concise opening statement that:\n1. Restates the topic clearly.\n2. Frames the key questions and tensions to be debated.\n3. Invites Debater A (pro) and Debater B (con) to present their opening arguments.\n\nKeep the opening under 200 words.",
      },
      {
        id: "Debater_A",
        type: "agent",
        name: "Debater A",
        systemPrompt:
          "You are Debater A. You argue **in favour** of the debate topic: {{topic}}.\n\nGuidelines:\n- Present clear, logical arguments supported by evidence or reasoning.\n- Directly respond to your opponent's most recent counterargument.\n- Keep each response concise (under 250 words).\n- If you genuinely believe both sides have reached a satisfactory mutual understanding or agreement, you may call the `declare_consensus` tool to signal the end of the debate. Only do this when consensus is truly warranted — not prematurely.",
        loopHeader: true,
        tools: ["declare_consensus"],
        excludeToolsBeforeRound: { declare_consensus: 3 },
      },
      {
        id: "Debater_B",
        type: "agent",
        name: "Debater B",
        systemPrompt:
          "You are Debater B. You argue **against** the debate topic: {{topic}}.\n\nGuidelines:\n- Present clear, logical arguments supported by evidence or reasoning.\n- Directly respond to your opponent's most recent counterargument.\n- Keep each response concise (under 250 words).\n- If you genuinely believe both sides have reached a satisfactory mutual understanding or agreement, you may call the `declare_consensus` tool to signal the end of the debate. Only do this when consensus is truly warranted — not prematurely.",
        tools: ["declare_consensus"],
        excludeToolsBeforeRound: { declare_consensus: 3 },
      },
      {
        id: "debate_tool",
        type: "tool",
        name: "Debate Tool Executor",
      },
      {
        id: "Consensus_Evaluator_A",
        type: "consensus_check",
        name: "Consensus Evaluator A",
        systemPrompt:
          'You are an impartial debate evaluator. Review the debate history between Debater A and Debater B on the topic: {{topic}}.\n\nAnalyse the most recent exchange and determine whether the debaters have reached a genuine consensus or mutual understanding.\n\nRespond with a JSON object in exactly this format:\n{"consensusReached": boolean, "reasoning": string}\n\n- Set `consensusReached` to `true` only if both debaters have clearly acknowledged each other\'s core points and converged toward agreement.\n- Set it to `false` if meaningful disagreement still exists.\n- Keep `reasoning` under 100 words.',
        maxLoopLimit: 5,
      },
      {
        id: "Consensus_Evaluator_B",
        type: "consensus_check",
        name: "Consensus Evaluator B",
        systemPrompt:
          'You are an impartial debate evaluator. Review the debate history between Debater A and Debater B on the topic: {{topic}}.\n\nAnalyse the most recent exchange and determine whether the debaters have reached a genuine consensus or mutual understanding.\n\nRespond with a JSON object in exactly this format:\n{"consensusReached": boolean, "reasoning": string}\n\n- Set `consensusReached` to `true` only if both debaters have clearly acknowledged each other\'s core points and converged toward agreement.\n- Set it to `false` if meaningful disagreement still exists.\n- Keep `reasoning` under 100 words.',
        maxLoopLimit: 5,
      },
      {
        id: "summarizer",
        type: "summary",
        name: "Summarizer",
        systemPrompt:
          "You are the debate summarizer. Review the complete debate history on the topic: {{topic}}.\n\nWrite a structured summary that includes:\n1. **Topic**: Restate the debate topic.\n2. **Key Arguments For**: Summarise the strongest points raised by Debater A.\n3. **Key Arguments Against**: Summarise the strongest points raised by Debater B.\n4. **Outcome**: State whether the debaters reached consensus. If consensus was reached, highlight the agreed points. If the debate ended without consensus (due to reaching the round limit or early termination), note the remaining points of disagreement.\n5. **Conclusion**: Offer a balanced closing remark.\n\nKeep the summary clear, neutral, and under 400 words.",
      },
    ],
    edges: [
      { source: "input", target: "initiator" },
      { source: "initiator", target: "Debater_A" },
      // Debater_A routes to tool on tool_call, otherwise to Consensus_Evaluator_A
      { source: "Debater_A", target: "debate_tool", condition: "on_tool_call" },
      { source: "Debater_A", target: "Consensus_Evaluator_A" },
      // Debater_B routes to tool on tool_call, otherwise to Consensus_Evaluator_B
      { source: "Debater_B", target: "debate_tool", condition: "on_tool_call" },
      { source: "Debater_B", target: "Consensus_Evaluator_B" },
      // Tool node routes back to whichever agent triggered the tool call
      { source: "debate_tool", target: "Debater_A", condition: "on_tool_result" },
      { source: "debate_tool", target: "Debater_B", condition: "on_tool_result" },
      // Consensus evaluators route to next debater or summarizer
      {
        source: "Consensus_Evaluator_A",
        target: "Debater_B",
        condition: "on_no_consensus",
      },
      { source: "Consensus_Evaluator_A", target: "summarizer", condition: "on_consensus" },
      {
        source: "Consensus_Evaluator_B",
        target: "Debater_A",
        condition: "on_no_consensus",
      },
      { source: "Consensus_Evaluator_B", target: "summarizer", condition: "on_consensus" },
    ],
  },
];

export async function getWorkflow(id: string): Promise<Workflow | undefined> {
  const builtIn = BUILT_IN_WORKFLOWS.find((w) => w.id === id);
  if (builtIn) return builtIn;
  return dbGetWorkflow(id);
}

export async function saveWorkflow(workflow: Workflow): Promise<void> {
  if (BUILT_IN_WORKFLOW_IDS.has(workflow.id) || workflow.isBuiltIn) {
    throw new Error("Cannot modify built-in workflows.");
  }
  const validationErrors = validateWorkflowStructure(workflow);
  if (validationErrors.length > 0) {
    throw new Error(`Workflow validation failed: ${validationErrors.join("; ")}`);
  }
  await dbSaveWorkflow(workflow);
}

export async function deleteWorkflow(id: string): Promise<void> {
  if (BUILT_IN_WORKFLOW_IDS.has(id)) {
    throw new Error("Cannot delete built-in workflows.");
  }

  // Check if any threads are currently using this workflow
  const threads = await listThreads();
  const referencingThreads = threads.filter((t) => t.workflowId === id);
  if (referencingThreads.length > 0) {
    const threadTitles = referencingThreads.map((t) => `"${t.title}"`).join(", ");
    throw new Error(`Cannot delete workflow currently in use by active threads: ${threadTitles}`);
  }

  await dbDeleteWorkflow(id);
}

export async function listWorkflows(): Promise<Workflow[]> {
  const custom = await dbListWorkflows();
  return [...BUILT_IN_WORKFLOWS, ...custom];
}
