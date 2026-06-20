import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return <div>In-Browser LLM Chat Orchestrator</div>;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
