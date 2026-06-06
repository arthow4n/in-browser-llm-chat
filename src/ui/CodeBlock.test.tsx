import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CodeBlock } from "./CodeBlock";

vi.mock("@carbon/react", async () => {
  const actual = await vi.importActual("@carbon/react");
  return {
    ...actual,
    Button: ({
      onClick,
      children,
      renderIcon,
    }: {
      onClick?: () => void;
      children?: React.ReactNode;
      renderIcon?: React.ReactNode | (() => React.ReactNode);
    }) => (
      <button onClick={onClick}>
        {children}
        {renderIcon && (typeof renderIcon === "function" ? renderIcon() : renderIcon)}
      </button>
    ),
  };
});

vi.mock("@carbon/icons-react", () => ({
  Copy: () => <div data-testid="copy-icon" />,
  Download: () => <div data-testid="download-icon" />,
}));

describe("CodeBlock", () => {
  it("renders the code and language", () => {
    render(<CodeBlock code="console.log('hello')" language="typescript" />);
    expect(screen.getByText("TYPESCRIPT")).toBeInTheDocument();
    expect(screen.getByText("console.log('hello')")).toBeInTheDocument();
  });

  it("handles copy functionality", async () => {
    const writeTextMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: writeTextMock,
      },
      configurable: true,
    });

    render(<CodeBlock code="console.log('hello')" />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);

    expect(writeTextMock).toHaveBeenCalledWith("console.log('hello')");

    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });
  });

  it("handles download functionality", async () => {
    const aCreateMock = vi.fn<() => void>();
    const originalCreateElement = document.createElement.bind(document);

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "a") {
        const anchor = originalCreateElement("a") as HTMLAnchorElement;
        anchor.click = aCreateMock;
        return anchor;
      }
      return originalCreateElement(tagName);
    });

    render(<CodeBlock code="console.log('hello')" language="ts" />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]);

    expect(aCreateMock).toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
