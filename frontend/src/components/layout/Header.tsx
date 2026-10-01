import { Bell, CircleHelp, Menu, Search } from "lucide-react";

export default function Header({ title, subtitle, onMenu }: { title: string; subtitle?: string; onMenu?: () => void }) {
  return (
    <header className="topbar">
      <button className="icon-btn mobile-menu" onClick={onMenu}>
        <Menu size={20} />
      </button>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="top-actions">
        <button className="icon-btn">
          <Search size={18} />
        </button>
        <button className="icon-btn notify">
          <Bell size={18} />
        </button>
        <button className="help">
          <CircleHelp size={16} />
          도움말
        </button>
      </div>
    </header>
  );
}
