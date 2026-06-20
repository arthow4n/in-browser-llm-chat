import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { AppComponent } from "./app/app-component";

export function App() {
  return <AppComponent />;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
