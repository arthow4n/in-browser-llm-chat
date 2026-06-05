import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the Carbon layout shell", () => {
    render(<App />);

    // Check for Header elements
    const header = screen.getByRole("banner", { name: /LLM Chat/i });
    expect(header).toBeDefined();

    // Check for HeaderName
    const headerName = screen.getAllByText(/Chat/i);
    expect(headerName.length).toBeGreaterThan(0);

    // Check for main content area
    const mainHeading = screen.getByRole("heading", { level: 1, name: /Welcome to LLM Chat/i });
    expect(mainHeading).toBeDefined();
  });
});
