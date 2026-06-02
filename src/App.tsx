import React from "react";
import { setup, assign } from "xstate";
import { useMachine } from "@xstate/react";
import {
  Button,
  TextInput,
  Loading,
  Tile,
  InlineNotification,
  Header,
  HeaderName,
} from "@carbon/react";
import { z } from "zod";
import { saveAppState, getAppState } from "./db";
import { dummyGraph } from "./graph";

// Zod Schema for input validation
const inputSchema = z.string().min(1, { message: "Input text cannot be empty!" });

// XState Machine Setup (XState v5)
const chatAppMachine = setup({
  types: {} as {
    context: {
      input: string;
      validationError: string | null;
      graphResult: string[];
      dbMessage: string | null;
    };
    events:
      | { type: "CHANGE_INPUT"; value: string }
      | { type: "RUN_GRAPH" }
      | { type: "GRAPH_SUCCESS"; result: string[] }
      | { type: "SAVE_DB" }
      | { type: "DB_SAVED"; message: string }
      | { type: "LOAD_DB" }
      | { type: "DB_LOADED"; input: string; result: string[] }
      | { type: "SET_ERROR"; message: string }
      | { type: "RESET" };
  },
}).createMachine({
  id: "chatApp",
  initial: "idle",
  context: {
    input: "",
    validationError: null,
    graphResult: [],
    dbMessage: null,
  },
  states: {
    idle: {
      on: {
        CHANGE_INPUT: {
          actions: assign({
            input: ({ event }) => event.value,
            validationError: () => null,
          }),
        },
        RUN_GRAPH: {
          target: "runningGraph",
        },
        SAVE_DB: {
          target: "savingDb",
        },
        LOAD_DB: {
          target: "loadingDb",
        },
        RESET: {
          actions: assign({
            input: () => "",
            validationError: () => null,
            graphResult: () => [],
            dbMessage: () => null,
          }),
        },
      },
    },
    runningGraph: {
      on: {
        GRAPH_SUCCESS: {
          target: "idle",
          actions: assign({
            graphResult: ({ event }) => event.result,
            validationError: () => null,
            dbMessage: () => null,
          }),
        },
        SET_ERROR: {
          target: "idle",
          actions: assign({
            validationError: ({ event }) => event.message,
            dbMessage: () => null,
          }),
        },
      },
    },
    savingDb: {
      on: {
        DB_SAVED: {
          target: "idle",
          actions: assign({
            dbMessage: ({ event }) => event.message,
            validationError: () => null,
          }),
        },
        SET_ERROR: {
          target: "idle",
          actions: assign({
            validationError: ({ event }) => event.message,
            dbMessage: () => null,
          }),
        },
      },
    },
    loadingDb: {
      on: {
        DB_LOADED: {
          target: "idle",
          actions: assign({
            input: ({ event }) => event.input,
            graphResult: ({ event }) => event.result,
            dbMessage: () => "Loaded from IndexedDB!",
            validationError: () => null,
          }),
        },
        SET_ERROR: {
          target: "idle",
          actions: assign({
            validationError: ({ event }) => event.message,
            dbMessage: () => null,
          }),
        },
      },
    },
  },
});

export default function App() {
  const [state, send] = useMachine(chatAppMachine);
  const { input, validationError, graphResult, dbMessage } = state.context;

  const handleRunGraph = async () => {
    const validation = inputSchema.safeParse(input);
    if (!validation.success) {
      send({ type: "SET_ERROR", message: validation.error.issues[0].message });
      return;
    }

    send({ type: "RUN_GRAPH" });
    try {
      const res = await dummyGraph.invoke({ messages: [input] });
      send({ type: "GRAPH_SUCCESS", result: res.messages || [] });
    } catch (err: any) {
      send({ type: "SET_ERROR", message: err.message || "Failed to run graph" });
    }
  };

  const handleSaveDb = async () => {
    send({ type: "SAVE_DB" });
    try {
      await saveAppState("latest-session", { input, graphResult });
      send({ type: "DB_SAVED", message: "Session successfully saved to IndexedDB!" });
    } catch (err: any) {
      send({ type: "SET_ERROR", message: err.message || "Failed to save to database" });
    }
  };

  const handleLoadDb = async () => {
    send({ type: "LOAD_DB" });
    try {
      const data = await getAppState("latest-session");
      if (data) {
        send({ type: "DB_LOADED", input: data.input || "", result: data.graphResult || [] });
      } else {
        send({ type: "SET_ERROR", message: "No saved session found in IndexedDB." });
      }
    } catch (err: any) {
      send({ type: "SET_ERROR", message: err.message || "Failed to load from database" });
    }
  };

  const isLoading =
    state.matches("runningGraph") || state.matches("savingDb") || state.matches("loadingDb");

  return (
    <div
      style={{
        backgroundColor: "#161616",
        color: "#f4f4f4",
        minHeight: "100vh",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ backgroundColor: "#262626", borderBottom: "1px solid #393939" }}>
        <Header aria-label="In-Browser LLM Chat Orchestrator">
          <HeaderName href="#" prefix="Antigravity">
            LLM Chat Orchestrator Base
          </HeaderName>
        </Header>
      </div>
      <div style={{ padding: "6rem 2rem 2rem", maxWidth: "800px", margin: "0 auto" }}>
        <h1
          id="main-heading"
          style={{ fontSize: "2.5rem", fontWeight: 600, marginBottom: "0.5rem", color: "#ffffff" }}
        >
          Toolchain Orchestration Base
        </h1>
        <p style={{ color: "#c6c6c6", marginBottom: "2rem", fontSize: "1rem" }}>
          This page establishes and verifies our core stack: React 19, Carbon Design System, XState,
          IndexedDB, Zod, and LangGraph.js.
        </p>

        {isLoading && <Loading description="Processing..." withOverlay={true} />}

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {validationError && (
            <div id="notify-error">
              <InlineNotification
                kind="error"
                title="Error"
                subtitle={validationError}
                hideCloseButton
              />
            </div>
          )}

          {dbMessage && (
            <div id="notify-db">
              <InlineNotification
                kind="success"
                title="Database Operation"
                subtitle={dbMessage}
                hideCloseButton
              />
            </div>
          )}

          <Tile
            style={{
              backgroundColor: "#262626",
              border: "1px solid #393939",
              borderRadius: "4px",
              padding: "1.5rem",
            }}
          >
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                marginBottom: "1rem",
                color: "#ffffff",
              }}
            >
              Step 1: Orchestration Input (Zod Validated)
            </h3>
            <TextInput
              id="graph-input"
              labelText="Enter dummy prompt / input to flow into LangGraph"
              placeholder="e.g. Hello, orchestrator agent!"
              value={input}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                send({ type: "CHANGE_INPUT", value: e.target.value })
              }
              style={{ backgroundColor: "#161616", color: "#ffffff", border: "1px solid #525252" }}
            />
            <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
              <Button id="btn-run-graph" onClick={handleRunGraph} disabled={isLoading} size="md">
                Run LangGraph workflow
              </Button>
              <Button
                id="btn-save-db"
                kind="secondary"
                onClick={handleSaveDb}
                disabled={isLoading}
                size="md"
              >
                Save current input to DB
              </Button>
              <Button
                id="btn-load-db"
                kind="ghost"
                onClick={handleLoadDb}
                disabled={isLoading}
                size="md"
                style={{ color: "#4589ff" }}
              >
                Load latest from DB
              </Button>
              <Button
                id="btn-reset"
                kind="danger--ghost"
                onClick={() => send({ type: "RESET" })}
                disabled={isLoading}
                size="md"
              >
                Reset
              </Button>
            </div>
          </Tile>

          <Tile
            style={{
              backgroundColor: "#262626",
              border: "1px solid #393939",
              borderRadius: "4px",
              padding: "1.5rem",
            }}
          >
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                marginBottom: "1rem",
                color: "#ffffff",
              }}
            >
              Step 2: Orchestration Node Results
            </h3>
            {graphResult.length === 0 ? (
              <p style={{ color: "#8d8d8d", fontStyle: "italic" }}>
                No workflow execution logs yet. Click 'Run LangGraph workflow' to start.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {graphResult.map((msg, index) => (
                  <div
                    key={index}
                    style={{
                      backgroundColor: "#161616",
                      border: "1px solid #393939",
                      padding: "0.75rem 1rem",
                      borderRadius: "4px",
                    }}
                  >
                    <strong style={{ color: "#4589ff" }}>Node {index + 1}:</strong> {msg}
                  </div>
                ))}
              </div>
            )}
          </Tile>
        </div>
      </div>
    </div>
  );
}
