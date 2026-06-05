import { z } from "zod";

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1, "Node ID cannot be empty"),
  type: z.enum(["agent", "input", "tool", "consensus_check", "summary"]),
  name: z.string().min(1, "Node name cannot be empty"),
  systemPrompt: z.string().optional(),
  presetId: z.string().optional(),
  tools: z.array(z.string()).optional(),
  loopHeader: z.boolean().optional(),
  maxHistoryMessages: z.number().optional(),
  excludeToolsBeforeRound: z.record(z.string(), z.number()).optional(),
  maxLoopLimit: z.number().optional(),
});

export const WorkflowEdgeSchema = z.object({
  from: z.string().min(1, "From node ID cannot be empty"),
  to: z.string().min(1, "To node ID cannot be empty"),
  condition: z
    .enum(["on_tool_call", "on_tool_result", "on_consensus", "on_no_consensus"])
    .optional(),
});

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export interface WorkflowValidationResult {
  success: boolean;
  errors: string[];
}

export function validateWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowValidationResult {
  const errors: string[] = [];

  // Check for unique node IDs
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  // 2. Edge Validity: The from and to properties of every edge must reference existing node IDs in the nodes array.
  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`Edge references non-existent 'from' node ID: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`Edge references non-existent 'to' node ID: ${edge.to}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // 3. Graph Entry Point: There must be exactly one entry point node
  // Defined either as an input node or a node with no incoming edges.
  const nodesWithIncomingEdges = new Set<string>();
  for (const edge of edges) {
    nodesWithIncomingEdges.add(edge.to);
  }

  const entryNodes = nodes.filter((n) => n.type === "input" || !nodesWithIncomingEdges.has(n.id));

  if (entryNodes.length === 0) {
    errors.push(
      "Graph must have at least one entry point node (input node or node with no incoming edges).",
    );
  } else if (entryNodes.length > 1) {
    errors.push(
      `Graph has multiple potential entry point nodes: ${entryNodes.map((n) => n.id).join(", ")}. There must be exactly one.`,
    );
  }

  const entryNode = entryNodes[0];

  // 1. Connectivity: Every node (except entry) must have at least one incoming path from the entry node.
  // We can do a BFS/DFS starting from the entry node.
  const adjacencyList = new Map<string, string[]>();
  for (const node of nodes) {
    adjacencyList.set(node.id, []);
  }
  for (const edge of edges) {
    if (adjacencyList.has(edge.from)) {
      adjacencyList.get(edge.from)!.push(edge.to);
    }
  }

  const visited = new Set<string>();
  if (entryNode) {
    const queue: string[] = [entryNode.id];
    visited.add(entryNode.id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacencyList.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      errors.push(`Node '${node.id}' is unreachable or isolated from the entry point.`);
    }
  }

  // 5. Topology Restrictions: Sequential and conditional execution DAGs. Parallel execution branches
  // (where a node has multiple concurrent outgoing paths executing at once) are not supported.
  // Wait, what does concurrent/parallel execution mean? In LangGraph, if a node has multiple outgoing edges,
  // we check if they are concurrent. If a node has multiple unconditional outbound edges, or conditional edges,
  // but wait: "no node may have more than one unconditional outbound edge."
  // Let's verify rule 6: "No Ambiguous Routing: To prevent non-deterministic routing, no node may have more than one
  // unconditional outbound edge. Additionally, except for tool nodes with on_tool_result edges (which route dynamically
  // based on lastAgentId), no node may have multiple outbound edges with the same condition."

  for (const node of nodes) {
    const outbound = edges.filter((e) => e.from === node.id);
    const unconditional = outbound.filter((e) => !e.condition);
    if (unconditional.length > 1) {
      errors.push(
        `Node '${node.id}' has multiple unconditional outbound edges (ambiguous routing).`,
      );
    }

    if (node.type !== "tool") {
      const conditions = outbound.map((e) => e.condition).filter(Boolean);
      const conditionSet = new Set(conditions);
      if (conditionSet.size !== conditions.length) {
        errors.push(`Node '${node.id}' has duplicate outbound edge conditions.`);
      }
    }
  }

  // 4. Loop Exit Paths: Any loop/cycle in the graph must contain at least one conditional routing node
  // (such as a consensus_check node or an agent node with tool capabilities) that can branch out of the loop.
  // To detect this, let's identify cycles. We can trace simple cycles using DFS.
  // For each cycle, we check if at least one node in that cycle has a way to exit the cycle (i.e. has a conditional edge
  // leading to a node outside the cycle, or is a consensus_check/agent with tools).
  // Actually, a loop exit path must exist.
  // Let's write a cycle detection that gathers all cycles, and for each cycle, checks if there is a node that has a
  // conditional routing edge where the target of the conditional routing is NOT in the cycle or is a valid branch.
  // Let's implement a cycle-finding algorithm or a simpler DFS state check.
  // A cycle in a directed graph can be found with standard DFS back-edge detection.
  // Let's check for cycles and exit conditions.
  const pathStack: string[] = [];
  const visitedDFS = new Set<string>();
  const recStack = new Set<string>();
  const cycles: string[][] = [];

  function findCycles(nodeId: string) {
    visitedDFS.add(nodeId);
    recStack.add(nodeId);
    pathStack.push(nodeId);

    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visitedDFS.has(neighbor)) {
        findCycles(neighbor);
      } else if (recStack.has(neighbor)) {
        // Cycle detected
        const cycleStartIndex = pathStack.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          cycles.push(pathStack.slice(cycleStartIndex));
        }
      }
    }

    recStack.delete(nodeId);
    pathStack.pop();
  }

  if (entryNode) {
    findCycles(entryNode.id);
  }

  for (const cycle of cycles) {
    let hasExit = false;
    for (const cycleNodeId of cycle) {
      const node = nodes.find((n) => n.id === cycleNodeId);
      if (!node) continue;
      // Is it a consensus_check or an agent with tools?
      const isConsensusCheck = node.type === "consensus_check";
      const isAgentWithTools = node.type === "agent" && node.tools && node.tools.length > 0;

      // Let's check if there is an outbound edge from this node to a node outside the cycle
      const outbound = edges.filter((e) => e.from === cycleNodeId);
      const hasOutboundToOutside = outbound.some((e) => !cycle.includes(e.to));

      if ((isConsensusCheck || isAgentWithTools) && hasOutboundToOutside) {
        hasExit = true;
        break;
      }
    }
    if (!hasExit) {
      errors.push(
        `Cycle detected without a conditional exit node: ${cycle.join(" -> ")} -> ${cycle[0]}`,
      );
    }
  }

  // 7. Consensus Check Routing: For consensus_check nodes, there must be edges defined for both
  // on_consensus and on_no_consensus conditions, OR one conditional edge and one unconditional edge acting as default fallback.
  // 8. Routing Completeness: Any node with conditional outgoing edges must have outgoing paths covering all possible outcomes
  // (e.g. both on_consensus and on_no_consensus for consensus_check nodes; both on_tool_call and unconditional default fallback
  // for agent nodes), or a single default fallback unconditional edge.
  for (const node of nodes) {
    const outbound = edges.filter((e) => e.from === node.id);
    if (node.type === "consensus_check") {
      const hasOnConsensus = outbound.some((e) => e.condition === "on_consensus");
      const hasOnNoConsensus = outbound.some((e) => e.condition === "on_no_consensus");
      const hasUnconditional = outbound.some((e) => !e.condition);

      if (
        !(
          (hasOnConsensus && hasOnNoConsensus) ||
          (hasUnconditional && (hasOnConsensus || hasOnNoConsensus))
        )
      ) {
        errors.push(
          `Consensus check node '${node.id}' must have both 'on_consensus' and 'on_no_consensus' edges, or one conditional edge and an unconditional fallback edge.`,
        );
      }
    }

    if (node.type === "agent" && node.tools && node.tools.length > 0) {
      const hasOnToolCall = outbound.some((e) => e.condition === "on_tool_call");
      const hasUnconditional = outbound.some((e) => !e.condition);
      if (!hasOnToolCall) {
        errors.push(
          `Agent node '${node.id}' with tools must have an outbound edge with condition 'on_tool_call'.`,
        );
      }
      if (!hasUnconditional) {
        errors.push(
          `Agent node '${node.id}' with tools must have an unconditional fallback outbound edge.`,
        );
      }
    }
  }

  // 9. Agent-Tool Wiring: For any agent node that has tools configured, there must be an outbound edge from that agent
  // node with condition: "on_tool_call" to a tool node, and a corresponding inbound edge from that tool node back to
  // the agent node with condition: "on_tool_result".
  // 10. Tool Routing Back-Edges: For any tool node, there must be corresponding on_tool_result edges from the tool node
  // back to each agent node that can call it, matching their identifiers.
  const agentToolsMap = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.type === "agent" && node.tools && node.tools.length > 0) {
      agentToolsMap.set(node.id, node.tools);
    }
  }

  for (const agentId of agentToolsMap.keys()) {
    const outboundEdges = edges.filter((e) => e.from === agentId && e.condition === "on_tool_call");
    if (outboundEdges.length === 0) {
      // already caught by completeness, but let's be explicit
      continue;
    }
    for (const edge of outboundEdges) {
      const toolNode = nodes.find((n) => n.id === edge.to);
      if (!toolNode || toolNode.type !== "tool") {
        errors.push(
          `Agent '${agentId}' has 'on_tool_call' edge to node '${edge.to}' which is not a 'tool' node.`,
        );
        continue;
      }
      // Check for return edge: from toolNode back to agentId with condition on_tool_result
      const returnEdge = edges.find(
        (e) => e.from === toolNode.id && e.to === agentId && e.condition === "on_tool_result",
      );
      if (!returnEdge) {
        errors.push(
          `Missing return edge with condition 'on_tool_result' from tool node '${toolNode.id}' back to agent '${agentId}'.`,
        );
      }
    }
  }

  // Check for any tool node that it has on_tool_result edges back to the agents that can call it
  const toolNodes = nodes.filter((n) => n.type === "tool");
  for (const toolNode of toolNodes) {
    const inboundFromAgents = edges.filter(
      (e) => e.to === toolNode.id && e.condition === "on_tool_call",
    );
    for (const inbound of inboundFromAgents) {
      const agentId = inbound.from;
      const returnEdge = edges.find(
        (e) => e.from === toolNode.id && e.to === agentId && e.condition === "on_tool_result",
      );
      if (!returnEdge) {
        errors.push(
          `Tool node '${toolNode.id}' is called by agent '${agentId}' but lacks an 'on_tool_result' back-edge.`,
        );
      }
    }
  }

  return {
    success: errors.length === 0,
    errors,
  };
}
