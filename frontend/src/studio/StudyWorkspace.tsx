import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, FileText, Layers3, PanelRightOpen, Play, Settings2, Sparkles, Users, X } from "lucide-react";
import type { Study } from "./model";

const sections = [
  { title: "제품 소개", detail: "제품 설명과 주요 기능", icon: FileText },
  { title: "프로토타입과 과제", detail: "화면 연결과 목표 설정", icon: Layers3 },
  { title: "페르소나 패널", detail: "대상과 인원 구성", icon: Users },
];

export default function StudyWorkspace({ study, step, go, home, connection, save, children }: {
  study: Study; step: number; go: (step: number) => void; home: () => void;
  connection: () => void; save: () => void; children: ReactNode;
}) {
  const [guide, setGuide] = useState(true);
  const [preview, setPreview] = useState(false);
  const checks = step === 1 ? [
    { text: "제품 이름을 입력했나요?", done: Boolean(study.product.name.trim()) },
    { text: "누구의 어떤 문제를 해결하나요?", done: Boolean(study.product.description.trim()) },
    { text: "주요 기능을 한 가지 이상 적었나요?", done: study.product.features.some(f => f.trim()) },
  ] : step === 2 ? [
    { text: "탐색할 화면이 준비되었나요?", done: study.screens.length > 0 },
    { text: "수행할 과제가 정해졌나요?", done: Boolean(study.task.trim()) },
    { text: "목표 화면을 지정했나요?", done: Boolean(study.goal) },
  ] : [
    { text: "대상 집단을 선택했나요?", done: Boolean(study.conditions.preset) },
    { text: "패널 인원을 정했나요?", done: study.count > 0 },
    { text: "페르소나 패널이 준비되었나요?", done: study.personas.length > 0 },
  ];
  const changeStep = (n: number) => { setPreview(false); go(n); };
  return <div className="vs-backdrop"><div className={`vs-workspace ${guide ? "" : "vs-guide-hidden"}`}>
    <header className="vs-toolbar">
      <nav aria-label="테스트 작업"><button className={step <= 3 ? "active" : ""} onClick={() => changeStep(1)}>만들기</button><button className={step === 4 ? "active" : ""} disabled={!study.personas.length} onClick={() => changeStep(4)}>실행</button><button className={step === 5 ? "active" : ""} disabled={!study.results.length} onClick={() => changeStep(5)}>결과</button></nav>
      <strong>{study.product.name ? `${study.product.name} 테스트` : "새로운 테스트"}</strong>
      <div className="vs-toolbar-actions"><button className="vs-icon-button" onClick={connection} aria-label="실행 서버 설정"><Settings2 size={18} /></button><button className="vs-icon-button" onClick={() => setGuide(v => !v)} aria-label={guide ? "도우미 닫기" : "도우미 열기"}><PanelRightOpen size={18} /></button><button className="vs-save" onClick={save}>저장하기</button></div>
    </header>
    <div className="vs-workspace-body">
      <aside className="vs-sidebar"><div className="vs-sidebar-title"><h2>테스트 구성</h2><button className="vs-icon-button" onClick={home} aria-label="테스트 목록으로"><ArrowLeft size={17} /></button></div><p className="vs-sidebar-caption">제품부터 페르소나까지</p><nav aria-label="테스트 설정 단계">{sections.map((s, i) => <button key={s.title} className={step === i + 1 ? "active" : ""} aria-current={step === i + 1 ? "step" : undefined} onClick={() => changeStep(i + 1)}><span className={`vs-section-icon section-${i}`}><s.icon size={15} /><b>{i + 1}</b></span><span>{s.title}<small>{s.detail}</small></span></button>)}</nav><div className="vs-sidebar-divider" /><button className={`vs-sidebar-link ${step === 4 ? "active" : ""}`} disabled={!study.personas.length} onClick={() => changeStep(4)}><Play size={16} />Ask · Act 실행</button><button className={`vs-sidebar-link ${step === 5 ? "active" : ""}`} disabled={!study.results.length} onClick={() => changeStep(5)}><Layers3 size={16} />결과 리포트</button><div className="vs-sidebar-foot"><button onClick={home}>PersonaLab <ArrowRight size={14} /></button><span>제품을 이해하는 또 하나의 시선</span></div></aside>
      <section className="vs-editor"><div className="vs-editor-tabs"><div><button className={!preview ? "active" : ""} onClick={() => setPreview(false)}>편집</button><button className={preview ? "active" : ""} onClick={() => setPreview(true)}>테스트 요약</button></div><span><Check size={13} />브라우저에 저장</span></div><div className="vs-editor-scroll">{preview ? <StudySummary study={study} /> : children}</div></section>
      {guide && <aside className="vs-assistant"><header><h2>도우미</h2><button className="vs-icon-button" onClick={() => setGuide(false)} aria-label="도우미 닫기"><X size={18} /></button></header><div className="vs-assistant-request"><span className="vs-guide-thumb"><FileText size={24} /><i /><i /><i /></span><p>{step === 1 ? "페르소나가 제품을 잘 이해하도록 소개해 주세요." : step === 2 ? "페르소나가 어떤 과제를 수행할지 정해 주세요." : step === 3 ? "제품을 살펴볼 페르소나를 구성해 주세요." : "같은 페르소나의 의견과 탐색 기록을 함께 살펴보세요."}</p></div><span className="vs-guide-label">{step <= 3 ? "입력 체크리스트" : "테스트 준비 상태"}</span><ul className="vs-guide-checks">{checks.map(c => <li key={c.text} className={c.done ? "complete" : ""}><span>{c.done ? <Check size={13} /> : <span className="vs-check-empty" />}</span>{c.text}</li>)}</ul><div className="vs-guide-note"><Sparkles size={16} /><p>{step === 1 ? "기능 이름만 나열하기보다, 사용자가 얻게 될 변화를 구체적으로 적으면 좋습니다." : step === 2 ? "과제는 ‘회원가입을 완료하세요’처럼 결과가 분명한 한 문장으로 적어 주세요." : "AI의 응답과 탐색 기록은 실제 사용자 조사와 구분해 읽어 주세요."}</p></div><button className="vs-assistant-link" onClick={connection}>실행 연결 상태 확인 <ArrowRight size={14} /></button><p className="vs-guide-disclosure">입력 내용을 확인하는 설정 가이드입니다.</p></aside>}
    </div>
  </div></div>;
}

function StudySummary({ study }: { study: Study }) {
  return <div className="vs-summary"><span>TEST OVERVIEW</span><h1>{study.product.name || "새로운 테스트"}</h1><p>{study.product.description || "제품 설명을 입력하면 여기에 표시됩니다."}</p><h2>주요 기능</h2><ul>{study.product.features.filter(Boolean).map((f, i) => <li key={i}>{f}</li>)}</ul><h2>수행할 과제</h2><p>{study.task || "과제를 설정해 주세요."}</p><div className="vs-summary-meta"><span>프로토타입<strong>{study.screens.length}개 화면</strong></span><span>페르소나<strong>{study.personas.length || study.count}명{!study.personas.length && " 예정"}</strong></span></div></div>;
}

export function WorkspacePreview({ open }: { open: () => void }) {
  const [selected, setSelected] = useState(0);
  const [guide, setGuide] = useState(true);
  const [name, setName] = useState("일정메이트");
  const [description, setDescription] = useState("흩어진 일정을 한곳에 모아, 오늘 해야 할 일을 더 쉽게 정리할 수 있는 서비스입니다.");
  return <div className="vs-preview-backdrop"><div className={`vs-workspace vs-preview ${guide ? "" : "vs-guide-hidden"}`}>
    <header className="vs-toolbar"><nav><button className="active" onClick={() => setSelected(0)}>만들기</button><button onClick={open}>실행</button><button onClick={open}>결과</button></nav><strong>일정메이트 테스트</strong><div className="vs-toolbar-actions"><button className="vs-icon-button" onClick={() => setGuide(v => !v)} aria-label="도우미 표시 전환"><PanelRightOpen size={16} /></button><button className="vs-save" onClick={open}>테스트 열기</button></div></header>
    <div className="vs-workspace-body"><aside className="vs-sidebar"><div className="vs-sidebar-title"><h2>테스트 구성</h2><span className="vs-preview-badge">미리보기</span></div><p className="vs-sidebar-caption">제품부터 페르소나까지</p><nav>{sections.map((s, i) => <button key={s.title} className={selected === i ? "active" : ""} onClick={() => setSelected(i)}><span className={`vs-section-icon section-${i}`}><s.icon size={14} /><b>{i + 1}</b></span><span>{s.title}</span></button>)}</nav><div className="vs-sidebar-divider" /><button className="vs-sidebar-link" onClick={open}><Play size={15} />Ask · Act 실행</button><button className="vs-sidebar-link" onClick={open}><Layers3 size={15} />결과 리포트</button></aside>
    <section className="vs-editor"><div className="vs-editor-tabs"><button className="active">편집</button><span>직접 눌러보세요</span></div><div className="vs-preview-form"><h2>{sections[selected].title}</h2>{selected === 0 ? <><div className="vs-preview-type"><span><Sparkles size={15} />제품 소개</span><ChevronDown size={15} /></div><label>제품 이름<input value={name} onChange={e => setName(e.target.value)} /></label><label>제품 설명<textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} /></label><div className="vs-preview-tip">대상 사용자와 해결하려는 문제를 함께 적어 주세요.</div><label>주요 기능<div className="vs-feature-list"><span>자동 일정 정리</span><span>캘린더 연동</span><span>우선순위 추천</span></div></label></> : selected === 1 ? <><label>수행할 과제<input readOnly value="회원가입을 완료하세요" /></label><div className="vs-preview-screens">{["온보딩", "회원가입", "학교·학년", "관심분야", "홈"].map((s, i) => <div key={s}><span>S0{i + 1}</span><strong>{s}</strong><ArrowRight size={14} /></div>)}</div></> : <><label>대상 집단<input readOnly value="직장인 패널" /></label><label>저장된 데모 패널<div className="vs-preview-people">{["P938 · 32세", "P069 · 29세", "P392 · 27세", "P563 · 34세", "P374 · 27세"].map(p => <div key={p}><Users size={14} />{p}</div>)}</div></label></>}</div></section>
    {guide && <aside className="vs-assistant"><header><h2>도우미</h2><button className="vs-icon-button" onClick={() => setGuide(false)} aria-label="미리보기 도우미 닫기"><X size={17} /></button></header><div className="vs-assistant-request"><span className="vs-guide-thumb"><FileText size={23} /><i /><i /></span><p>{selected === 0 ? "새로운 일정 관리 서비스를 검증하고 싶어요." : selected === 1 ? "회원가입 과정에서 어디서 멈추는지 확인하고 싶어요." : "이 서비스를 살펴볼 페르소나를 구성하고 싶어요."}</p></div><ul className="vs-guide-checks"><li className="complete"><Check size={14} />{selected === 0 ? "제품 소개와 주요 기능 준비" : selected === 1 ? "프로토타입 5개 화면 연결" : "데모 페르소나 5명 준비"}</li><li><FileText size={14} />{selected === 0 ? "프로토타입과 과제 설정하기" : "Ask · Act 기록 함께 살펴보기"}</li></ul><button className="vs-assistant-link" onClick={open}>저장된 데모 열기 <ArrowRight size={14} /></button></aside>}
    </div></div></div>;
}
