import { useEffect } from "react";
import { useMachine } from "@xstate/react";
import { createMachine } from "xstate";
import { appMachine, applyDocumentTheme } from "./app-machine";
import { SettingsComponent } from "../settings/settings-component";
import { PresetsComponent } from "../presets/presets-component";

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

export function AppComponent() {
  const [appState, sendApp] = useMachine(appMachine);
  const [tabState, sendTab] = useMachine(tabsMachine);

  const context = appState.context;

  // Listen for system theme changes when theme is set to "system"
  useEffect(() => {
    if (context.theme !== "system" || typeof window === "undefined" || !window.matchMedia) {
      return () => {};
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      applyDocumentTheme("system");
    };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [context.theme]);

  if (appState.matches("loading")) {
    return (
      <div className="app-loading-container" data-testid="app-loading">
        <span className="spinner large-spinner"></span>
        <p>Loading application settings...</p>
      </div>
    );
  }

  const handleSettingsSave = (settings: {
    theme: "light" | "dark" | "system";
    hasApiKeys: boolean;
  }) => {
    sendApp({
      type: "SETTINGS_SAVED",
      theme: settings.theme,
      hasApiKeys: settings.hasApiKeys,
    });
  };

  const handleThemeChange = (theme: "light" | "dark" | "system") => {
    sendApp({
      type: "CHANGE_THEME",
      theme,
    });
  };

  if (appState.matches("onboarding")) {
    return (
      <div className="onboarding-overlay" data-testid="onboarding-view">
        <div className="onboarding-card">
          <header className="onboarding-header">
            <div className="onboarding-logo">🚀</div>
            <h1>Welcome to In-Browser LLM Chat</h1>
            <p>
              Your ultimate private LLM companion. All data, settings, and conversation histories
              are stored completely inside your browser's local IndexedDB. No keys or messages are
              ever sent to third-party tracking servers.
            </p>
          </header>
          <div className="onboarding-instructions">
            <p>
              <strong>API Key Required:</strong> To get started, please configure a Gemini or
              OpenRouter API Key below. Once configured, you can immediately begin using presets and
              starting chat threads.
            </p>
          </div>
          <div className="onboarding-form-wrapper">
            <SettingsComponent
              onThemeChange={handleThemeChange}
              onSettingsSave={handleSettingsSave}
            />
          </div>
        </div>
      </div>
    );
  }

  // Main application view
  return (
    <div className="app-workspace" data-testid="app-workspace">
      <nav className="tabs-nav" aria-label="Main Navigation">
        <button
          type="button"
          className={`tab-btn ${tabState.matches("settings") ? "active" : ""}`}
          onClick={() => sendTab({ type: "SHOW_SETTINGS" })}
          data-testid="tab-settings-btn"
        >
          Global Settings
        </button>
        <button
          type="button"
          className={`tab-btn ${tabState.matches("presets") ? "active" : ""}`}
          onClick={() => sendTab({ type: "SHOW_PRESETS" })}
          data-testid="tab-presets-btn"
        >
          LLM Presets
        </button>
      </nav>

      <main style={{ width: "100%", display: "flex", justifyContent: "center" }}>
        {tabState.matches("settings") && (
          <SettingsComponent
            onThemeChange={handleThemeChange}
            onSettingsSave={handleSettingsSave}
          />
        )}
        {tabState.matches("presets") && <PresetsComponent />}
      </main>
    </div>
  );
}
