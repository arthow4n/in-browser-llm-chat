interface HeaderComponentProps {
  title: string;
  onToggleMobileSidebar: () => void;
  actions?: React.ReactNode;
}

export function HeaderComponent({ title, onToggleMobileSidebar, actions }: HeaderComponentProps) {
  return (
    <header className="app-header" data-testid="app-header">
      <div className="header-left">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={onToggleMobileSidebar}
          aria-label="Open navigation menu"
          data-testid="header-mobile-menu-btn"
        >
          ☰
        </button>
        <h1 className="header-title" data-testid="header-title">
          {title}
        </h1>
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}
