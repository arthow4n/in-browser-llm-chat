import { useEffect } from "react";
import { useMachine } from "@xstate/react";
import { HashRouter, Routes, Route, Navigate } from "react-router";
import { appMachine, applyDocumentTheme } from "./app-machine";
import { SettingsComponent } from "../settings/settings-component";
import { PresetsComponent } from "../presets/presets-component";
import { LayoutComponent } from "../layout/layout-component";
import { WorkflowEditorComponent } from "../workflows/workflow-editor-component";

export function AppComponent() {
  const [appState, sendApp] = useMachine(appMachine);

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

  // Main application view driven by React Router
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LayoutComponent />}>
          <Route index element={<Navigate to="/settings" replace />} />
          <Route
            path="settings"
            element={
              <SettingsComponent
                onThemeChange={handleThemeChange}
                onSettingsSave={handleSettingsSave}
              />
            }
          />
          <Route path="presets" element={<PresetsComponent />} />
          <Route path="workflows" element={<WorkflowEditorComponent />} />
          <Route
            path="threads/:threadId"
            element={
              <div className="chat-feed-placeholder" data-testid="chat-feed-placeholder">
                <p>Conversation Content Region</p>
              </div>
            }
          />
          <Route
            path="threads/new-placeholder"
            element={
              <div className="chat-feed-placeholder" data-testid="chat-feed-placeholder">
                <p>New Conversation Setup Region</p>
              </div>
            }
          />
          {/* Fallback to settings */}
          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
