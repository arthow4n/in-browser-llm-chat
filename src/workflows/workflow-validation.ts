import type { Workflow, WorkflowNode, WorkflowEdge } from "../db/db-schema";

/**
 * Validates the structure of a custom workflow according to the validation rules.
 * Throws a list of error messages (as string[]) or a single Error if validation fails.
 */
export function validateWorkflowStructure(workflow: Workflow): string[] {
  const errors: string[] = [];
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];

  const nodeMap = new Map<string, WorkflowNode>();
  for (const node of nodes) {
    if (nodeMap.has(node.id)) {
      errors.push(`Duplicate node ID: "${node.id}"`);
    }
    nodeMap.set(node.id, node);
  }

  // 2. Edge Validity: The source and target properties of every edge must reference existing node IDs.
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!nodeMap.has(edge.source)) {
      errors.push(`Edge at index ${i} has invalid source ID: "${edge.source}"`);
    }
    if (!nodeMap.has(edge.target)) {
      errors.push(`Edge at index ${i} has invalid target ID: "${edge.target}"`);
    }
  }

  if (nodes.length === 0) {
    errors.push("Workflow must contain at least one node.");
    return errors;
  }

  // Build graph representations for connectivity and routing analysis.
  const adjacencyList = new Map<string, string[]>();
  const incomingEdges = new Map<string, string[]>();
  const nodeOutEdges = new Map<string, WorkflowEdge[]>();

  for (const node of nodes) {
    adjacencyList.set(node.id, []);
    incomingEdges.set(node.id, []);
    nodeOutEdges.set(node.id, []);
  }

  for (const edge of edges) {
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      adjacencyList.get(edge.source)!.push(edge.target);
      incomingEdges.get(edge.target)!.push(edge.source);
      nodeOutEdges.get(edge.source)!.push(edge);
    }
  }

  let entryNodes = nodes.filter((n) => n.type === "input");
  if (entryNodes.length === 0) {
    entryNodes = nodes.filter((n) => (incomingEdges.get(n.id) || []).length === 0);
  }

  if (entryNodes.length === 0) {
    errors.push(
      "Workflow must have at least one entry point node (input node or node with no incoming edges).",
    );
  } else if (entryNodes.length > 1) {
    errors.push(
      `Workflow must have exactly one entry point node. Found multiple: ${entryNodes.map((n) => `"${n.id}"`).join(", ")}`,
    );
  }

  const entryNode = entryNodes.length === 1 ? entryNodes[0] : null;

  // 1. Connectivity: Every node (except the entry node) must have at least one incoming path from the entry node, and no isolated nodes.
  if (entryNode) {
    const visited = new Set<string>();
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

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        errors.push(`Node "${node.id}" is unreachable from the entry node "${entryNode.id}".`);
      }
    }
  }

  // 5. Topology Restrictions: Restriction to sequential and conditional execution DAGs. Parallel execution branches (where a node has multiple concurrent outgoing paths executing at once) are not supported.
  // We interpret this as: a node cannot route execution concurrently. No parallel/fork execution. Our runner executes step-by-step.
  // 6. No Ambiguous Routing: To prevent non-deterministic routing, no node may have more than one unconditional outbound edge.
  // Additionally, except for tool nodes with on_tool_result edges (which route dynamically based on lastAgentId), no node may have multiple outbound edges with the same condition.
  for (const node of nodes) {
    const outEdges = nodeOutEdges.get(node.id) || [];
    const unconditionalEdges = outEdges.filter((e) => !e.condition);
    if (unconditionalEdges.length > 1) {
      errors.push(`Node "${node.id}" has more than one unconditional outbound edge.`);
    }

    if (node.type !== "tool") {
      const conditions = outEdges.map((e) => e.condition).filter(Boolean);
      const uniqueConditions = new Set(conditions);
      if (uniqueConditions.size !== conditions.length) {
        errors.push(`Node "${node.id}" has multiple outbound edges with the same condition.`);
      }
    }
  }

  // 7. Consensus Check Routing: For consensus_check nodes, there must be edges defined for both on_consensus and on_no_consensus conditions, OR one conditional edge and one unconditional edge acting as the default fallback.
  // 8. Routing Completeness: Any node with conditional outgoing edges must have outgoing paths covering all possible outcomes, or a single default fallback unconditional edge.
  for (const node of nodes) {
    if (node.type === "consensus_check") {
      const outEdges = nodeOutEdges.get(node.id) || [];
      const hasOnConsensus = outEdges.some((e) => e.condition === "on_consensus");
      const hasOnNoConsensus = outEdges.some((e) => e.condition === "on_no_consensus");
      const hasUnconditional = outEdges.some((e) => !e.condition);

      const isValid =
        (hasOnConsensus && hasOnNoConsensus) ||
        (hasOnConsensus && hasUnconditional) ||
        (hasOnNoConsensus && hasUnconditional) ||
        hasUnconditional;
      if (!isValid) {
        errors.push(
          `Consensus check node "${node.id}" must have edges for both "on_consensus" and "on_no_consensus", or at least one of them with an unconditional fallback edge.`,
        );
      }
    }
  }

  // 9. Agent-Tool Wiring: For any agent node that has tools configured, there must be an outbound edge from that agent node with condition: "on_tool_call" to a tool node, and a corresponding inbound edge from that tool node back to the agent node with condition: "on_tool_result".
  for (const node of nodes) {
    if (node.type === "agent" && node.tools && node.tools.length > 0) {
      const outEdges = nodeOutEdges.get(node.id) || [];
      const toolCallEdge = outEdges.find((e) => e.condition === "on_tool_call");
      if (!toolCallEdge) {
        errors.push(
          `Agent node "${node.id}" has tools configured but lacks an outbound edge with condition "on_tool_call".`,
        );
      } else {
        const targetToolNode = nodeMap.get(toolCallEdge.target);
        if (!targetToolNode || targetToolNode.type !== "tool") {
          errors.push(
            `Agent node "${node.id}" has an "on_tool_call" edge pointing to a non-tool node "${toolCallEdge.target}".`,
          );
        } else {
          // Check inbound edge from the target tool node back to this agent with condition "on_tool_result"
          const toolOutEdges = nodeOutEdges.get(targetToolNode.id) || [];
          const backEdge = toolOutEdges.find(
            (e) => e.target === node.id && e.condition === "on_tool_result",
          );
          if (!backEdge) {
            errors.push(
              `Tool node "${targetToolNode.id}" lacks an "on_tool_result" back-edge to calling agent node "${node.id}".`,
            );
          }
        }
      }
    }
  }

  // 10. Tool Routing Back-Edges: For any tool node, there must be corresponding on_tool_result edges from the tool node back to each agent node that can call it, matching their identifiers.
  for (const node of nodes) {
    if (node.type === "tool") {
      const outEdges = nodeOutEdges.get(node.id) || [];
      // Let's find all agent nodes that have this tool in their tools array and route to this tool node.
      const callingAgents = nodes.filter((n) => {
        if (n.type !== "agent" || !n.tools || n.tools.length === 0) return false;
        const agentOutEdges = nodeOutEdges.get(n.id) || [];
        return agentOutEdges.some((e) => e.target === node.id && e.condition === "on_tool_call");
      });

      for (const agent of callingAgents) {
        const backEdge = outEdges.find(
          (e) => e.target === agent.id && e.condition === "on_tool_result",
        );
        if (!backEdge) {
          errors.push(
            `Tool node "${node.id}" lacks an "on_tool_result" back-edge to calling agent "${agent.id}".`,
          );
        }
      }
    }
  }

  // 4. Loop Exit Paths: Any loop/cycle in the graph must contain at least one conditional routing node (such as a consensus_check node or an agent node with tool capabilities) that can branch out of the loop.
  // We can find all cycles in the graph and verify that each cycle contains at least one exit node.
  // Let's use simple cycle detection and collect all cycles or path cycles. Since graph is small, we can do DFS path traversal.
  const path: string[] = [];
  const cycles: string[][] = [];

  function dfsCycles(current: string) {
    const idx = path.indexOf(current);
    if (idx !== -1) {
      // Cycle found
      cycles.push(path.slice(idx));
      return;
    }
    path.push(current);
    const neighbors = adjacencyList.get(current) || [];
    for (const neighbor of neighbors) {
      // To avoid listing permutations of the exact same cycle path recursively,
      // we perform simple cycle collection.
      dfsCycles(neighbor);
    }
    path.pop();
  }

  if (entryNode) {
    dfsCycles(entryNode.id);
  }

  // Check exit capabilities for each unique cycle
  for (const cycle of cycles) {
    let hasExit = false;
    for (const nodeId of cycle) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      // An exit capability node is:
      // - A consensus_check node
      // - An agent node with tools (so it can route to tool vs default)
      // Wait, is there any other conditional routing node? Yes, any node that has an outbound edge leading outside of the cycle.
      // But more specifically, does it have conditional logic that allows exit?
      // "Any loop/cycle in the graph must contain at least one conditional routing node (such as a consensus_check node or an agent node with tool capabilities) that can branch out of the loop"
      if (node.type === "consensus_check") {
        hasExit = true;
        break;
      }
      if (node.type === "agent" && node.tools && node.tools.length > 0) {
        hasExit = true;
        break;
      }
    }

    if (!hasExit) {
      errors.push(
        `Loop detected without any loop exit capabilities (e.g. consensus_check or agent with tools) in cycle: ${cycle.map((id) => `"${id}"`).join(" -> ")} -> "${cycle[0]}".`,
      );
    }
  }

  return errors;
}
