/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { createActor } from "xstate";
import { getThread, getThreadMessages, saveThread, saveMessage } from "../db/db-operations";
import type { Thread, Message } from "../db/db-schema";
import { MessageBubbleComponent } from "./message-bubble-component";
import { LoopControlPanel } from "./loop-control-panel";
import { ChatInputComponent } from "./chat-input-component";
import { AskQuestionsComponent } from "./ask-questions-component";
import { ProposalComponent } from "./proposal-component";
import { BudgetExceededCard } from "./budget-exceeded-card";
import { graphRunnerMachine } from "./graph-runner-actor";
import { compileWorkflow } from "../workflows/workflow-compiler";
import { getPreset, listPresets, getSetting } from "../db/db-operations";
import { useChatFeedAutoScroll } from "./use-chat-feed-auto-scroll";

export function ChatComponent() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();

  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  // Runner actor ref
  const runnerActorRef = useRef<any>(null);
  const runExecutionRef = useRef<((threadOverride?: Thread) => Promise<void>) | null>(null);
  const [runnerState, setRunnerState] = useState<string>("inactive");
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);

  // Stats for LoopControlPanel
  const [currentRound] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const [tokenStats, setTokenStats] = useState({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  });

  // Scroll ref for chat feed
  const { containerRef, handleScroll, isAtBottom, scrollToBottom } = useChatFeedAutoScroll(
    messages.length,
    runnerState === "executing",
  );

  // Load thread and message history
  const loadThreadData = useCallback(async () => {
    if (!threadId) return;
    try {
      const t = await getThread(threadId);
      if (!t) {
        void navigate("/settings");
        return;
      }
      setThread(t);
      const msgs = await getThreadMessages(threadId);
      // Sort messages by sequence
      const sortedMsgs = msgs.sort((a, b) => a.sequence - b.sequence);
      setMessages(sortedMsgs);

      // Sync stats
      if (t.tokenStats) {
        setTokenStats({
          promptTokens: t.tokenStats.promptTokens,
          completionTokens: t.tokenStats.completionTokens,
          totalTokens: t.tokenStats.totalTokens,
        });
      } else {
        setTokenStats({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
      }

      // Read status
      setRunnerState(t.status);

      // Auto-trigger graph execution if status is executing and runner actor is not initialized yet
      if (t.status === "executing" && !runnerActorRef.current) {
        void runExecutionRef.current?.(t);
      }
    } catch (err) {
      console.error("Failed to load thread data", err);
    } finally {
      setLoading(false);
    }
  }, [threadId, navigate]);

  useEffect(() => {
    setLoading(true);
    void loadThreadData();

    // Clean up any running actor when threadId changes
    return () => {
      if (runnerActorRef.current) {
        runnerActorRef.current.send({ type: "STOP" });
        runnerActorRef.current.stop();
        runnerActorRef.current = null;
      }
    };
  }, [threadId, loadThreadData]);

  // Spawn and coordinate graph runner actor
  const runExecution = async (threadOverride?: Thread) => {
    const activeThread = threadOverride || thread;
    if (!threadId || !activeThread) return;

    // Clean up existing actor if any

    // Clean up existing actor if any
    if (runnerActorRef.current) {
      runnerActorRef.current.send({ type: "STOP" });
      runnerActorRef.current.stop();
      runnerActorRef.current = null;
    }

    try {
      // 1. Compile workflow
      const compiledWorkflow = compileWorkflow(activeThread.workflowSnapshot);

      // 2. Fetch preset
      const presetId = activeThread.activePresetId;
      let preset = await getPreset(presetId);
      if (!preset) {
        const presets = await listPresets();
        preset = presets[0] || null;
      }
      if (!preset) {
        throw new Error("No active LLM preset config available.");
      }

      // Initialize the actor
      const actor = createActor(graphRunnerMachine, {
        input: {
          threadId,
          workflowSnapshot: activeThread.workflowSnapshot,
          presetConfig: preset,
        },
      });

      // Override context directly as per graph runner pattern
      actor.getSnapshot().context.threadId = threadId;
      actor.getSnapshot().context.workflowSnapshot = activeThread.workflowSnapshot;
      actor.getSnapshot().context.presetConfig = preset;

      runnerActorRef.current = actor;

      // Subscribe to actor transitions to coordinate UI updates
      actor.subscribe(async (state) => {
        const snapValue =
          typeof state.value === "string" ? state.value : Object.keys(state.value)[0];
        setRunnerState(snapValue);
        // Update local loop/turn counters
        setTurnCount(state.context.stepsInCurrentRun);

        if (state.context.currentStreamingText) {
          // Render a simulated streaming message in UI feed
          setStreamingMessage({
            id: "streaming-temp-id",
            threadId,
            sequence: messages.length,
            role: "assistant",
            content: state.context.currentStreamingText,
            type: "text",
            createdAt: Date.now(),
            checkpointId: null,
            checkpointNs: null,
            name: "Agent",
          });
        } else {
          setStreamingMessage(null);
        }

        // If completed or interrupted, reload thread from database to display updated messages/checkpoints
        if (state.matches("completed") || state.matches("interrupted") || state.matches("failed")) {
          void loadThreadData();
        }
      });

      actor.start();
      actor.send({ type: "START" });

      // Driving the generator loop asynchronously
      void executeWorkflowLoop(actor, compiledWorkflow, preset);
    } catch (err: any) {
      console.error(err);
      // Save error details to thread
      const updatedThread = {
        ...activeThread,
        status: "error" as const,
        errorMessage: err?.message || String(err),
      };
      await saveThread(updatedThread);
      void loadThreadData();
    }
  };

  const executeWorkflowLoop = async (actor: any, compiledWorkflow: any, preset: any) => {
    // Execution Loop implementation
    // Drives LLM generation steps, compiles context, and writes messages/checkpoints
    try {
      let currentThread = await getThread(threadId!);
      if (!currentThread) return;

      // Set thread status to executing in DB
      currentThread.status = "executing";
      currentThread.errorMessage = null;
      await saveThread(currentThread);

      // Find current node ID starting from checkpoint, or entry node
      let currentNodeId = compiledWorkflow.entryNodeId;
      let lastAgentId: string | null = null;
      let consensusReached = false;
      let forceSummarize = false;
      let currentRoundVal = 0;
      let stepsInCurrentRun = 0;

      // If checkpoint exists, resume from it
      if (currentThread.latestCheckpointId) {
        // In a real execution, we would resolve state from the IndexedDBCheckpointer
      }

      // Loop execution
      while (currentNodeId) {
        // Check if stopped/paused
        if (actor.getSnapshot().status === "stopped" || actor.getSnapshot().matches("paused")) {
          break;
        }

        const node = compiledWorkflow.nodes.get(currentNodeId);
        if (!node) {
          throw new Error(`Node ${currentNodeId} not found in compiled workflow`);
        }

        if (node.action.kind === "input") {
          // For input nodes, we assume user input is already in history, so we route immediately
          currentNodeId = node.route({
            messages,
            lastAgentId,
            consensusReached,
            forceSummarize,
            turnCount: stepsInCurrentRun,
            currentRound: currentRoundVal,
          });
          continue;
        }

        if (
          node.action.kind === "agent" ||
          node.action.kind === "summary" ||
          node.action.kind === "consensus_check"
        ) {
          stepsInCurrentRun++;
          actor.send({ type: "START" });

          // Resolve systemPrompt and placeholders
          const systemPromptRaw = node.action.systemPrompt || "";
          const resolvedSystemPrompt = systemPromptRaw
            .replace(/\{\{topic\}\}/g, messages[0]?.content || "")
            .replace(/\{\{user_input\}\}/g, messages[0]?.content || "");

          // 1. Fetch credentials
          const apiKeys = await getSetting("api_keys");
          const apiKey =
            preset.apiKey || (preset.provider === "gemini" ? apiKeys?.gemini : apiKeys?.openRouter);
          if (!apiKey) {
            throw new Error(
              `API key is required for ${preset.provider === "gemini" ? "Gemini" : "OpenRouter"}`,
            );
          }

          // 2. Fetch stream from endpoint
          let generatedContent = "";

          if (preset.provider === "gemini") {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${preset.model}:streamGenerateContent?key=${apiKey}`;
            const response = await fetch(geminiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    role: "user",
                    parts: [
                      {
                        text:
                          resolvedSystemPrompt +
                          "\n\n" +
                          messages.map((m) => `[${m.role}]: ${m.content}`).join("\n"),
                      },
                    ],
                  },
                ],
              }),
            });

            if (!response.ok) {
              throw new Error(`Gemini API returned status ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body reader");

            const decoder = new TextDecoder();
            let chunkBuffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              chunkBuffer += decoder.decode(value, { stream: true });
              const lines = chunkBuffer.split("\n");
              chunkBuffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                let cleanLine = trimmed;
                if (cleanLine.startsWith("[")) cleanLine = cleanLine.slice(1);
                if (cleanLine.startsWith(",")) cleanLine = cleanLine.slice(1);
                if (cleanLine.endsWith("]")) cleanLine = cleanLine.slice(0, -1);
                cleanLine = cleanLine.trim();

                try {
                  const parsed = JSON.parse(cleanLine);
                  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
                  if (text) {
                    generatedContent += text;
                    actor.send({
                      type: "RECEIVE_TOKEN",
                      token: text,
                      delta: text,
                      reasoning: "",
                    });
                  }
                } catch {}
              }
            }
          } else {
            // OpenRouter SSE stream
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: preset.model,
                messages: [
                  { role: "system", content: resolvedSystemPrompt },
                  ...messages.map((m) => ({ role: m.role, content: m.content })),
                ],
                stream: true,
              }),
            });

            if (!response.ok) {
              throw new Error(`OpenRouter API returned status ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body reader");

            const decoder = new TextDecoder();
            let chunkBuffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              chunkBuffer += decoder.decode(value, { stream: true });
              const lines = chunkBuffer.split("\n");
              chunkBuffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("data:")) {
                  const dataStr = trimmed.slice(5).trim();
                  if (dataStr === "[DONE]") continue;

                  try {
                    const parsed = JSON.parse(dataStr);
                    const content = parsed.choices?.[0]?.delta?.content || "";
                    if (content) {
                      generatedContent += content;
                      actor.send({
                        type: "RECEIVE_TOKEN",
                        token: content,
                        delta: content,
                        reasoning: "",
                      });
                    }
                  } catch {}
                }
              }
            }
          }

          // Complete step execution
          const messageId = crypto.randomUUID();
          const newMsg: Message = {
            id: messageId,
            threadId: threadId!,
            sequence: messages.length + 1,
            role: "assistant",
            content: generatedContent,
            type: "text",
            createdAt: Date.now(),
            name: node.action.kind === "agent" ? (node.action as any).nodeName : "Agent",
            checkpointId: crypto.randomUUID(),
            checkpointNs: "default",
          };

          await saveMessage(newMsg);

          // Update tokens and step counters
          actor.send({
            type: "STEP_COMPLETE",
            message: newMsg,
            checkpointId: newMsg.checkpointId!,
            usage: { promptTokens: 100, completionTokens: 150 }, // fallback values
          });

          // Route to next node
          lastAgentId = node.nodeId;
          currentNodeId = node.route({
            messages: [...messages, newMsg],
            lastAgentId,
            consensusReached,
            forceSummarize,
            turnCount: stepsInCurrentRun,
            currentRound: currentRoundVal,
          });

          // Reload messages feed
          const refreshedMsgs = await getThreadMessages(threadId!);
          setMessages(refreshedMsgs.sort((a, b) => a.sequence - b.sequence));
        }
      }

      // Finalize run
      currentThread = (await getThread(threadId!))!;
      currentThread.status = "inactive";
      await saveThread(currentThread);
      actor.send({ type: "COMPLETE" });
      void loadThreadData();
    } catch (err: any) {
      console.error(err);
      const currentThread = await getThread(threadId!);
      if (currentThread) {
        currentThread.status = "error";
        currentThread.errorMessage = err?.message || String(err);
        await saveThread(currentThread);
      }
      actor.send({ type: "ERROR", errorDetails: err?.message || String(err) });
      void loadThreadData();
    }
  };

  runExecutionRef.current = runExecution;

  const handlePause = () => {
    if (runnerActorRef.current) {
      runnerActorRef.current.send({ type: "PAUSE" });
    }
  };

  const handleResume = () => {
    void runExecution();
  };

  const handleAbort = async () => {
    if (runnerActorRef.current) {
      runnerActorRef.current.send({ type: "STOP" });
    }
    if (thread) {
      const updated = { ...thread, status: "inactive" as const, activeInterrupt: null };
      await saveThread(updated);
      void loadThreadData();
    }
  };

  const handleChatSubmit = async (text: string, role: "user" | "assistant" | "system") => {
    if (!threadId || !thread) return;

    // Append new user/prefilled message to thread
    const newMsg: Message = {
      id: crypto.randomUUID(),
      threadId,
      sequence: messages.length + 1,
      role,
      content: text,
      type: "text",
      createdAt: Date.now(),
      name: role === "user" ? "User" : "Agent",
      checkpointId: null,
      checkpointNs: null,
    };

    await saveMessage(newMsg);
    setMessages((prev) => [...prev, newMsg]);

    // Automatically trigger graph execution run on user message submission
    void runExecution();
  };

  const handleRefreshThread = () => {
    void loadThreadData();
  };

  if (loading) {
    return (
      <div className="chat-loading" data-testid="chat-loading">
        <span className="spinner"></span>
        <p>Loading conversation feed...</p>
      </div>
    );
  }

  if (!thread) return null;

  return (
    <div className="chat-container" data-testid="chat-view" onScroll={handleScroll}>
      {/* Sticky Loop Control Panel */}
      <div className="loop-control-panel-wrapper">
        <LoopControlPanel
          workflowType={thread.workflowSnapshot.edges.length > 0 ? "loop" : "sequential"}
          currentRound={currentRound}
          turnCount={turnCount}
          tokenStats={tokenStats}
          executionState={runnerState as any}
          hasCheckpoint={!!thread.latestCheckpointId}
          onPause={handlePause}
          onResume={handleResume}
          onAbort={handleAbort}
        />
      </div>

      {/* Messages Feed Area */}
      <div className="chat-feed" ref={containerRef} data-testid="chat-feed">
        {messages.map((msg) => (
          <MessageBubbleComponent
            key={msg.id}
            message={msg}
            threadStatus={runnerState as any}
            threadTitle={thread.title}
            allMessages={messages}
            onRefreshThread={handleRefreshThread}
          />
        ))}

        {/* Temporary streaming bubble */}
        {streamingMessage && (
          <MessageBubbleComponent
            message={streamingMessage}
            isStreaming={true}
            threadStatus={runnerState as any}
            threadTitle={thread.title}
            allMessages={messages}
          />
        )}

        {/* Inline Interrupt Form Cards */}
        {thread.activeInterrupt?.type === "ask_questions" && (
          <div className="interrupt-card-wrapper">
            <AskQuestionsComponent
              threadId={thread.id}
              toolCallId={thread.activeInterrupt.toolCallId || ""}
              questions={[]} // Evaluates questions from tool call metadata in real implementation
              onSubmitSuccess={handleRefreshThread}
            />
          </div>
        )}

        {thread.activeInterrupt?.type === "approval" && (
          <div className="interrupt-card-wrapper">
            <ProposalComponent
              threadId={thread.id}
              toolCallId={thread.activeInterrupt.toolCallId || ""}
              toolName="Update Config"
              proposalData={{}}
              onSuccess={handleRefreshThread}
            />
          </div>
        )}

        {thread.activeInterrupt?.type === "budget_exceeded" && (
          <div className="interrupt-card-wrapper">
            <BudgetExceededCard
              threadId={thread.id}
              currentTokens={thread.activeInterrupt.budgetDetails?.currentTokens || 0}
              maxTokens={thread.activeInterrupt.budgetDetails?.maxTokens || null}
              stepCount={thread.activeInterrupt.budgetDetails?.stepCount || 0}
              onSuccess={handleRefreshThread}
            />
          </div>
        )}

        {/* Inline Error Notifications */}
        {thread.status === "error" && thread.errorMessage && (
          <div className="alert alert-danger" role="alert" style={{ margin: "1rem" }}>
            <h4 className="alert-heading">Execution Failed</h4>
            <p>{thread.errorMessage}</p>
            <div className="d-flex gap-2 mt-3">
              <button className="btn btn-primary btn-sm" onClick={handleResume}>
                🔄 Retry Step
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleAbort}>
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating scroll bottom button */}
      {!isAtBottom && (
        <button
          className="btn-scroll-bottom"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          👇
        </button>
      )}

      {/* Chat Input Component */}
      <div className="chat-input-wrapper">
        <ChatInputComponent isDisabled={runnerState === "executing"} onSubmit={handleChatSubmit} />
      </div>
    </div>
  );
}
