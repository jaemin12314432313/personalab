import { useState } from "react";
import { ArrowRight, ChevronRight, FlaskConical, Plus, Search } from "lucide-react";
import Header from "../components/layout/Header";
import Pill from "../components/ui/Pill";
import { studies } from "../data/demoData";
import type { DraftMeta, Navigate, OpenReport, Study } from "../types";

export default function StudiesPage({ goReport, setPage, studyList = studies, draftMeta }: { goReport: OpenReport; setPage: Navigate; studyList?: Study[]; draftMeta: DraftMeta | null }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const visible = studyList.filter(s => (s.name + s.desc).toLowerCase().includes(q.toLowerCase()) && (filter === "all" || (filter === "completed" ? Boolean(s.integrated && s.run) : filter === "ready" ? Boolean(s.integrated && !s.run) : !s.integrated)));
  return <>
    <Header title="테스트" subtitle="제품 정보, AI 실행, 결과 리포트를 테스트별로 관리하세요." />
    <main className="page test-list-page">
      {draftMeta && <section className="setup-resume-banner"><div><small>작성 중인 테스트 · {draftMeta.step + 1}/4단계</small><b>{draftMeta.name}</b><p>아직 실행 전입니다. 저장된 설정부터 이어서 작성하세요.</p></div><button className="primary" onClick={() => setPage("create")}>이어서 작성 <ArrowRight size={16} /></button></section>}
      <div className="toolbar"><label><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="테스트 검색" aria-label="테스트 검색" /></label><div><button className="primary" onClick={() => setPage("create")}><Plus size={16} />새 테스트</button></div></div>
      <div className="test-filters" role="group" aria-label="상태 필터">{[["all", "전체"], ["ready", "실행 준비"], ["completed", "분석 완료"], ["sample", "예시 데이터"]].map(([key, label]) => <button key={key} className={filter === key ? "active" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>
      <div className="study-table"><div className="table-head"><span>테스트</span><span>상태</span><span>AI 패널</span><span>구성</span><span>업데이트</span><span /></div>
        {visible.map(s => <button className="table-row" key={s.id} onClick={() => goReport(s)}><span className="study-cell"><i className={`study-icon ${s.tone}`}><FlaskConical size={18} /></i><span><b>{s.name}</b><small>{s.desc} · {s.version}</small></span></span><span><Pill tone={s.integrated && s.run ? "green" : s.integrated ? "purple" : "gray"} dot>{s.integrated ? (s.run ? "분석 완료" : s.status === "실행 중" ? "실행 중" : "실행 준비") : "예시 데이터"}</Pill></span><span><b>{s.integrated ? s.personas?.length ?? 0 : "예시"}</b><small>AI Persona</small></span><span><b>{s.integrated ? `${s.screens?.length ?? 0}개 화면` : "샘플 결과"}</b><small>{s.integrated ? "프로토타입" : "참고용"}</small></span><span><b>{s.updated}</b></span><ChevronRight size={18} /></button>)}
        {!visible.length && <div className="test-empty"><b>조건에 맞는 테스트가 없습니다.</b><p>검색어 또는 상태 필터를 바꿔 보세요.</p></div>}
      </div>
    </main>
  </>;
}
