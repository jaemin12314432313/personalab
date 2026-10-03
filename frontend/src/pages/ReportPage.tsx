import { useState } from "react";
import { ArrowLeft, ArrowRight, FlaskConical, Play } from "lucide-react";
import Header from "../components/layout/Header";
import EvidenceDrawer from "../components/report/EvidenceDrawer";
import ReportContent from "../components/report/ReportContent";
import Pill from "../components/ui/Pill";
import IntegratedReport from "../components/report/IntegratedReport";
import { OCCUPATIONS, reportFor } from "../data/studyEngine";
import { isIntegratedStudy, type IntegratedStudy, type Navigate, type ReportTab, type Study } from "../types";

type OpenRun = (study: Study, personaId?: string | null) => void;
const detailTabs: [ReportTab, string][] = [["overview", "개요"], ["setup", "테스트 설정"], ["run", "실행 기록"], ["report", "결과 리포트"]];

function IntegratedStudyDetail({ study, setPage, goRun, initialTab }: { study: IntegratedStudy; setPage: Navigate; goRun: OpenRun; initialTab: ReportTab }) {
  const [tab, setTab] = useState<ReportTab>(initialTab);
  const complete = Boolean(study.run);
  const running = !complete && study.status === "실행 중";
  const report = complete ? reportFor(study) : null;
  const status = complete ? "분석 완료" : running ? "실행 중" : "실행 준비";
  const cta = complete ? "결과 리포트 보기" : running ? "실행 현황 보기" : "테스트 실행";
  const primaryAction = () => complete ? setTab("report") : goRun(study);
  return <>
    <Header title={study.name} subtitle="설정, AI 실행, 결과와 근거를 한곳에서 확인하세요." />
    <main className="page report integrated-detail">
      <button className="back" onClick={() => setPage("studies")}><ArrowLeft size={15} /> 모든 테스트</button>
      <div className="study-title"><div><span className={`study-icon ${complete ? "complete" : "running"}`}><FlaskConical size={20} /></span><section><div><h2>{study.name}</h2><Pill tone={complete ? "green" : "purple"} dot>{status}</Pill></div><p>{study.desc} · {study.version} · AI Persona {study.personas.length}명 · {study.updated} 업데이트</p></section></div><button className="primary" onClick={primaryAction}>{complete ? <ArrowRight size={15} /> : <Play size={15} />} {cta}</button></div>
      <div className="tabs" role="tablist" aria-label="테스트 상세">{detailTabs.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</div>
      {tab === "overview" && <div className="detail-overview">
        <section className="flow-card detail-lead"><div><small className="section-kicker">테스트 개요 · {status}</small><h3>{complete ? "분석을 마쳤습니다. 결과에서 근거까지 확인하세요." : "설정이 완료되었습니다. AI 테스트를 시작하세요."}</h3><p>{report ? `Ask 긍정 ${report.positive}명 · Act 과제 완료 ${report.complete}명 · 이탈 ${report.drops.length}명. 모두 동일한 AI Persona의 체험용 결과입니다.` : "AI Persona가 제품을 평가한 뒤 프로토타입에서 과제를 수행합니다. Ask와 Act 행동을 실행 화면에서 관찰할 수 있습니다."}</p></div><button className="primary" onClick={primaryAction}>{cta} <ArrowRight size={15} /></button></section>
        <div className="integrated-overview"><section className="flow-card"><h3>테스트 진행 흐름</h3><div className="overview-steps">{["제품·과제 설정", "AI Persona 생성", "Ask · Act 실행", "결과·근거 확인"].map((item, i) => <div key={item}><span>{i + 1}</span><b>{item}</b><small>{i < 2 || complete ? "완료" : i === 2 ? "다음 단계" : "실행 후 확인"}</small></div>)}</div></section><section className="flow-card"><h3>테스트 범위</h3><dl className="detail-facts"><div><dt>제품</dt><dd>{study.product.name}</dd></div><div><dt>과제</dt><dd>{study.task}</dd></div><div><dt>프로토타입</dt><dd>{study.screens.length}개 화면 · {study.screens[0]?.label} → {study.screens.find(s => s.id === study.goal)?.label}</dd></div><div><dt>AI 패널</dt><dd>{study.personas.length}명 · {OCCUPATIONS[study.panel.occupation]}</dd></div></dl></section></div>
      </div>}
      {tab === "setup" && <div className="integrated-overview"><section className="flow-card"><h3>제품 기획</h3><p>{study.product.description}</p><div className="trait-list">{study.product.features.map(f => <span key={f}>{f}</span>)}</div><p>가격 · {study.product.price || "미정"}</p></section><section className="flow-card"><h3>프로토타입과 과제</h3><p>과제 · {study.task}</p><p>시작 화면 · {study.screens[0]?.id} {study.screens[0]?.label}</p><p>목표 화면 · {study.goal} {study.screens.find(s => s.id === study.goal)?.label}</p><p>AI Persona · {study.personas.length}명</p><div className="link-list">{study.screens.map(s => <span key={s.id}>{s.id} {s.label}</span>)}</div></section></div>}
      {tab === "run" && <section className="flow-card detail-run"><h3>AI 실행 기록</h3><p>{complete ? "Persona별 Ask 판단과 Act 화면 이동, 이탈 이유를 다시 살펴보세요." : "테스트를 실행하면 각 Persona의 진행 상태와 행동 Timeline이 이곳에 연결됩니다."}</p><button className="primary" onClick={() => goRun(study)}>{complete ? "실행 과정 보기" : "테스트 실행"} <ArrowRight size={15} /></button></section>}
      {tab === "report" && <IntegratedReport study={study} openRun={personaId => goRun(study, personaId)} />}
    </main>
  </>;
}

function LegacyTestDetail({ study, setPage }: { study: Study; setPage: Navigate }) {
  const [tab, setTab] = useState("overview");
  const [drawer, setDrawer] = useState("");
  const [showExample, setShowExample] = useState(false);
  return <>
    <Header title={study.name} subtitle="기존 화면의 구성과 결과를 살펴보는 예시 테스트입니다." />
    <main className="page report integrated-detail">
      <button className="back" onClick={() => setPage("studies")}><ArrowLeft size={15} /> 모든 테스트</button>
      <div className="legacy-note">예시 데이터 · 이 항목의 인원과 분석 수치는 서비스 화면을 설명하기 위한 샘플이며, 현재 테스트의 실제 사용자 검증값이 아닙니다.</div>
      <div className="study-title"><div><span className="study-icon complete"><FlaskConical size={20} /></span><section><div><h2>{study.name}</h2><Pill tone="gray" dot>예시 데이터</Pill></div><p>{study.desc} · {study.version}</p></section></div><button className="primary" onClick={() => setTab("report")}>예시 리포트 보기 <ArrowRight size={15} /></button></div>
      <div className="tabs" role="tablist" aria-label="테스트 상세">{[["overview", "개요"], ["report", "예시 리포트"]].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</div>
      {tab === "overview" && <div className="integrated-overview"><section className="flow-card"><h3>테스트 정보</h3><p>{study.desc}</p><p>상태 · 예시 데이터</p><p>버전 · {study.version}</p><p>최근 업데이트 · {study.updated}</p></section><section className="flow-card"><h3>이 화면의 범위</h3><p>이 항목은 이전 디자인의 리포트 표현을 확인하기 위한 샘플입니다. 연결된 AI Persona 생성, Ask, Act 실행 기록은 없습니다.</p><button className="primary" onClick={() => setPage("create")}>+ 새 테스트</button></section></div>}
      {tab === "report" && <section className="flow-card legacy-example"><h3>과거 예시 리포트</h3><p>아래 수치는 샘플 UI 자료입니다. 실제 사용자의 측정값이나 PersonaLab의 검증 성능으로 해석하지 마세요.</p><button className="secondary" onClick={() => setShowExample(v => !v)} aria-expanded={showExample}>{showExample ? "예시 접기" : "예시 리포트 펼치기"}</button>{showExample && <ReportContent open={setDrawer} />}</section>}
      {drawer && <EvidenceDrawer title={drawer} close={() => setDrawer("")} />}
    </main>
  </>;
}

export default function ReportPage({ study, setPage, goRun, initialTab = "overview" }: { study: Study; setPage: Navigate; goRun: OpenRun; initialTab?: ReportTab }) {
  return isIntegratedStudy(study) ? <IntegratedStudyDetail study={study} setPage={setPage} goRun={goRun} initialTab={initialTab} /> : <LegacyTestDetail study={study} setPage={setPage} />;
}
