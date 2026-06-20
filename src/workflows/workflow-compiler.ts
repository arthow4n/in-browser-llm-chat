import type { Workflow, WorkflowNode, WorkflowEdge } from "../db/db-schema";

/**
 * GraphState represents the runtime state of a compiled workflow graph.
 * It is serialized into checkpoints by the custom checkpointer.
 */
export interface GraphState {
  /** Full message history – reducer always appends/updates messages */
  messages: unknown[];
  /** ID of the agent node executed last (used for tool routing back-edges) */
  lastAgentId: string | null;
  /** Set to true by consensus_check nodes or the declare_consensus tool */
  consensusReached: boolean;
  /** Set to true by FORCE_SUMMARIZE event to bypass consensus check */
  forceSummarize: boolean;
  /** Total steps/messages executed in the lifetime of this graph run */
  turnCount: number;
  /** Active loop iteration counter (incremented by loop-header nodes) */
  currentRound: number;
}

/**
 * Describes the type of action the runner should take for this step.
 */
export type CompiledNodeAction =
  | {
      kind: "agent";
      nodeId: string;
      nodeName: string;
      systemPrompt: string;
      presetId?: string;
      tools: string[];
      maxHistoryMessages?: number;
      excludeToolsBeforeRound?: Record<string, number>;
      loopHeader: boolean;
    }
  | { kind: "input" }
  | { kind: "tool" }
  | { kind: "consensus_check"; nodeId: string; systemPrompt: string; maxLoopLimit: number }
  | { kind: "summary"; nodeId: string; nodeName: string; systemPrompt: string; presetId?: string };

/**
 * A routing function is called after a node's action is resolved.
 * It receives the current GraphState and returns the ID of the next node,
 * or null to signal graph completion.
 */
export type RouterFn = (state: GraphState) => string | null;

/**
 * A compiled node: its resolved action description + router function.
 */
export interface CompiledNode {
  nodeId: string;
  action: CompiledNodeAction;
  /** Determines the next node ID based on current GraphState. Returns null when the graph ends. */
  route: RouterFn;
}

/**
 * The compiled workflow graph is a map from node ID to compiled node,
 * plus the entry node ID used to start execution.
 */
export interface CompiledWorkflowGraph {
  entryNodeId: string;
  nodes: Map<string, CompiledNode>;
}

/**
 * Resolves dynamic prompt placeholders in a system prompt string.
 *
 * Supported placeholders:
 *  - `{{user_input}}` – replaced with the first user message content in history.
 *  - `{{topic}}` – alias for {{user_input}}, typically used in debate workflows.
 *  - Any other `{{key}}` placeholder that is present in the `variables` map.
 *
 * Placeholder resolution is intentionally deferred to runtime (not compile time)
 * so that it is correctly populated even when execution starts on an empty thread.
 *
 * @param template - The raw system prompt string possibly containing `{{placeholder}}` tokens.
 * @param messages - The current message history at the time of node execution.
 * @param variables - An optional map of additional key/value placeholder overrides.
 * @returns The resolved system prompt string.
 */
export function resolvePlaceholders(
  template: string,
  messages: unknown[],
  variables: Record<string, string> = {},
): string {
  // Derive {{user_input}} / {{topic}} from the first user message in history.
  const firstUserMessage = (messages as Array<{ role?: string; content?: string }>).find(
    (m) => m.role === "user",
  );
  const userInput = firstUserMessage?.content ?? "";

  const builtInVariables: Record<string, string> = {
    user_input: userInput,
    topic: userInput,
    ...variables,
  };

  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const trimmed = key.trim();
    return trimmed in builtInVariables ? builtInVariables[trimmed] : _match;
  });
}

/**
 * Compiles a validated Workflow JSON schema into a runnable CompiledWorkflowGraph.
 *
 * The compiler:
 * 1. Finds the unique entry node (input node or node with no incoming edges).
 * 2. Maps each WorkflowNode to a CompiledNodeAction.
 * 3. Builds a RouterFn for each node based on its outbound WorkflowEdges.
 *
 * Compilation errors are thrown as plain Error objects with descriptive messages.
 * Note: presetId fallback resolution (missing/deleted preset → thread preset → global default)
 * is NOT performed here; it is deferred to the runtime executor so it can access the DB.
 *
 * @param workflow - A validated Workflow object (must pass validateWorkflowStructure).
 * @returns A CompiledWorkflowGraph ready for use by GraphRunnerActor.
 */
export function compileWorkflow(workflow: Workflow): CompiledWorkflowGraph {
  const nodes = workflow.nodes;
  const edges = workflow.edges;

  if (nodes.length === 0) {
    throw new Error("Workflow has no nodes.");
  }

  // Build auxiliary data structures
  const nodeMap = new Map<string, WorkflowNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const incomingEdges = new Map<string, WorkflowEdge[]>();
  const outgoingEdges = new Map<string, WorkflowEdge[]>();

  for (const node of nodes) {
    incomingEdges.set(node.id, []);
    outgoingEdges.set(node.id, []);
  }

  for (const edge of edges) {
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      outgoingEdges.get(edge.source)!.push(edge);
      incomingEdges.get(edge.target)!.push(edge);
    }
  }

  // Determine entry node (input-typed node or node with no incoming edges)
  let entryNodes = nodes.filter((n) => n.type === "input");
  if (entryNodes.length === 0) {
    entryNodes = nodes.filter((n) => (incomingEdges.get(n.id) ?? []).length === 0);
  }

  if (entryNodes.length === 0) {
    throw new Error(
      "Workflow compilation failed: no entry node found (no input node and no node without incoming edges).",
    );
  }
  if (entryNodes.length > 1) {
    throw new Error(
      `Workflow compilation failed: multiple entry nodes found (${entryNodes.map((n) => `"${n.id}"`).join(", ")}). Exactly one is required.`,
    );
  }

  const entryNodeId = entryNodes[0].id;

  // Compile each node
  const compiledNodes = new Map<string, CompiledNode>();

  for (const node of nodes) {
    const action = compileNodeAction(node);
    const route = buildRouter(node, outgoingEdges.get(node.id) ?? []);
    compiledNodes.set(node.id, { nodeId: node.id, action, route });
  }

  return {
    entryNodeId,
    nodes: compiledNodes,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Maps a WorkflowNode to its CompiledNodeAction descriptor.
 */
function compileNodeAction(node: WorkflowNode): CompiledNodeAction {
  switch (node.type) {
    case "agent": {
      return {
        kind: "agent",
        nodeId: node.id,
        nodeName: node.name ?? node.id,
        systemPrompt: (node.systemPrompt as string | undefined) ?? "",
        presetId: node.presetId as string | undefined,
        tools: Array.isArray(node.tools) ? (node.tools as string[]) : [],
        maxHistoryMessages: node.maxHistoryMessages as number | undefined,
        excludeToolsBeforeRound: node.excludeToolsBeforeRound as Record<string, number> | undefined,
        loopHeader: Boolean(node.loopHeader),
      };
    }

    case "input": {
      return { kind: "input" };
    }

    case "tool": {
      return { kind: "tool" };
    }

    case "consensus_check": {
      const maxLoopLimit = typeof node.maxLoopLimit === "number" ? node.maxLoopLimit : 5;
      return {
        kind: "consensus_check",
        nodeId: node.id,
        systemPrompt: (node.systemPrompt as string | undefined) ?? "",
        maxLoopLimit,
      };
    }

    case "summary": {
      return {
        kind: "summary",
        nodeId: node.id,
        nodeName: node.name ?? node.id,
        systemPrompt: (node.systemPrompt as string | undefined) ?? "",
        presetId: node.presetId as string | undefined,
      };
    }

    default: {
      throw new Error(
        `Workflow compilation failed: unknown node type "${node.type}" for node "${node.id}".`,
      );
    }
  }
}

/**
 * Builds a RouterFn for a node based on its type and outbound edges.
 *
 * Routing rules:
 * - `agent` with tools: if last message is a tool-call → `on_tool_call` edge; otherwise unconditional edge.
 * - `tool`: routes to the edge whose `target` matches `state.lastAgentId` with condition `on_tool_result`.
 * - `consensus_check`: routes `on_consensus` when loop should terminate; otherwise `on_no_consensus`.
 * - `input`, `summary`, and plain `agent` (no tools): uses the single unconditional edge (or null → graph end).
 */
function buildRouter(node: WorkflowNode, outEdges: WorkflowEdge[]): RouterFn {
  const hasTools =
    node.type === "agent" && Array.isArray(node.tools) && (node.tools as string[]).length > 0;

  // Precompute edge lookups
  const unconditionalEdges = outEdges.filter((e) => !e.condition);
  const conditionalEdges = outEdges.filter((e) => Boolean(e.condition));

  const defaultTarget = unconditionalEdges.length > 0 ? unconditionalEdges[0].target : null;

  switch (node.type) {
    case "agent": {
      if (!hasTools) {
        // Simple sequential agent: always go to default target
        return (_state: GraphState) => defaultTarget;
      }

      // Agent with tools: check if last message was a tool call
      const toolCallEdge = conditionalEdges.find((e) => e.condition === "on_tool_call");

      return (state: GraphState) => {
        const lastMsg = (state.messages as Array<{ role?: string; tool_calls?: unknown[] }>)[
          state.messages.length - 1
        ];
        const isToolCall =
          lastMsg?.role === "assistant" &&
          Array.isArray(lastMsg.tool_calls) &&
          lastMsg.tool_calls.length > 0;

        if (isToolCall && toolCallEdge) {
          return toolCallEdge.target;
        }
        return defaultTarget;
      };
    }

    case "input": {
      // Input nodes always route to default target after user provides input
      return (_state: GraphState) => defaultTarget;
    }

    case "tool": {
      // Tool nodes route back to the agent that triggered the tool call (via lastAgentId)
      const toolResultEdges = conditionalEdges.filter((e) => e.condition === "on_tool_result");

      return (state: GraphState) => {
        const agentId = state.lastAgentId;
        if (agentId) {
          const backEdge = toolResultEdges.find((e) => e.target === agentId);
          if (backEdge) {
            return backEdge.target;
          }
        }
        // Fall back to unconditional edge if no matching back-edge found
        return defaultTarget;
      };
    }

    case "consensus_check": {
      const maxLoopLimit = typeof node.maxLoopLimit === "number" ? node.maxLoopLimit : 5;
      const onConsensusEdge = conditionalEdges.find((e) => e.condition === "on_consensus");
      const onNoConsensusEdge = conditionalEdges.find((e) => e.condition === "on_no_consensus");

      return (state: GraphState) => {
        const shouldTerminate =
          state.consensusReached || state.forceSummarize || state.currentRound >= maxLoopLimit;

        if (shouldTerminate) {
          return onConsensusEdge?.target ?? defaultTarget;
        }
        return onNoConsensusEdge?.target ?? defaultTarget;
      };
    }

    case "summary": {
      // Summary nodes typically mark the end of the graph or route to a terminal
      return (_state: GraphState) => defaultTarget;
    }

    default: {
      return (_state: GraphState) => defaultTarget;
    }
  }
}
