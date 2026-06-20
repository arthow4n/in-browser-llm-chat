import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { SettingsComponent } from "./settings/settings-component";

function App() {
  return (
    <main>
      <SettingsComponent />
    </main>
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
