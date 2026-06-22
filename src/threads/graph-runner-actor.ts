import { createMachine, assign } from "xstate";
import type { Message, Preset } from "../db/db-schema";

/**
 * Message Compiler Rules:
 * Compiles history for any given active agent node's LLM call using these rules:
 * 1. Identify the Active Agent: Identify the specific agent node making the LLM call.
 * 2. Assign Roles:
 *    - The active agent's own previous messages are kept as assistant role.
 *    - The active agent's own tool calls/results are kept in their native roles (assistant for tool calls, tool for results) and kept in sequence.
 *    - All other messages (actual user messages, historical system messages, other agents' messages, and other agents' tool calls/results) are mapped to the user role.
 * 3. On-the-fly Context Pruning: If the agent node specifies maxHistoryMessages, traverse the compiled messages backward from the latest message, keeping up to maxHistoryMessages messages.
 * 4. Pruning Boundary Adjustment: If the cutoff point falls within a tool call/response transaction, adjust the cutoff boundary backward to include the complete tool transaction. Never split a tool call and its corresponding tool result. Let the resulting list of pruned messages be H.
 * 5. Compile and Inject System Messages (Conflict Resolution & Merging Rules):
 *    - Schedule global and workflow system messages based on depth (D >= 0 is D, D < 0 is L + D, clamped to [0, L]).
 *    - Deduplicate identical contents: workflow-specific takes precedence.
 *    - If multiple distinct messages target the same index, merge them using "\n\n", workflow-specific first, then global, matching original order.
 *    - Perform insertion in descending order of target index.
 * 6. Assign Prefix and Format for Strict APIs:
 *    - For messages in H mapped to the user role that did not originate from the human user, prefix the content with the sender's name/identifier (e.g. [Agent Name]: ...).
 *    - For APIs that do not support arbitrary system role messages (like Gemini):
 *      - If system message is at index 0, merge it into systemInstruction parameter of LLM config (concatenated with "\n\n").
 *      - If system message is at index > 0, convert role to user and prefix content with [System Notification]: ...
 * 7. Merge Consecutive Messages of the Same Role:
 *    - Merge consecutive user messages, concatenating content with "\n\n".
 *    - Merge consecutive assistant messages from the active agent, combining text and populating tool_calls.
 */

export interface CompiledMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
  tool_calls?: unknown[];
}

export function compileMessages(
  messages: Message[],
  activeNode: {
    id: string;
    name: string;
    systemPrompt?: string;
    maxHistoryMessages?: number;
  },
  globalSystemMessages: Array<{ content: string; depth: number }> = [],
  workflowSystemMessages: Array<{ content: string; depth: number }> = [],
  provider: "openrouter" | "gemini" = "gemini",
): {
  compiledMessages: CompiledMessage[];
  systemInstruction?: string;
} {
  // 1. & 2. Assign Roles and Names
  let mapped: CompiledMessage[] = messages.map((m) => {
    // If it is from the active agent, keep as assistant
    if (m.name === activeNode.name && (m.role === "assistant" || m.role === "tool")) {
      return {
        role: m.role,
        content: m.content,
        name: m.name,
        toolCallId: m.toolCallId,
      };
    }
    // All other messages are mapped to user role
    return {
      role: "user",
      content: m.content,
      name: m.name,
      toolCallId: m.toolCallId,
    };
  });

  // 3. On-the-fly Context Pruning
  if (
    activeNode.maxHistoryMessages !== undefined &&
    activeNode.maxHistoryMessages < mapped.length
  ) {
    let cutoff = mapped.length - activeNode.maxHistoryMessages;

    // 4. Pruning Boundary Adjustment
    // Ensure we don't split a tool transaction.
    // If the cutoff splits a tool call and its result, shift cutoff backward to include the tool call.
    while (cutoff > 0) {
      const boundaryMsg = mapped[cutoff];
      const prevMsg = mapped[cutoff - 1];

      // If boundary is a tool result and prev is its tool call, or similar, don't split.
      // Better: if boundaryMsg is "tool", then we definitely need its preceding tool call ("assistant" role with toolCallId).
      if (
        boundaryMsg.role === "tool" &&
        prevMsg.role === "assistant" &&
        prevMsg.toolCallId === boundaryMsg.toolCallId
      ) {
        cutoff--;
      } else if (prevMsg.role === "assistant" && prevMsg.toolCallId && !boundaryMsg.toolCallId) {
        // Cutoff is right after a tool call but before its tool result? That's fine if the result is excluded,
        // but if the result is included (which it would be since it's at index cutoff or later), we must include the call too.
        // Wait, if boundaryMsg doesn't have toolCallId but some later message does, we need to be careful.
        // In practice, check if any included message (index >= cutoff) is a tool result whose corresponding tool call is excluded (index < cutoff).
        let hasOrphan = false;
        for (let i = cutoff; i < mapped.length; i++) {
          if (mapped[i].role === "tool" && mapped[i].toolCallId) {
            const callIdx = mapped.findIndex(
              (m, idx) =>
                idx < cutoff && m.role === "assistant" && m.toolCallId === mapped[i].toolCallId,
            );
            if (callIdx !== -1) {
              hasOrphan = true;
              break;
            }
          }
        }
        if (hasOrphan) {
          cutoff--;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    mapped = mapped.slice(cutoff);
  }

  const L = mapped.length;

  // 5. Compile and Inject System Messages (Conflict Resolution & Merging Rules)
  interface SystemSched {
    content: string;
    depth: number;
    isWorkflow: boolean;
    order: number;
  }

  const schedList: SystemSched[] = [];
  if (activeNode.systemPrompt) {
    // Treat activeNode.systemPrompt as a workflow-specific system message at depth 0
    schedList.push({ content: activeNode.systemPrompt, depth: 0, isWorkflow: true, order: -1 });
  }

  workflowSystemMessages.forEach((msg, idx) => {
    schedList.push({ content: msg.content, depth: msg.depth, isWorkflow: true, order: idx });
  });

  globalSystemMessages.forEach((msg, idx) => {
    schedList.push({ content: msg.content, depth: msg.depth, isWorkflow: false, order: idx });
  });

  // Calculate absolute target index and resolve duplicates
  interface ResolvedSystemMessage {
    content: string;
    targetIndex: number;
    isWorkflow: boolean;
    order: number;
  }

  const resolved: ResolvedSystemMessage[] = schedList.map((s) => {
    let targetIndex = s.depth;
    if (s.depth < 0) {
      targetIndex = L + s.depth;
    }
    targetIndex = Math.max(0, Math.min(L, targetIndex));
    return {
      content: s.content,
      targetIndex,
      isWorkflow: s.isWorkflow,
      order: s.order,
    };
  });

  // Deduplicate: If two system messages have identical content:
  // - Workflow-specific system message takes precedence over global.
  // - If both are same type, keep the one configured with the shallower insertion depth (yielding the smaller target index).
  const uniqueResolved: ResolvedSystemMessage[] = [];
  for (const item of resolved) {
    const duplicateIdx = uniqueResolved.findIndex((r) => r.content === item.content);
    if (duplicateIdx === -1) {
      uniqueResolved.push(item);
    } else {
      const existing = uniqueResolved[duplicateIdx];
      let replace = false;
      if (item.isWorkflow && !existing.isWorkflow) {
        replace = true;
      } else if (item.isWorkflow === existing.isWorkflow) {
        if (item.targetIndex < existing.targetIndex) {
          replace = true;
        }
      }
      if (replace) {
        uniqueResolved[duplicateIdx] = item;
      }
    }
  }

  // Group by target index
  const groups: Record<number, ResolvedSystemMessage[]> = {};
  for (const item of uniqueResolved) {
    if (!groups[item.targetIndex]) {
      groups[item.targetIndex] = [];
    }
    groups[item.targetIndex].push(item);
  }

  // Sort groups and merge at same index
  const mergedInsertions: Array<{ targetIndex: number; content: string }> = [];
  for (const targetIdxStr of Object.keys(groups)) {
    const targetIndex = Number(targetIdxStr);
    const list = groups[targetIndex];

    // Order by source precedence: workflow-specific first, then global. Original order inside.
    list.sort((a, b) => {
      if (a.isWorkflow !== b.isWorkflow) {
        return a.isWorkflow ? -1 : 1;
      }
      return a.order - b.order;
    });

    const mergedContent = list.map((item) => item.content).join("\n\n");
    mergedInsertions.push({ targetIndex, content: mergedContent });
  }

  // Sort insertions descending to insert from end to start without index shifting
  mergedInsertions.sort((a, b) => b.targetIndex - a.targetIndex);

  let finalHistory = [...mapped];
  for (const ins of mergedInsertions) {
    finalHistory.splice(ins.targetIndex, 0, {
      role: "system",
      content: ins.content,
    });
  }

  // 6. Assign Prefix and Format for Strict APIs
  // For Gemini API (no arbitrary system role in contents, single systemInstruction)
  let systemInstruction: string | undefined;

  if (provider === "gemini") {
    // If system message is at index 0, extract it as systemInstruction.
    // If multiple system messages end up prefixing, combine them.
    const sysAtStart: string[] = [];
    while (finalHistory.length > 0 && finalHistory[0].role === "system") {
      sysAtStart.push(finalHistory.shift()!.content);
    }
    if (sysAtStart.length > 0) {
      systemInstruction = sysAtStart.join("\n\n");
    }

    // Convert any remaining system messages (at index > 0) to user role and prefix
    finalHistory = finalHistory.map((m) => {
      if (m.role === "system") {
        return {
          role: "user",
          content: `[System Notification]: ${m.content}`,
        };
      }
      return m;
    });
  }

  // Prefix non-user origin messages in user role with sender name
  finalHistory = finalHistory.map((m) => {
    if (m.role === "user" && m.name && m.name !== "User" && m.name !== "Human") {
      return {
        ...m,
        content: `[${m.name}]: ${m.content}`,
      };
    }
    return m;
  });

  // 7. Merge Consecutive Messages of the Same Role
  const mergedHistory: CompiledMessage[] = [];
  for (const msg of finalHistory) {
    if (mergedHistory.length === 0) {
      mergedHistory.push(msg);
      continue;
    }

    const prev = mergedHistory[mergedHistory.length - 1];
    if (prev.role === msg.role) {
      // Merge consecutive user messages
      if (msg.role === "user") {
        prev.content = `${prev.content}\n\n${msg.content}`;
      } else if (msg.role === "assistant") {
        // Merge consecutive assistant messages (text or tool calls)
        prev.content = prev.content ? `${prev.content}\n\n${msg.content}` : msg.content;
        if (msg.tool_calls) {
          prev.tool_calls = [...(prev.tool_calls || []), ...msg.tool_calls];
        }
      } else {
        // For system (if not gemini) or tool, just append or keep separate.
        // Standard APIs alternating user/assistant.
        mergedHistory.push(msg);
      }
    } else {
      mergedHistory.push(msg);
    }
  }

  return {
    compiledMessages: mergedHistory,
    systemInstruction,
  };
}

export interface GraphRunnerContext {
  threadId: string;
  workflowSnapshot: unknown;
  presetConfig: Preset | null;
  abortController: AbortController | null;
  currentStepIndex: number;
  stepsInCurrentRun: number;
  tokensInCurrentRun: number;
  budgetOverride: { maxStepsWithoutUser: number; maxTokensPerRun: number | null } | null;
  errorMessage: string | null;
  currentStreamingText: string;
}

export type GraphRunnerEvent =
  | { type: "START" }
  | { type: "RECEIVE_TOKEN"; token: string; reasoning: string; delta: string }
  | {
      type: "STEP_COMPLETE";
      message: unknown;
      checkpointId: string;
      usage?: { promptTokens: number; completionTokens: number };
    }
  | { type: "PAUSE" }
  | { type: "STOP" }
  | { type: "TIMEOUT" }
  | { type: "INTERRUPT"; interruptDetails: unknown }
  | { type: "SUBMIT_TOOL_RESPONSE"; toolResponse: unknown }
  | { type: "RESUME_WITH_BUDGET_OVERRIDE"; stepOverride: number; tokenOverride: number | null }
  | { type: "COMPLETE" }
  | { type: "ERROR"; errorDetails: string };

export const graphRunnerMachine = createMachine(
  {
    types: {} as {
      context: GraphRunnerContext;
      events: GraphRunnerEvent;
    },
    id: "graphRunner",
    initial: "initializing",
    context: {
      threadId: "",
      workflowSnapshot: null,
      presetConfig: null,
      abortController: null,
      currentStepIndex: 0,
      stepsInCurrentRun: 0,
      tokensInCurrentRun: 0,
      budgetOverride: null,
      errorMessage: null,
      currentStreamingText: "",
    },
    states: {
      initializing: {
        on: {
          START: "running",
          ERROR: {
            target: "failed",
            actions: assign({
              errorMessage: ({ event }) => event.errorDetails,
            }),
          },
        },
      },
      running: {
        initial: "requesting",
        states: {
          requesting: {
            on: {
              RECEIVE_TOKEN: "streaming",
              STEP_COMPLETE: {
                target: "#graphRunner.evaluatingStep",
                actions: assign({
                  stepsInCurrentRun: ({ context }) => context.stepsInCurrentRun + 1,
                  tokensInCurrentRun: ({ context, event }) => {
                    if (event.type === "STEP_COMPLETE" && event.usage) {
                      return (
                        context.tokensInCurrentRun +
                        event.usage.promptTokens +
                        event.usage.completionTokens
                      );
                    }
                    return context.tokensInCurrentRun;
                  },
                }),
              },
              INTERRUPT: "#graphRunner.interrupted",
              ERROR: "#graphRunner.failed",
            },
          },
          streaming: {
            on: {
              RECEIVE_TOKEN: {
                actions: assign({
                  currentStreamingText: ({ context, event }) =>
                    context.currentStreamingText + event.delta,
                }),
              },
              STEP_COMPLETE: {
                target: "#graphRunner.evaluatingStep",
                actions: assign({
                  stepsInCurrentRun: ({ context }) => context.stepsInCurrentRun + 1,
                  tokensInCurrentRun: ({ context, event }) => {
                    if (event.type === "STEP_COMPLETE" && event.usage) {
                      return (
                        context.tokensInCurrentRun +
                        event.usage.promptTokens +
                        event.usage.completionTokens
                      );
                    }
                    return context.tokensInCurrentRun;
                  },
                }),
              },
              INTERRUPT: "#graphRunner.interrupted",
              ERROR: "#graphRunner.failed",
            },
          },
        },
        on: {
          PAUSE: "paused",
          TIMEOUT: "failed",
        },
      },
      evaluatingStep: {
        always: [
          {
            guard: "isBudgetExceeded",
            target: "interrupted.budgetExceeded",
          },
          {
            target: "running",
          },
        ],
      },
      paused: {
        on: {
          START: "running",
        },
      },
      interrupted: {
        initial: "awaitingToolInput",
        states: {
          awaitingToolInput: {
            on: {
              SUBMIT_TOOL_RESPONSE: {
                target: "#graphRunner.running.requesting",
                actions: assign({
                  stepsInCurrentRun: () => 0,
                  tokensInCurrentRun: () => 0,
                  budgetOverride: () => null,
                }),
              },
            },
          },
          awaitingApproval: {
            on: {
              SUBMIT_TOOL_RESPONSE: {
                target: "#graphRunner.running.requesting",
                actions: assign({
                  stepsInCurrentRun: () => 0,
                  tokensInCurrentRun: () => 0,
                  budgetOverride: () => null,
                }),
              },
            },
          },
          budgetExceeded: {
            on: {
              RESUME_WITH_BUDGET_OVERRIDE: {
                target: "#graphRunner.running.requesting",
                actions: assign({
                  stepsInCurrentRun: () => 0,
                  tokensInCurrentRun: () => 0,
                  budgetOverride: ({ event }) => ({
                    maxStepsWithoutUser: event.stepOverride,
                    maxTokensPerRun: event.tokenOverride,
                  }),
                }),
              },
            },
          },
        },
        on: {
          STOP: "completed",
        },
      },
      completed: {
        type: "final",
      },
      failed: {
        on: {
          START: {
            target: "initializing",
            actions: assign({
              errorMessage: () => null,
            }),
          },
        },
      },
    },
  },
  {
    guards: {
      isBudgetExceeded: ({ context }) => {
        const budget = context.budgetOverride || context.presetConfig?.budgetPolicy;
        if (!budget) return false;
        const stepLimit = budget.maxStepsWithoutUser;
        const tokenLimit = budget.maxTokensPerRun;

        if (context.stepsInCurrentRun >= stepLimit) {
          return true;
        }
        if (tokenLimit !== null && context.tokensInCurrentRun >= tokenLimit) {
          return true;
        }
        return false;
      },
    },
  },
);
