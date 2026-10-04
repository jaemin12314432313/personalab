import {
  Activity,
  ChevronRight,
  Database,
  FolderKanban,
  Home,
  PanelLeftClose,
  Plus,
  Settings,
} from "lucide-react";
import Logo from "./Logo";
import type { LucideIcon } from "lucide-react";
import type { Navigate, Page } from "../../types";

export default function Sidebar({ page, setPage, collapsed, setCollapsed }: { page: Page; setPage: Navigate; collapsed: boolean; setCollapsed: (value: boolean) => void }) {
  const items: [Page, LucideIcon, string][] = [
    ["home", Home, "홈"],
    ["studies", FolderKanban, "테스트"],
    ["runs", Activity, "실행 기록"],
  ];
  return (
    <aside className="sidebar">
      <div className="side-top">
        <Logo />
        <button onClick={() => setCollapsed(!collapsed)} className="icon-btn">
          <PanelLeftClose size={18} />
        </button>
      </div>
      <button onClick={() => setPage("create")} className="new-study">
        <Plus size={17} />
        <span>새 테스트</span>
      </button>
      <nav>
        <p>워크스페이스</p>
        {items.map(([k, I, l]) => (
          <button
            key={k}
            className={page === k || (k === "studies" && ["create", "report", "run"].includes(page)) ? "active" : ""}
            onClick={() => setPage(k)}
            aria-current={page === k || (k === "studies" && ["create", "report", "run"].includes(page)) ? "page" : undefined}
          >
            <I size={18} />
            <span>{l}</span>
          </button>
        ))}
        <p className="second">관리</p>
        <button className={page === "data" ? "active" : ""} onClick={() => setPage("data")}>
          <Database size={18} />
          <span>데이터 소스</span>
        </button>
        <button className={page === "settings" ? "active" : ""} onClick={() => setPage("settings")}>
          <Settings size={18} />
          <span>설정</span>
        </button>
      </nav>
      <div className="side-bottom">
        <div className="usage">
          <span>RESEARCH WORKSPACE</span>
          <b>Result · Process · Evidence</b>
        </div>
        <button className="profile">
          <span>PL</span>
          <label>
            <b>Persona Team</b>
            <small>Workspace</small>
          </label>
          <ChevronRight size={15} />
        </button>
      </div>
    </aside>
  );
}
