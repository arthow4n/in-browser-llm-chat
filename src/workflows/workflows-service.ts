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
    description: "A multi-agent debate workflow where two agents debate a topic.",
    isBuiltIn: true,
    nodes: [
      {
        id: "initiator",
        type: "agent",
        name: "Initiator",
        systemPrompt: "You are the debate initiator. Set up the debate on the topic: {{topic}}.",
      },
      {
        id: "Debater_A",
        type: "agent",
        name: "Debater A",
        systemPrompt: "Argue in favor of the topic.",
        loopHeader: true,
      },
      {
        id: "Debater_B",
        type: "agent",
        name: "Debater B",
        systemPrompt: "Argue against the topic.",
      },
      {
        id: "Consensus_Evaluator_A",
        type: "consensus_check",
        name: "Consensus Evaluator A",
      },
      {
        id: "Consensus_Evaluator_B",
        type: "consensus_check",
        name: "Consensus Evaluator B",
      },
      {
        id: "summarizer",
        type: "summary",
        name: "Summarizer",
        systemPrompt: "Summarize the debate.",
      },
    ],
    edges: [
      { source: "initiator", target: "Debater_A" },
      { source: "Debater_A", target: "Consensus_Evaluator_A" },
      { source: "Consensus_Evaluator_A", target: "Debater_B", condition: "on_no_consensus" },
      { source: "Consensus_Evaluator_A", target: "summarizer", condition: "on_consensus" },
      { source: "Debater_B", target: "Consensus_Evaluator_B" },
      { source: "Consensus_Evaluator_B", target: "Debater_A", condition: "on_no_consensus" },
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
