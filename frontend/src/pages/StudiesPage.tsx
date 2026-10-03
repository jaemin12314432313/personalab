import type { Navigate, OpenReport } from "../types";
import { useState } from "react";
import { Ellipsis, FlaskConical, Gauge, Plus, Search } from "lucide-react";
import Header from "../components/layout/Header";
import Pill from "../components/ui/Pill";
import { studies } from "../data/demoData";

export default function StudiesPage({ goReport, setPage }: { goReport: OpenReport; setPage: Navigate }) {
  const [q, setQ] = useState("");
  return (
    <>
      <Header
        title="스터디"
        subtitle="제품 검증 프로젝트를 만들고 관리하세요."
      />
      <main className="page">
        <div className="toolbar">
          <label>
            <Search size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="스터디 검색"
            />
          </label>
          <div>
            <button className="secondary">
              <Gauge size={16} />
              필터
            </button>
            <button className="primary" onClick={() => setPage("create")}>
              <Plus size={16} />새 스터디
            </button>
          </div>
        </div>
        <div className="study-table">
          <div className="table-head">
            <span>스터디</span>
            <span>상태</span>
            <span>패널</span>
            <span>실제 참가자</span>
            <span>업데이트</span>
            <span />
          </div>
          {studies
            .filter((s) => s.name.includes(q) || s.desc.includes(q))
            .map((s) => (
              <button
                className="table-row"
                key={s.id}
                onClick={() => goReport(s)}
              >
                <span className="study-cell">
                  <i className={`study-icon ${s.tone}`}>
                    <FlaskConical size={18} />
                  </i>
                  <span>
                    <b>{s.name}</b>
                    <small>
                      {s.desc} · {s.version}
                    </small>
                  </span>
                </span>
                <span>
                  <Pill
                    tone={
                      s.tone === "complete"
                        ? "green"
                        : s.tone === "running"
                          ? "purple"
                          : "gray"
                    }
                    dot
                  >
                    {s.status}
                  </Pill>
                </span>
                <span>
                  <b>{s.ai || "—"}</b>
                  <small>AI 소비자</small>
                </span>
                <span>
                  <b>{s.real || "—"}</b>
                  <small>명 참여</small>
                </span>
                <span>
                  <b>{s.updated}</b>
                </span>
                <Ellipsis size={18} />
              </button>
            ))}
        </div>
      </main>
    </>
  );
}
