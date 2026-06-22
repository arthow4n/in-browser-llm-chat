import { useMachine } from "@xstate/react";
import { messageAccordionMachine } from "./message-accordion-machine";

export interface MessageAccordionComponentProps {
  title: string;
  icon?: string;
  children: React.ReactNode;
  testId?: string;
}

export function MessageAccordionComponent({
  title,
  icon,
  children,
  testId = "message-accordion",
}: MessageAccordionComponentProps) {
  const [state, send] = useMachine(messageAccordionMachine);
  const isOpen = state.context.isOpen;

  const handleToggle = () => {
    if (isOpen) {
      send({ type: "TOGGLE_COLLAPSE" });
    } else {
      send({ type: "TOGGLE_EXPAND" });
    }
  };

  return (
    <div className={`message-accordion ${isOpen ? "expanded" : "collapsed"}`} data-testid={testId}>
      <button
        className="message-accordion-header"
        onClick={handleToggle}
        aria-expanded={isOpen}
        data-testid={`${testId}-header`}
      >
        <span className="message-accordion-icon-text">
          {icon && <span className="message-accordion-icon">{icon}</span>}
        </span>
        <span className="message-accordion-title">{title}</span>
        <span className="message-accordion-arrow">{isOpen ? "▼" : "▶"}</span>
      </button>
      <div
        className="message-accordion-content"
        data-testid={`${testId}-content`}
        style={{
          maxHeight: "250px",
          overflowY: "auto",
          display: isOpen ? "block" : "none",
        }}
        aria-hidden={!isOpen}
      >
        {children}
      </div>
    </div>
  );
}
