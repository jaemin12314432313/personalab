import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, CirclePause, CirclePlay, RotateCcw, Sparkles } from "lucide-react";
import Header from "../components/layout/Header";
import { buildRun, DROP_LABELS, money, OCCUPATIONS, TOOLS, TRAITS, visibleRun } from "../data/studyEngine";
import type { IntegratedStudy, Navigate, Study } from "../types";

const STATUS: Record<string, string> = { waiting: "대기", "ask-running": "Ask 진행", "ask-complete": "Ask 완료", "act-running": "Act 진행", complete: "완료", drop: "이탈", error: "오류" };
const screenLabel = (study: IntegratedStudy, id: string | null | undefined) => study.screens.find(s => s.id === id)?.label || id || "제품 소개";

export default function RunPage({ study, onUpdate, setPage, openReport, focusPersonaId }: { study: IntegratedStudy; onUpdate: (id: Study["id"], changes: Partial<Study>) => void; setPage: Navigate; openReport: () => void; focusPersonaId: string | null }) {
  const { results, frames } = useMemo(() => buildRun(study, study.run?.results), [study.id]);
  const [cursor, setCursor] = useState(study.run ? frames.length : 0);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(focusPersonaId || study.personas[0]?.persona_id);
  useEffect(() => { if (focusPersonaId) setSelectedId(focusPersonaId); }, [focusPersonaId]);
  const saved = useRef(Boolean(study.run));
  const live = useMemo(() => visibleRun(frames, cursor, study.personas), [frames, cursor, study.personas]);
  const selected = study.personas.find(p => p.persona_id === selectedId) || study.personas[0];
  const entry = live.entries[selected?.persona_id];
  const screenId = selectedId === live.currentId ? live.currentScreen : entry?.act.path.at(-1);
  const screen = study.screens.find(s => s.id === screenId);
  const isCurrent = selectedId === live.currentId;

  useEffect(() => {
    if (!playing || cursor >= frames.length) return;
    const timer = window.setTimeout(() => setCursor(n => n + 1), 530);
    return () => window.clearTimeout(timer);
  }, [playing, cursor, frames.length]);
  useEffect(() => {
    if (cursor > 0 && cursor < frames.length) setSelectedId(live.currentId);
  }, [cursor, frames.length, live.currentId]);
  useEffect(() => {
    if (cursor !== frames.length || !frames.length || saved.current) return;
    saved.current = true; setPlaying(false);
    onUpdate(study.id, { run: { results }, status: "분석 완료", tone: "complete", updated: "방금", ai: study.personas.length });
  }, [cursor, frames.length, onUpdate, results, study.id, study.personas.length]);
  const restart = () => { saved.current = false; onUpdate(study.id, { run: null, status: "실행 중", tone: "running" }); setCursor(0); setPlaying(true); setSelectedId(study.personas[0]?.persona_id); };
  const canReport = cursor === frames.length && frames.length > 0;
  const finishedCount = Object.values(live.entries).filter(item => ["complete", "drop", "error"].includes(item.status)).length;
  const lastEvent = entry?.act.events.at(-1);
  return <>
    <Header title="AI 검증 실행" subtitle="같은 Persona가 제품을 평가하고 프로토타입을 탐색합니다." />
    <main className="integrated-page run-page">
      <div className="flow-top"><button className="text-button" onClick={() => setPage("report")}><ArrowLeft size={16} /> 테스트 상세</button><span className="demo-mark">AI 행동 체험 시뮬레이션</span></div>
      <div className="run-summary"><div><small>테스트 제품</small><b>{study.product.name}</b><span>{study.product.description}</span></div><div><small>과제</small><b>{study.task}</b><span>시작 {screenLabel(study, study.screens[0]?.id)} · 목표 {screenLabel(study, study.goal)}</span></div><div><small>AI 패널</small><b>{study.personas.length}명</b><span>같은 인원이 Ask와 Act를 수행</span></div></div>
      <div className="run-progress"><div><span>준비</span><span className={live.phase === "ask" || live.phase === "act" || live.phase === "done" ? "on" : ""}>Ask · 제품 판단</span><span className={live.phase === "act" || live.phase === "done" ? "on" : ""}>Act · 행동 관찰</span><span className={live.phase === "done" ? "on" : ""}>분석 완료</span></div><progress max={frames.length} value={cursor} aria-label="분석 진행률" /><small>{cursor} / {frames.length}개 진행 상태 · {Math.round(cursor / Math.max(1, frames.length) * 100)}%</small></div>
      {canReport && <div className="run-complete" role="status"><CheckCircle2 size={20} /><div><b>모든 Persona의 분석이 끝났습니다.</b><span>개별 기록을 더 살펴보거나 리포트에서 전체 결과를 확인하세요.</span></div><button className="primary" onClick={openReport}>리포트 보기 <ArrowRight size={15} /></button></div>}
      <div className="run-toolbar"><button className="primary" onClick={() => { if (canReport) restart(); else setPlaying(v => !v); }}>{canReport ? <><RotateCcw size={16} /> 다시 실행</> : playing ? <><CirclePause size={16} /> 일시정지</> : <><CirclePlay size={16} /> {cursor ? "계속 실행" : "전체 실행 (Ask → Act)"}</>}</button><button className="secondary" disabled={playing || canReport} onClick={() => setCursor(n => Math.min(frames.length, n + 1))}>한 단계 보기</button><span>페르소나를 선택하면 해당 Ask·Act 기록을 확인할 수 있습니다.</span></div>
      <div className="run-columns">
        <div className="run-column-guide"><span>01 · Persona와 상태</span><span>02 · 현재 보는 화면</span><span>03 · Ask / Act 근거</span><small>{finishedCount} / {study.personas.length}명 완료 · 선택한 Persona의 기록을 함께 표시합니다.</small></div>
        <aside className="flow-card run-personas"><h3>Persona 목록</h3><p>현재 분석 중인 사용자가 강조됩니다.</p><div className="run-persona-list">{study.personas.map(p => { const item = live.entries[p.persona_id]; return <button key={p.persona_id} className={selectedId === p.persona_id ? "selected" : ""} onClick={() => setSelectedId(p.persona_id)} aria-pressed={selectedId === p.persona_id}><span className="mini-avatar">{p.persona_id.slice(-2)}</span><span><b>{p.persona_id}</b><small>{p.age}세 · {OCCUPATIONS[p.occupation]} · 가격 민감 {p.price_sensitivity.toFixed(2)}</small></span><em className={`run-status ${item.status}`}>{STATUS[item.status]}</em></button>; })}</div></aside>
        <section className="flow-card viewer-column"><div className="flow-card-head"><div><h3>Prototype Viewer</h3><p>{selected?.persona_id} · {screen ? `${screen.id} ${screen.label}` : "제품 정보를 읽는 중"}</p></div><span>{screenId === study.goal ? "목표 화면" : live.phase === "ask" && isCurrent ? "Ask" : "Act"}</span></div>
          <div className="phone-frame"><div className="phone-bar">9:41 <span>●●● ▰</span></div>{screen?.image ? <img className="phone-image" src={screen.image} alt={`${screen.label} 프로토타입`} /> : <div className="phone-body"><small>{screen?.id || "제품 소개"}</small><h4>{screen?.label || study.product.name}</h4><p>{screen?.description || study.product.description}</p>{!screen && <ul>{study.product.features.map(f => <li key={f}>{f}</li>)}</ul>}{screen && Array.from({ length: screen.fields || 0 }, (_, i) => <div className="phone-field" key={i} />)}</div>}<div className="phone-buttons">{screen?.elements.map(e => <span key={`${e.text}-${e.to}`} className={isCurrent && lastEvent?.target === e.text ? "chosen" : ""}>{e.text}</span>)}</div>{isCurrent && playing && <div className="phone-thinking"><Sparkles size={14} /> {live.phase === "ask" ? "제품을 읽는 중" : "화면을 보는 중"}</div>}{entry?.act.end?.result === "drop" && <div className="phone-drop">이탈 · {DROP_LABELS[entry.act.end.drop_reason ?? ""]}</div>}</div>
          <div className="path-strip" aria-label="프로토타입 화면 경로">{study.screens.map(s => <span key={s.id} className={entry?.act.path.includes(s.id) ? "visited" : ""}>{s.id === study.goal && "◎ "}{s.id} {s.label}</span>)}</div>
          <div className="viewer-caption">지난 화면 {entry?.act.path.length || 0}개 · 목표 {screenLabel(study, study.goal)}{lastEvent?.target && <> · 최근 선택 <b>{lastEvent.target}</b></>}</div>
        </section>
        <section className="flow-card evidence-column"><div className="flow-card-head"><div><h3>{selected?.persona_id} · Agent Analysis</h3><p>{selected?.age}세 {OCCUPATIONS[selected?.occupation]} · 현재 도구 {TOOLS[selected?.existing_tool]}</p></div><em className={`run-status ${entry?.status}`}>{STATUS[entry?.status] || "대기"}</em></div>
          <div className="trait-list">{selected?.traits.map(t => <span key={t}>#{TRAITS[t]}</span>)}</div>
          <h4>Ask · 제품에 대한 의견</h4>{entry?.ask ? <div className="ask-result"><div><b>사용 의향 {entry.ask.usage_intention}/5</b><b>{money(entry.ask.willingness_to_pay)}</b></div><p>우려 · {DROP_LABELS[entry.ask.concern]}</p><blockquote>“{entry.ask.reason}”</blockquote><small>필요한 기능: {entry.ask.needed_features.join(", ") || "없음"}</small><small>필요 없는 기능: {entry.ask.unneeded_features.join(", ") || "없음"}</small></div> : <p className="empty-copy">{entry?.status === "ask-running" ? "이 Persona가 제품 정보를 읽고 있습니다…" : "Ask 실행 후 의견과 이유가 나타납니다."}</p>}
          <h4>Act · 행동 Timeline</h4>{entry?.act.events.length ? <ol className="agent-timeline">{entry.act.events.map((event, i) => <li key={i}><small>TURN {event.turn} · {event.screen} {screenLabel(study, event.screen)}</small><b>{event.action === "click" ? `“${event.target}” 선택 → ${event.to} ${screenLabel(study, event.to)}` : "여기서 이탈"}</b><p>“{event.reason}”</p></li>)}</ol> : <p className="empty-copy">Act가 시작되면 선택한 버튼과 표현한 이유가 순서대로 기록됩니다.</p>}
          {entry?.act.end && <div className={`act-outcome ${entry.act.end.result}`}><b>{entry.act.end.result === "complete" ? "목표 화면 도달" : `${screenLabel(study, entry.act.end.screen)}에서 이탈`}</b><span>{entry.act.events.length}턴 · {entry.act.end.drop_reason ? DROP_LABELS[entry.act.end.drop_reason ?? ""] : screenLabel(study, study.goal)}</span></div>}
        </section>
      </div>
    </main>
  </>;
}
