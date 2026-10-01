import {
  Activity,
  ChevronRight,
  Database,
  FolderKanban,
  Home,
  PanelLeftClose,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import Logo from "./Logo";
import type { Dispatch, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";
import type { Navigate, Page } from "../../types";

export default function Sidebar({ page, setPage, collapsed, setCollapsed }: { page: Page; setPage: Navigate; collapsed: boolean; setCollapsed: Dispatch<SetStateAction<boolean>> }) {
  const items: [Page, LucideIcon, string][] = [
    ["home", Home, "홈"],
    ["studies", FolderKanban, "스터디"],
    ["runs", Activity, "실행 기록"],
    ["participants", Users, "참가자"],
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
        <span>새 스터디</span>
      </button>
      <nav>
        <p>워크스페이스</p>
        {items.map(([k, I, l]) => (
          <button
            key={k}
            className={page === k ? "active" : ""}
            onClick={() => setPage(k)}
          >
            <I size={18} />
            <span>{l}</span>
            {k === "participants" && <b>15</b>}
          </button>
        ))}
        <p className="second">관리</p>
        <button onClick={() => setPage("data")}>
          <Database size={18} />
          <span>데이터 소스</span>
        </button>
        <button onClick={() => setPage("settings")}>
          <Settings size={18} />
          <span>설정</span>
        </button>
      </nav>
      <div className="side-bottom">
        <div className="usage">
          <span>
            이번 달 AI 실행 <b>248 / 500</b>
          </span>
          <i>
            <em />
          </i>
        </div>
        <button className="profile">
          <span>PL</span>
          <label>
            <b>Persona Team</b>
            <small>team@persona.lab</small>
          </label>
          <ChevronRight size={15} />
        </button>
      </div>
    </aside>
  );
}
