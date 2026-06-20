import React from "react";
import { createRoot } from "react-dom/client";
import { createMachine } from "xstate";
import { useMachine } from "@xstate/react";
import "./index.css";
import { SettingsComponent } from "./settings/settings-component";
import { PresetsComponent } from "./presets/presets-component";

const tabsMachine = createMachine({
  id: "tabs",
  initial: "settings",
  states: {
    settings: {
      on: {
        SHOW_PRESETS: { target: "presets" },
      },
    },
    presets: {
      on: {
        SHOW_SETTINGS: { target: "settings" },
      },
    },
  },
});

export function App() {
  const [state, send] = useMachine(tabsMachine);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <nav className="tabs-nav" aria-label="Main Navigation">
        <button
          type="button"
          className={`tab-btn ${state.matches("settings") ? "active" : ""}`}
          onClick={() => send({ type: "SHOW_SETTINGS" })}
          data-testid="tab-settings-btn"
        >
          Global Settings
        </button>
        <button
          type="button"
          className={`tab-btn ${state.matches("presets") ? "active" : ""}`}
          onClick={() => send({ type: "SHOW_PRESETS" })}
          data-testid="tab-presets-btn"
        >
          LLM Presets
        </button>
      </nav>

      <main style={{ width: "100%", display: "flex", justifyContent: "center" }}>
        {state.matches("settings") && <SettingsComponent />}
        {state.matches("presets") && <PresetsComponent />}
      </main>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
