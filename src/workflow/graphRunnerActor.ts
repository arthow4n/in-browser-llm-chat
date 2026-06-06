import { assign, createMachine, fromPromise, sendTo, type ErrorActorEvent } from "xstate";
import { type MessageStore } from "../db/db";
import { GoogleGenAI } from "@google/genai";
import { OpenRouter } from "@openrouter/sdk";
import {
  getPreset,
  getSetting,
  saveMessage,
  getThread,
  saveThread,
  getMessagesForThread,
  type PresetStore,
  type WorkflowStore,
} from "../db/db.js";
import { IndexedDBSaver } from "../db/checkpointer.js";
import { compileWorkflow, type GraphStateType } from "./compiler.js";
import { Command } from "@langchain/langgraph";
import { type GraphMessage, type CompiledPayloadMessage, type RunnerInterrupt } from "./types.js";

// Types
export interface RunnerInput {
  threadId: string;
  llmProvider?: (params: {
    presetId: string | undefined;
    systemPrompt: string;
    messages: GraphMessage[];
    tools?: string[];
  }) => Promise<{
    content: string;
    tool_calls?: Array<{ id: string; name: string; args: unknown }>;
  }>;
}

export interface RunnerContext {
  threadId: string;
  workflowSnapshot: WorkflowStore | null;
  presetConfig: PresetStore | null;
  apiKeyConfig: { openRouter?: string; gemini?: string };
  stepsInCurrentRun: number;
  tokensInCurrentRun: number;
  budgetOverride: { maxStepsWithoutUser: number | null; maxTokensPerRun: number | null } | null;
  textBuffer: string;
  reasoningBuffer: string;
  currentStepIndex: number;
  errorMessage: string | null;
  abortController: AbortController | null;
  activeInterrupt: RunnerInterrupt | null;
  compiledGraph: unknown;
  accumulatedTokensThisStep: { promptTokens: number; completionTokens: number };
  lastEmitTime: number;
  toolResponse?: unknown;
  llmProvider?: RunnerInput["llmProvider"];
}

export type RunnerEvent =
  | { type: "START" }
  | { type: "PAUSE" }
  | { type: "STOP" }
  | { type: "SUBMIT_TOOL_RESPONSE"; response: unknown }
  | { type: "RESUME_WITH_BUDGET_OVERRIDE"; stepOverride?: number; tokenOverride?: number | null }
  | { type: "RETRY_STEP" }
  | { type: "CHANGE_PRESET_AND_RESUME"; presetId: string }
  | { type: "RESET_TO_CHECKPOINT"; checkpointId: string }
  | { type: "STEP_COMPLETE"; steps: number; tokens: number }
  | { type: "RECEIVE_TOKEN"; token: string; reasoning: string; delta: string }
  | { type: "UPDATE_UI_STATE"; state: string }
  | { type: "INTERRUPTED"; details: unknown };

// Cast-free helper functions for safe type access
function getEventErrorMessage(event: ErrorActorEvent): string | undefined {
  const error = event?.error;
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return error ? JSON.stringify(error) : undefined;
}

interface OpenRouterUsageInternal {
  prompt_tokens?: number;
  completion_tokens?: number;
}

function getChunkUsage(chunk: unknown): OpenRouterUsageInternal | undefined {
  return (chunk as Record<string, unknown>)?.usage as OpenRouterUsageInternal | undefined;
}

function getMessages(out: Partial<GraphStateType>): GraphMessage[] | undefined {
  if (out && typeof out === "object" && "messages" in out && Array.isArray(out.messages)) {
    return out.messages;
  }
  return undefined;
}

function getInterruptType(activeInterrupt: RunnerInterrupt | null | undefined): string | undefined {
  return activeInterrupt?.type;
}

function getEventInterrupt(event: { output?: { interrupt?: unknown } }): unknown {
  return event?.output?.interrupt;
}

type ChatMessages =
  | { role: "system"; content: string; name?: string }
  | { role: "user"; content: string; name?: string }
  | { role: "assistant"; content: string; name?: string; tool_calls?: unknown[] }
  | { role: "tool"; content: string; toolCallId: string };

function toOpenRouterMessage(msg: CompiledPayloadMessage): ChatMessages {
  return {
    role: msg.role,
    content: msg.content,
    name: msg.name,
    tool_calls: msg.tool_calls,
    toolCallId: msg.tool_call_id,
  } as ChatMessages;
}

// Helper to resolve system prompt placeholders

function resolvePrompt(
  systemPrompt: string | undefined,
  messages: Array<{ role?: string; content?: string }>,
): string {
  if (!systemPrompt) return "";
  const firstUserMsg = messages.find((m) => m.role === "user")?.content || "";
  return systemPrompt
    .replace(/\{\{user_input\}\}/g, firstUserMsg)
    .replace(/\{\{topic\}\}/g, firstUserMsg);
}

// Pruning helper following strict boundaries
export function pruneHistory<
  T extends { role?: string; type?: string; metadata?: { tool_calls?: unknown[] } },
>(messages: T[], maxHistoryMessages?: number): T[] {
  if (!maxHistoryMessages || maxHistoryMessages <= 0 || messages.length <= maxHistoryMessages) {
    return messages;
  }

  let cutoff = messages.length - maxHistoryMessages;
  if (cutoff <= 0) return messages;

  // Adjust boundary: never split a tool call and its result
  while (cutoff > 0) {
    const msg = messages[cutoff];
    const prev = messages[cutoff - 1];

    // If cutoff is on a tool result, we must include the tool call
    if (msg.role === "tool" || msg.type === "tool_result") {
      cutoff--;
      continue;
    }

    // If the previous message is a tool call whose result is inside the cutoff, include the call
    if (
      prev &&
      (prev.type === "tool_call" ||
        (prev.metadata?.tool_calls && prev.metadata.tool_calls.length > 0))
    ) {
      cutoff--;
      continue;
    }

    break;
  }

  return messages.slice(cutoff);
}

// Message compilation compiler
export function compileMessagesForLLM(params: {
  activeAgentName: string;
  messages: Array<
    Record<string, unknown> & {
      role?: string;
      name?: string;
      content?: string;
      type?: string;
      metadata?: { tool_calls?: unknown[] };
      toolCallId?: string;
    }
  >;
  maxHistoryMessages?: number;
  injectedSystemMessages: Array<{ content: string; depth: number }>;
  isGemini: boolean;
}): {
  compiledMessages: CompiledPayloadMessage[];
  systemInstruction?: string;
} {
  const { activeAgentName, messages, maxHistoryMessages, injectedSystemMessages, isGemini } =
    params;

  // 1. Prune base history
  let baseHistory = pruneHistory(messages, maxHistoryMessages);
  const L = baseHistory.length;

  // 2. Resolve injected system messages
  const groupedInjections = new Map<
    number,
    Array<{ content: string; depth: number; isGlobal: boolean }>
  >();

  for (const item of injectedSystemMessages) {
    let targetIndex = item.depth >= 0 ? item.depth : L + item.depth;
    targetIndex = Math.max(0, Math.min(L, targetIndex));
    if (!groupedInjections.has(targetIndex)) {
      groupedInjections.set(targetIndex, []);
    }
    groupedInjections.get(targetIndex)!.push({ ...item, isGlobal: true });
  }

  // Deduplicate and Merge system messages at each index
  const finalInjections = new Map<number, string>();
  for (const [idx, list] of groupedInjections.entries()) {
    // Deduplicate by content
    const uniqueList: typeof list = [];
    const contents = new Set<string>();
    for (const item of list) {
      if (!contents.has(item.content)) {
        contents.add(item.content);
        uniqueList.push(item);
      }
    }

    if (uniqueList.length > 0) {
      const mergedContent = uniqueList.map((item) => item.content).join("\n\n");
      finalInjections.set(idx, mergedContent);
    }
  }

  // Insert in descending order of index
  const H = [...baseHistory];
  const sortedIndices = Array.from(finalInjections.keys()).sort((a, b) => b - a);
  for (const idx of sortedIndices) {
    H.splice(idx, 0, {
      role: "system",
      content: finalInjections.get(idx)!,
      type: "text",
    });
  }

  // Map roles and assign prefixes
  let systemInstruction: string | undefined = undefined;
  const mapped: Array<{
    role: string;
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
    name?: string;
  }> = [];

  for (let i = 0; i < H.length; i++) {
    const msg = H[i];

    if (msg.role === "system") {
      if (isGemini) {
        if (i === 0) {
          systemInstruction = systemInstruction
            ? systemInstruction + "\n\n" + msg.content
            : msg.content;
        } else {
          mapped.push({
            role: "user",
            content: `[System Notification]: ${msg.content || ""}`,
          });
        }
      } else {
        mapped.push({
          role: "system",
          content: msg.content || "",
        });
      }
    } else {
      const isSelf = msg.name === activeAgentName;
      let finalRole: "user" | "assistant" | "tool" = "user";

      if (isSelf) {
        if (msg.role === "assistant") {
          finalRole = "assistant";
        } else if (msg.role === "tool") {
          finalRole = "tool";
        }
      }

      let content = msg.content || "";
      if (finalRole === "user") {
        if (msg.name && msg.name !== activeAgentName) {
          content = `[${msg.name}]: ${content}`;
        }
      }

      mapped.push({
        role: finalRole,
        content,
        tool_calls: msg.metadata?.tool_calls,
        tool_call_id: msg.toolCallId,
        name: msg.name,
      });
    }
  }

  // Merge consecutive messages of the same role
  const merged: CompiledPayloadMessage[] = [];
  for (const msg of mapped) {
    if (merged.length === 0) {
      merged.push({
        role: msg.role as CompiledPayloadMessage["role"],
        content: msg.content,
        tool_calls: msg.tool_calls,
        tool_call_id: msg.tool_call_id,
        name: msg.name,
      });
      continue;
    }

    const last = merged[merged.length - 1];
    if (last.role === msg.role && msg.role !== "tool") {
      last.content = last.content + "\n\n" + msg.content;
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        last.tool_calls = [
          ...(Array.isArray(last.tool_calls) ? last.tool_calls : []),
          ...msg.tool_calls,
        ];
      }
    } else {
      merged.push({
        role: msg.role as CompiledPayloadMessage["role"],
        content: msg.content,
        tool_calls: msg.tool_calls,
        tool_call_id: msg.tool_call_id,
        name: msg.name,
      });
    }
  }

  return { compiledMessages: merged, systemInstruction };
}

// XState graphRunnerActor definition
export const graphRunnerActor = createMachine(
  {
    types: {} as { context: RunnerContext; events: RunnerEvent; input: RunnerInput },
    id: "graphRunnerActor",
    initial: "initializing",
    context: ({ input }) => ({
      threadId: input.threadId,
      workflowSnapshot: null,
      presetConfig: null,
      apiKeyConfig: {},
      stepsInCurrentRun: 0,
      tokensInCurrentRun: 0,
      budgetOverride: null,
      textBuffer: "",
      reasoningBuffer: "",
      currentStepIndex: 0,
      errorMessage: null,
      abortController: null,
      activeInterrupt: null,
      compiledGraph: null,
      accumulatedTokensThisStep: { promptTokens: 0, completionTokens: 0 },
      lastEmitTime: 0,
      llmProvider: input.llmProvider,
    }),
    exit: ["abortActiveRequest"],
    on: {
      STOP: {
        target: ".paused",
      },
    },
    states: {
      initializing: {
        invoke: {
          src: fromPromise(async ({ input }: { input: { context: RunnerContext } }) => {
            const context = input.context;
            const thread = await getThread(context.threadId);
            if (!thread) {
              throw new Error(`Thread ${context.threadId} not found.`);
            }

            // Load active preset or default fallback
            let preset = await getPreset(thread.activePresetId);
            if (!preset) {
              const defaultIdRecord = await getSetting<string>("default_preset_id");
              if (defaultIdRecord) {
                preset = await getPreset(defaultIdRecord);
              }
            }

            // Load API keys
            const apiKeys = (await getSetting("api_keys")) || {};

            // Get current max sequence
            const existingMessages = await getMessagesForThread(context.threadId);
            const maxSequence =
              existingMessages.length > 0
                ? Math.max(...existingMessages.map((m) => m.sequence))
                : -1;

            return {
              thread,
              preset: preset || null,
              apiKeys,
              maxSequence,
            };
          }),
          input: ({ context }) => ({ context }),
          onDone: {
            target: "ready",
            actions: assign(({ event }) => {
              console.log("DEBUG: initializing onDone", JSON.stringify(event.output, null, 2));
              return {
                workflowSnapshot: event.output.thread.workflowSnapshot,
                presetConfig: event.output.preset,
                apiKeyConfig: event.output.apiKeys,
                activeInterrupt: event.output.thread.activeInterrupt,
                currentStepIndex: event.output.maxSequence + 1,
              };
            }),
          },
          onError: {
            target: "failed.graphError",
            actions: assign(({ event }) => {
              console.log("DEBUG: initializing onError", JSON.stringify(event, null, 2));
              return {
                errorMessage: getEventErrorMessage(event) || "Failed to initialize",
              };
            }),
          },
        },
      },
      ready: {
        always: [
          {
            guard: ({ context }) => !!context.activeInterrupt,
            target: "interrupted",
          },
          {
            target: "running.requesting",
          },
        ],
      },
      running: {
        initial: "requesting",
        states: {
          requesting: {
            id: "requesting",
            invoke: {
              src: fromPromise(
                async ({
                  input,
                  emit,
                }: {
                  input: { context: RunnerContext };
                  emit: (e: { type: string; [key: string]: unknown }) => void;
                }) => {
                  const { context } = input;
                  const abortController = new AbortController();
                  context.abortController = abortController;

                  // Compile StateGraph
                  const checkpointer = new IndexedDBSaver();
                  const graph = compileWorkflow(
                    context.workflowSnapshot?.nodes || [],
                    context.workflowSnapshot?.edges || [],
                    {
                      callLLM: async (presetId, systemPrompt, messages, _tools) => {
                        if (context.llmProvider) {
                          return context.llmProvider({
                            presetId,
                            systemPrompt,
                            messages,
                            tools: _tools,
                          });
                        }

                        // Budget checks before starting LLM execution
                        const limitSteps =
                          context.budgetOverride?.maxStepsWithoutUser ??
                          context.presetConfig?.budgetPolicy?.maxStepsWithoutUser ??
                          5;
                        const limitTokens =
                          context.budgetOverride?.maxTokensPerRun ??
                          context.presetConfig?.budgetPolicy?.maxTokensPerRun ??
                          null;

                        if (context.stepsInCurrentRun >= limitSteps) {
                          throw new Error("BUDGET_EXCEEDED_STEPS");
                        }
                        if (limitTokens !== null && context.tokensInCurrentRun >= limitTokens) {
                          throw new Error("BUDGET_EXCEEDED_TOKENS");
                        }

                        // Resolve target preset
                        let finalPreset = context.presetConfig;
                        if (presetId) {
                          const p = await getPreset(presetId);
                          if (p) finalPreset = p;
                        }

                        if (!finalPreset) {
                          throw new Error("No active preset configured.");
                        }

                        const provider = finalPreset.provider;
                        const apiKey =
                          finalPreset.apiKey ||
                          (provider === "gemini"
                            ? context.apiKeyConfig.gemini
                            : context.apiKeyConfig.openRouter);
                        if (!apiKey) {
                          throw new Error(`API Key for ${provider} is not configured.`);
                        }

                        // Find active node config to resolve maxHistoryMessages
                        const activeNode = context.workflowSnapshot?.nodes.find(
                          (n: {
                            name?: string;
                            systemPrompt?: string;
                            maxHistoryMessages?: number;
                          }) => {
                            const resolved = resolvePrompt(n.systemPrompt, messages);
                            return resolved === systemPrompt;
                          },
                        );
                        const maxHistoryMessages = activeNode?.maxHistoryMessages;

                        // Compile messages
                        const { compiledMessages, systemInstruction } = compileMessagesForLLM({
                          activeAgentName: activeNode?.name || "Assistant",
                          messages,
                          maxHistoryMessages,
                          injectedSystemMessages:
                            context.workflowSnapshot?.injectedSystemMessages || [],
                          isGemini: provider === "gemini",
                        });

                        context.textBuffer = "";
                        context.reasoningBuffer = "";

                        let content = "";
                        const toolCalls: Array<{ id: string; name: string; args: unknown }> = [];

                        emit({ type: "UPDATE_UI_STATE", state: "running.streaming" });

                        const throttledEmit = (token: string, reasoning: string) => {
                          context.textBuffer += token;
                          context.reasoningBuffer += reasoning;

                          const now = Date.now();
                          if (now - context.lastEmitTime >= 100) {
                            context.lastEmitTime = now;
                            emit({
                              type: "RECEIVE_TOKEN",
                              token: context.textBuffer,
                              reasoning: context.reasoningBuffer,
                              delta: token,
                            });
                          }
                        };

                        if (provider === "gemini") {
                          const ai = new GoogleGenAI({ apiKey });
                          const stream = await ai.models.generateContentStream({
                            model: finalPreset.model,
                            contents: compiledMessages,
                            config: {
                              systemInstruction,
                              temperature: finalPreset.temperature,
                              maxOutputTokens: finalPreset.maxTokens,
                            },
                          });

                          for await (const chunk of stream) {
                            if (abortController.signal.aborted) {
                              throw new Error("Aborted");
                            }
                            const text = chunk.text || "";
                            content += text;

                            if (chunk.usageMetadata) {
                              context.accumulatedTokensThisStep = {
                                promptTokens: chunk.usageMetadata.promptTokenCount || 0,
                                completionTokens: chunk.usageMetadata.candidatesTokenCount || 0,
                              };
                            }

                            throttledEmit(text, "");
                          }
                        } else {
                          const or = new OpenRouter({ apiKey });
                          const stream = await or.chat.send({
                            chatRequest: {
                              model: finalPreset.model,
                              messages: compiledMessages.map(toOpenRouterMessage),
                              temperature: finalPreset.temperature,
                              maxTokens: finalPreset.maxTokens,
                              stream: true,
                            },
                          });

                          for await (const chunk of stream) {
                            if (abortController.signal.aborted) {
                              throw new Error("Aborted");
                            }
                            const delta = chunk.choices?.[0]?.delta?.content || "";
                            content += delta;

                            const usage = getChunkUsage(chunk);
                            if (usage) {
                              context.accumulatedTokensThisStep = {
                                promptTokens: usage.prompt_tokens || 0,
                                completionTokens: usage.completion_tokens || 0,
                              };
                            }

                            throttledEmit(delta, "");
                          }
                        }

                        // Flush remaining buffer
                        emit({
                          type: "RECEIVE_TOKEN",
                          token: context.textBuffer,
                          reasoning: context.reasoningBuffer,
                          delta: "",
                        });

                        return {
                          content,
                          tool_calls: toolCalls,
                        };
                      },
                    },
                  );

                  const compiled = graph.compile({ checkpointer });
                  context.compiledGraph = compiled;

                  // Load target preceding checkpoint
                  const thread = await getThread(context.threadId);
                  const config = {
                    configurable: {
                      thread_id: context.threadId,
                      checkpoint_ns: thread?.latestCheckpointNs || undefined,
                      checkpoint_id: thread?.latestCheckpointId || undefined,
                    },
                  };

                  // Consume step-by-step
                  const state = await compiled.getState(config);
                  console.log("DEBUG: state", JSON.stringify(state, null, 2));
                  console.log("DEBUG: state.next", JSON.stringify(state.next, null, 2));
                  let runStream;
                  if (state.next && state.next.length > 0) {
                    const payload =
                      context.toolResponse !== undefined
                        ? new Command({ resume: context.toolResponse })
                        : null;
                    runStream = await compiled.stream(payload, {
                      ...config,
                      streamMode: "updates",
                    });
                  } else {
                    // If it's a new thread or we're starting fresh, load existing messages from the DB to seed the graph state
                    const existingMessages = await getMessagesForThread(context.threadId);
                    console.log(
                      "DEBUG: existingMessages",
                      JSON.stringify(existingMessages, null, 2),
                    );
                    runStream = await compiled.stream(
                      { messages: existingMessages },
                      { ...config, streamMode: "updates" },
                    );
                  }

                  const iterator = runStream[Symbol.asyncIterator]();

                  while (true) {
                    if (abortController.signal.aborted) {
                      throw new Error("Aborted");
                    }

                    // Check Budget policy before each step execution
                    const limitSteps =
                      context.budgetOverride?.maxStepsWithoutUser ??
                      context.presetConfig?.budgetPolicy?.maxStepsWithoutUser ??
                      5;
                    const limitTokens =
                      context.budgetOverride?.maxTokensPerRun ??
                      context.presetConfig?.budgetPolicy?.maxTokensPerRun ??
                      null;

                    if (context.stepsInCurrentRun >= limitSteps) {
                      throw new Error("BUDGET_EXCEEDED_STEPS");
                    }
                    if (limitTokens !== null && context.tokensInCurrentRun >= limitTokens) {
                      throw new Error("BUDGET_EXCEEDED_TOKENS");
                    }

                    const { value: chunk, done } = await iterator.next();
                    if (done) break;

                    context.stepsInCurrentRun++;
                    const stepTokens =
                      context.accumulatedTokensThisStep.promptTokens +
                      context.accumulatedTokensThisStep.completionTokens;
                    context.tokensInCurrentRun += stepTokens;

                    // Sync messages
                    const nodeOutputs = Object.values(chunk);
                    for (const out of nodeOutputs) {
                      const messagesList = getMessages(out as Partial<GraphStateType>);
                      if (messagesList) {
                        for (const msg of messagesList) {
                          const messageToSave: MessageStore = {
                            id: typeof msg?.id === "string" ? msg.id : crypto.randomUUID(),
                            threadId: context.threadId,
                            sequence: context.currentStepIndex++,
                            role:
                              msg?.role === "system" ||
                              msg?.role === "user" ||
                              msg?.role === "assistant" ||
                              msg?.role === "tool"
                                ? msg.role
                                : "user",
                            content: typeof msg?.content === "string" ? msg.content : "",
                            type:
                              msg?.type === "text" ||
                              msg?.type === "reasoning" ||
                              msg?.type === "tool_call" ||
                              msg?.type === "tool_result"
                                ? msg.type
                                : "text",
                            toolCallId:
                              typeof msg?.toolCallId === "string" ? msg.toolCallId : undefined,
                            name: typeof msg?.name === "string" ? msg.name : undefined,
                            createdAt:
                              typeof msg?.createdAt === "number" ? msg.createdAt : Date.now(),
                            metadata:
                              typeof msg?.metadata === "object" && msg?.metadata !== null
                                ? msg.metadata
                                : undefined,
                            checkpointId: state.config.configurable?.checkpoint_id || null,
                            checkpointNs: state.config.configurable?.checkpoint_ns || null,
                          };
                          await saveMessage(messageToSave);
                        }
                      }
                    }

                    // Save checkpoint & Thread metadata sync to db
                    const threadObj = await getThread(context.threadId);
                    if (threadObj) {
                      const stateVal = await compiled.getState(config);
                      threadObj.status = "executing";
                      threadObj.latestCheckpointId =
                        stateVal.config.configurable?.checkpoint_id || null;
                      threadObj.latestCheckpointNs =
                        stateVal.config.configurable?.checkpoint_ns || "";

                      // Update cumulative tokens
                      const currentStats = threadObj.tokenStats || {
                        promptTokens: 0,
                        completionTokens: 0,
                        totalTokens: 0,
                      };
                      threadObj.tokenStats = {
                        promptTokens:
                          currentStats.promptTokens +
                          context.accumulatedTokensThisStep.promptTokens,
                        completionTokens:
                          currentStats.completionTokens +
                          context.accumulatedTokensThisStep.completionTokens,
                        totalTokens: currentStats.totalTokens + stepTokens,
                      };
                      await saveThread(threadObj);
                    }

                    emit({
                      type: "STEP_COMPLETE",
                      steps: context.stepsInCurrentRun,
                      tokens: context.tokensInCurrentRun,
                    });
                  }

                  // Check if interrupted by LangGraph itself (e.g. input/tool node)
                  const finalState = await compiled.getState({
                    configurable: { thread_id: context.threadId },
                  });

                  // Always save the latest checkpoint after stream finishes (in case it interrupted)
                  const finalThreadObj = await getThread(context.threadId);
                  if (finalThreadObj) {
                    finalThreadObj.latestCheckpointId =
                      finalState.config.configurable?.checkpoint_id || null;
                    finalThreadObj.latestCheckpointNs =
                      finalState.config.configurable?.checkpoint_ns || "";
                    await saveThread(finalThreadObj);
                  }

                  if (
                    finalState.tasks &&
                    finalState.tasks.some(
                      (t: { interrupts?: unknown[] }) => t.interrupts && t.interrupts.length > 0,
                    )
                  ) {
                    const task = finalState.tasks.find(
                      (t: { interrupts?: unknown[] }) => t.interrupts && t.interrupts.length > 0,
                    );
                    const firstInterrupt = task?.interrupts?.[0]?.value;

                    let interruptType: "ask_questions" | "approval" = "ask_questions";
                    if (firstInterrupt?.type === "tool") {
                      const name = firstInterrupt.toolCall?.name;
                      if (name === "create_workflow" || name === "update_workflow") {
                        interruptType = "approval";
                      }
                    }

                    const details = {
                      type: interruptType,
                      toolCallId: firstInterrupt?.toolCall?.id,
                      firstInterrupt,
                    };

                    emit({ type: "INTERRUPTED", details });
                    return { success: false, interrupt: details };
                  }

                  return { success: true };
                },
              ),
              input: ({ context }) => ({ context }),
              onDone: [
                {
                  guard: ({ event }) => !!event.output.interrupt,
                  target: "#graphRunnerActor.interrupted",
                  actions: ["saveInterruptToDB"],
                },
                {
                  target: "#graphRunnerActor.completed",
                },
              ],
              onError: [
                {
                  guard: ({ event }) => {
                    const msg = getEventErrorMessage(event);
                    return msg === "BUDGET_EXCEEDED_STEPS" || msg === "BUDGET_EXCEEDED_TOKENS";
                  },
                  target: "#graphRunnerActor.interrupted.budgetExceeded",
                  actions: ["saveBudgetExceededInterruptToDB"],
                },
                {
                  target: "#graphRunnerActor.failed.apiError",
                  actions: assign({
                    errorMessage: ({ event }) => getEventErrorMessage(event) || "Execution error",
                  }),
                },
              ],
            },
          },
        },
        on: {
          PAUSE: {
            target: "#graphRunnerActor.paused",
          },
          STEP_COMPLETE: {
            actions: ["notifyStep"],
          },
          RECEIVE_TOKEN: {
            actions: ["notifyToken"],
          },
        },
      },
      paused: {
        entry: ["abortActiveRequest", "saveInactiveStatusToDB"],
        on: {
          START: {
            target: "running.requesting",
          },
        },
      },
      interrupted: {
        initial: "checkingType",
        entry: ["notifyInterrupt"],
        states: {
          checkingType: {
            always: [
              {
                guard: ({ context }) =>
                  getInterruptType(context.activeInterrupt) === "budget_exceeded",
                target: "budgetExceeded",
              },
              {
                guard: ({ context }) => getInterruptType(context.activeInterrupt) === "approval",
                target: "awaitingApproval",
              },
              {
                target: "awaitingToolInput",
              },
            ],
          },
          awaitingToolInput: {
            on: {
              SUBMIT_TOOL_RESPONSE: {
                target: "#requesting",
                actions: assign(({ event }) => ({
                  activeInterrupt: null,
                  stepsInCurrentRun: 0,
                  tokensInCurrentRun: 0,
                  toolResponse: event.type === "SUBMIT_TOOL_RESPONSE" ? event.response : undefined,
                })),
              },
            },
          },
          awaitingApproval: {
            on: {
              SUBMIT_TOOL_RESPONSE: {
                target: "#requesting",
                actions: assign(({ event }) => ({
                  activeInterrupt: null,
                  stepsInCurrentRun: 0,
                  tokensInCurrentRun: 0,
                  toolResponse: event.type === "SUBMIT_TOOL_RESPONSE" ? event.response : undefined,
                })),
              },
            },
          },
          budgetExceeded: {
            entry: ["notifyBudgetExceeded"],
            on: {
              RESUME_WITH_BUDGET_OVERRIDE: {
                target: "#graphRunnerActor.running.requesting",
                actions: assign(({ event }) => ({
                  activeInterrupt: null,
                  budgetOverride: {
                    maxStepsWithoutUser: event.stepOverride ?? null,
                    maxTokensPerRun: event.tokenOverride ?? null,
                  },
                })),
              },
            },
          },
        },
      },
      completed: {
        type: "final",
        entry: ["notifyComplete", "saveCompletedStatusToDB"],
      },
      failed: {
        initial: "apiError",
        states: {
          apiError: {},
          networkError: {},
          graphError: {},
        },
        entry: ["saveErrorStatusToDB", "notifyError"],
        on: {
          RETRY_STEP: {
            target: "initializing",
          },
          CHANGE_PRESET_AND_RESUME: {
            target: "initializing",
            actions: assign(() => ({
              presetConfig: null,
            })),
          },
        },
      },
    },
  },
  {
    actions: {
      abortActiveRequest: ({ context }) => {
        if (context.abortController) {
          context.abortController.abort();
          context.abortController = null;
        }
      },
      saveInterruptToDB: async ({ context, event }) => {
        const details = getEventInterrupt(event as { output?: { interrupt?: unknown } });
        const thread = await getThread(context.threadId);
        if (thread) {
          thread.status = "awaiting_input";
          thread.activeInterrupt = details;
          await saveThread(thread);
        }
      },
      saveBudgetExceededInterruptToDB: async ({ context }) => {
        const thread = await getThread(context.threadId);
        if (thread) {
          thread.status = "awaiting_input";
          thread.activeInterrupt = {
            type: "budget_exceeded",
            budgetDetails: {
              currentTokens: context.tokensInCurrentRun,
              maxTokens: context.presetConfig?.budgetPolicy?.maxTokensPerRun ?? null,
              stepCount: context.stepsInCurrentRun,
            },
          };
          await saveThread(thread);
        }
      },
      saveInactiveStatusToDB: async ({ context }) => {
        const thread = await getThread(context.threadId);
        if (thread) {
          thread.status = "inactive";
          await saveThread(thread);
        }
      },
      saveCompletedStatusToDB: async ({ context }) => {
        const thread = await getThread(context.threadId);
        if (thread) {
          thread.status = "inactive";
          await saveThread(thread);
        }
      },
      saveErrorStatusToDB: async ({ context }) => {
        const thread = await getThread(context.threadId);
        if (thread) {
          thread.status = "error";
          thread.errorMessage = context.errorMessage;
          await saveThread(thread);
        }
      },
      notifyComplete: sendTo(({ self }) => self._parent!, { type: "COMPLETE" }),
      notifyError: sendTo(
        ({ self }) => self._parent!,
        ({ context }) => ({
          type: "ERROR",
          error: context.errorMessage,
        }),
      ),
      notifyInterrupt: sendTo(
        ({ self }) => self._parent!,
        ({ context }) => ({
          type: "INTERRUPT",
          details: context.activeInterrupt,
        }),
      ),
      notifyBudgetExceeded: sendTo(
        ({ self }) => self._parent!,
        ({ context }) => ({
          type: "BUDGET_EXCEEDED",
          currentTokens: context.tokensInCurrentRun,
          maxTokens: context.presetConfig?.budgetPolicy?.maxTokensPerRun ?? null,
          stepCount: context.stepsInCurrentRun,
        }),
      ),
      notifyStep: sendTo(
        ({ self }) => self._parent!,
        ({ event }) => ({
          type: "STEP",
          steps: event.type === "STEP_COMPLETE" ? event.steps : 0,
          tokens: event.type === "STEP_COMPLETE" ? event.tokens : 0,
        }),
      ),
      notifyToken: sendTo(
        ({ self }) => self._parent!,
        ({ event }) => ({
          type: "RECEIVE_TOKEN",
          token: event.type === "RECEIVE_TOKEN" ? event.token : "",
          reasoning: event.type === "RECEIVE_TOKEN" ? event.reasoning : "",
          delta: event.type === "RECEIVE_TOKEN" ? event.delta : "",
        }),
      ),
    },
  },
);
