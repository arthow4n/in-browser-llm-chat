import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import { CoordinatorProvider } from "./context/CoordinatorContext";
import "@carbon/styles/css/styles.css";
import { BrowserRouter } from "react-router";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <CoordinatorProvider>
        <App />
      </CoordinatorProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
