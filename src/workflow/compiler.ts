import { StateGraph, Annotation, END, START, interrupt } from "@langchain/langgraph";
import type { WorkflowNode, WorkflowEdge } from "./schemas.js";

export const GraphStateAnnotation = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (x, y) => {
      const merged = [...x];
      for (const msg of y) {
        if (!msg.id) {
          merged.push(msg);
          continue;
        }
        const idx = merged.findIndex((m) => m.id === msg.id);
        if (idx !== -1) {
          merged[idx] = { ...merged[idx], ...msg };
        } else {
          merged.push(msg);
        }
      }
      return merged;
    },
    default: () => [],
  }),
  lastAgentId: Annotation<string | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),
  consensusReached: Annotation<boolean>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => false,
  }),
  forceSummarize: Annotation<boolean>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => false,
  }),
  turnCount: Annotation<number>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => 0,
  }),
  currentRound: Annotation<number>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => 1,
  }),
});

export type GraphStateType = typeof GraphStateAnnotation.State;

export interface CompilationContext {
  callLLM: (
    presetId: string | undefined,
    systemPrompt: string,
    messages: any[],
    tools?: string[],
  ) => Promise<{
    content: string;
    tool_calls?: Array<{ id: string; name: string; args: any }>;
  }>;
  warn?: (message: string) => void;
}

function resolvePrompt(systemPrompt: string | undefined, messages: any[]): string {
  if (!systemPrompt) return "";
  const firstUserMsg = messages.find((m) => m.role === "user")?.content || "";
  return systemPrompt
    .replace(/\{\{user_input\}\}/g, firstUserMsg)
    .replace(/\{\{topic\}\}/g, firstUserMsg);
}

export function compileWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  context: CompilationContext,
): StateGraph<any, any, any, any> {
  const graph = new StateGraph<any, any, any, any>(GraphStateAnnotation);

  // Find preceding node from outside for each loopHeader node
  // This is used to determine when to increment currentRound
  const loopHeaderPrecedingNodeMap = new Map<string, string>();
  for (const node of nodes) {
    if (node.loopHeader) {
      // Find incoming edge from a node that is NOT in the loop cycle.
      // Since it's simpler, let's find the edge whose source node does not have an incoming path from this node.
      const incomingEdges = edges.filter((e) => e.to === node.id);
      if (incomingEdges.length > 0) {
        // If there's only one, or we filter for the one that has no path back
        // For now, let's pick the one that is not from the loop check node.
        // Usually, the loop comes from consensus_check. So the edge from outside is from a node like Initiator or input.
        const outsideEdge =
          incomingEdges.find((e) => {
            const fromNode = nodes.find((n) => n.id === e.from);
            return fromNode && fromNode.type !== "consensus_check" && fromNode.type !== "agent";
          }) || incomingEdges[0];
        loopHeaderPrecedingNodeMap.set(node.id, outsideEdge.from);
      }
    }
  }

  // Define node execution functions
  for (const node of nodes) {
    if (node.type === "agent") {
      graph.addNode(node.id, async (state: GraphStateType) => {
        let currentRound = state.currentRound;
        if (node.loopHeader) {
          const precedingId = loopHeaderPrecedingNodeMap.get(node.id);
          if (state.lastAgentId && state.lastAgentId !== precedingId) {
            currentRound += 1;
          }
        }

        const resolvedPrompt = resolvePrompt(node.systemPrompt, state.messages);

        // Exclude tools before round if specified
        let activeTools = node.tools || [];
        if (node.excludeToolsBeforeRound) {
          activeTools = activeTools.filter((t) => {
            const minRound = node.excludeToolsBeforeRound?.[t];
            return minRound === undefined || currentRound >= minRound;
          });
        }

        const llmResult = await context.callLLM(
          node.presetId,
          resolvedPrompt,
          state.messages,
          activeTools,
        );

        const newMsg = {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: llmResult.content,
          name: node.name,
          type:
            llmResult.tool_calls && llmResult.tool_calls.length > 0
              ? ("tool_call" as const)
              : ("text" as const),
          createdAt: Date.now(),
          metadata: {
            tool_calls: llmResult.tool_calls,
          },
        };

        return {
          messages: [newMsg],
          lastAgentId: node.id,
          turnCount: state.turnCount + 1,
          currentRound,
        };
      });
    } else if (node.type === "input") {
      graph.addNode(node.id, async (state: GraphStateType) => {
        const userInput = interrupt({
          type: "input",
          nodeId: node.id,
        });

        const content =
          typeof userInput === "string" ? userInput : (userInput as any)?.content || "";
        const newMsg = {
          id: crypto.randomUUID(),
          role: "user" as const,
          content,
          createdAt: Date.now(),
          type: "text" as const,
        };

        return {
          messages: [newMsg],
          turnCount: state.turnCount + 1,
        };
      });
    } else if (node.type === "tool") {
      graph.addNode(node.id, async (state: GraphStateType) => {
        const lastMsg = state.messages[state.messages.length - 1];
        const toolCalls = lastMsg?.metadata?.tool_calls || [];
        const newMessages: any[] = [];
        let updatedConsensus = state.consensusReached;

        for (const tc of toolCalls) {
          if (tc.name === "declare_consensus") {
            updatedConsensus = true;
            newMessages.push({
              id: crypto.randomUUID(),
              role: "tool" as const,
              content: JSON.stringify({ success: true, message: "Consensus declared." }),
              name: "declare_consensus",
              toolCallId: tc.id,
              type: "tool_result" as const,
              createdAt: Date.now(),
            });
          } else {
            // Interactive tool: interrupt to get response
            const response = interrupt({
              type: "tool",
              toolCall: tc,
            });

            const content = typeof response === "string" ? response : JSON.stringify(response);
            newMessages.push({
              id: crypto.randomUUID(),
              role: "tool" as const,
              content,
              name: tc.name,
              toolCallId: tc.id,
              type: "tool_result" as const,
              createdAt: Date.now(),
            });
          }
        }

        return {
          messages: newMessages,
          consensusReached: updatedConsensus,
          turnCount: state.turnCount + 1,
        };
      });
    } else if (node.type === "consensus_check") {
      graph.addNode(node.id, async (state: GraphStateType) => {
        let consensusReached = state.consensusReached;

        if (node.systemPrompt) {
          const resolvedPrompt = resolvePrompt(node.systemPrompt, state.messages);
          try {
            const llmResult = await context.callLLM(node.presetId, resolvedPrompt, state.messages);
            const parsed = JSON.parse(llmResult.content);
            if (typeof parsed.consensusReached === "boolean") {
              consensusReached = parsed.consensusReached;
            } else {
              if (context.warn) {
                context.warn("Consensus check LLM output missing 'consensusReached' boolean.");
              }
              consensusReached = false;
            }
          } catch (e: any) {
            if (context.warn) {
              context.warn(`Consensus check JSON parsing failed: ${e.message}`);
            }
            consensusReached = false;
          }
        }

        return {
          consensusReached,
          turnCount: state.turnCount + 1,
        };
      });
    } else if (node.type === "summary") {
      graph.addNode(node.id, async (state: GraphStateType) => {
        const resolvedPrompt = resolvePrompt(node.systemPrompt, state.messages);
        const llmResult = await context.callLLM(node.presetId, resolvedPrompt, state.messages);

        const newMsg = {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: llmResult.content,
          name: node.name,
          type: "text" as const,
          createdAt: Date.now(),
        };

        return {
          messages: [newMsg],
          turnCount: state.turnCount + 1,
        };
      });
    }
  }

  // Set Entry Point
  // Find the unique entry node
  const nodesWithIncomingEdges = new Set<string>();
  for (const edge of edges) {
    nodesWithIncomingEdges.add(edge.to);
  }
  const entryNode = nodes.find((n) => n.type === "input" || !nodesWithIncomingEdges.has(n.id));
  if (entryNode) {
    graph.addEdge(START, entryNode.id);
  }

  // Add Edges
  // For routing, we need conditional routing functions or direct edges
  for (const node of nodes) {
    const outboundEdges = edges.filter((e) => e.from === node.id);
    const unconditionalEdge = outboundEdges.find((e) => !e.condition);
    const conditionalEdges = outboundEdges.filter((e) => e.condition);

    if (conditionalEdges.length > 0) {
      // Compile conditional edges using a router function
      if (node.type === "agent") {
        const toolCallEdge = conditionalEdges.find((e) => e.condition === "on_tool_call");
        const fallbackTarget = unconditionalEdge ? unconditionalEdge.to : END;

        graph.addConditionalEdges(
          node.id,
          (state: GraphStateType) => {
            const lastMsg = state.messages[state.messages.length - 1];
            const hasToolCalls =
              lastMsg?.metadata?.tool_calls && lastMsg.metadata.tool_calls.length > 0;
            if (hasToolCalls && toolCallEdge) {
              return "on_tool_call";
            }
            return "fallback";
          },
          {
            on_tool_call: toolCallEdge ? toolCallEdge.to : fallbackTarget,
            fallback: fallbackTarget,
          },
        );
      } else if (node.type === "tool") {
        // Tool routing back-edges: route back to state.lastAgentId
        // In the routing map, map each agent's node ID to itself
        const pathMap: Record<string, string> = {};
        for (const edge of conditionalEdges) {
          if (edge.condition === "on_tool_result") {
            pathMap[edge.to] = edge.to;
          }
        }
        const fallbackTarget = unconditionalEdge ? unconditionalEdge.to : END;

        graph.addConditionalEdges(
          node.id,
          (state: GraphStateType) => {
            if (state.lastAgentId && pathMap[state.lastAgentId]) {
              return state.lastAgentId;
            }
            return "fallback";
          },
          {
            ...pathMap,
            fallback: fallbackTarget,
          },
        );
      } else if (node.type === "consensus_check") {
        const onConsensusEdge = conditionalEdges.find((e) => e.condition === "on_consensus");
        const onNoConsensusEdge = conditionalEdges.find((e) => e.condition === "on_no_consensus");
        const maxLoopLimit = node.maxLoopLimit ?? 5;

        const pathMap: Record<string, string> = {};
        if (onConsensusEdge) pathMap.on_consensus = onConsensusEdge.to;
        if (onNoConsensusEdge) pathMap.on_no_consensus = onNoConsensusEdge.to;
        if (unconditionalEdge) pathMap.fallback = unconditionalEdge.to;

        graph.addConditionalEdges(
          node.id,
          (state: GraphStateType) => {
            const shouldTerminate =
              state.consensusReached || state.forceSummarize || state.currentRound >= maxLoopLimit;

            if (shouldTerminate && onConsensusEdge) {
              return "on_consensus";
            }
            if (!shouldTerminate && onNoConsensusEdge) {
              return "on_no_consensus";
            }
            return "fallback";
          },
          pathMap,
        );
      }
    } else if (unconditionalEdge) {
      graph.addEdge(node.id, unconditionalEdge.to);
    } else {
      graph.addEdge(node.id, END);
    }
  }

  return graph;
}
