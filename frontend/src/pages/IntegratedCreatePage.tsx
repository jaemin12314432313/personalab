import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ImagePlus, Plus, Trash2, Upload, WandSparkles } from "lucide-react";
import Header from "../components/layout/Header";
import { createDraft, extractPlanDemo, generatePersonas, OCCUPATIONS, optionKey, PANEL_LABELS, PANEL_OPTIONS, SAMPLE_SCREENS, TOOLS, TRAITS } from "../data/studyEngine";
import { clearSetupDraft, loadSetupDraft, saveSetupDraft } from "../data/setupDraft";
import type { DraftMeta, IntegratedStudy, Navigate, Panel, Product, Screen } from "../types";

const labels = ["제품 기획", "프로토타입", "AI 패널", "Persona 확인"];
const sampleScreens = () => SAMPLE_SCREENS.map(s => ({ ...s, elements: s.elements.map(e => ({ ...e })) }));
const readImage = (file: File): Promise<string> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("이미지 읽기 실패")); reader.onerror = reject; reader.readAsDataURL(file); });
const parseLinks = (value: string): Screen["elements"] => value.split(",").map(part => { const i = part.lastIndexOf(">"); return i < 0 ? null : { text: part.slice(0, i).trim(), to: part.slice(i + 1).trim().toUpperCase() }; }).filter((e): e is Screen["elements"][number] => Boolean(e?.text && /^S\d+$/.test(e.to)));
function canReachGoal(screens: Screen[], goal: string): boolean {
  const map = new Map<string, Screen>(screens.map(s => [s.id, s]));
  const queue: string[] = screens[0] ? [screens[0].id] : [], visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift();
    if (id === goal) return true;
    if (!id || visited.has(id) || !map.has(id)) continue;
    visited.add(id); queue.push(...map.get(id)!.elements.map(e => e.to));
  }
  return false;
}

export default function IntegratedCreatePage({ setPage, finish, onDraftMetaChange }: { setPage: Navigate; finish: (study: IntegratedStudy) => void; onDraftMetaChange: (meta: DraftMeta | null) => void }) {
  const [draft, setDraft] = useState(createDraft);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [ready, setReady] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const initialSnapshot = useRef<string | null>(null);
  const latest = useRef<{ draft: IntegratedStudy; step: number }>({ draft, step });
  const timer = useRef<number | null>(null);
  const finishing = useRef(false);
  latest.current = { draft, step };

  useEffect(() => {
    let active = true;
    loadSetupDraft().then(saved => {
      if (!active) return;
      if (saved) {
        setDraft(saved.draft);
        setStep(Math.max(0, Math.min(3, saved.step || 0)));
        setHasSavedDraft(true);
        setMessage("저장된 초안을 불러왔습니다. 이어서 작성하세요.");
        initialSnapshot.current = JSON.stringify({ draft: saved.draft, step: saved.step || 0 });
      } else {
        initialSnapshot.current = JSON.stringify(latest.current);
        onDraftMetaChange(null);
      }
      setReady(true);
      setSaveState("saved");
    }).catch(() => {
      if (!active) return;
      initialSnapshot.current = JSON.stringify(latest.current);
      setReady(true);
      setSaveState("error");
    });
    return () => { active = false; };
  }, [onDraftMetaChange]);

  useEffect(() => {
    if (!ready || finishing.current) return;
    const snapshot = JSON.stringify({ draft, step });
    if (snapshot === initialSnapshot.current) return;
    setSaveState("saving");
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      saveSetupDraft(draft, step).then(meta => {
        initialSnapshot.current = snapshot;
        setHasSavedDraft(true);
        setSaveState("saved");
        onDraftMetaChange(meta);
      }).catch(() => setSaveState("error"));
      timer.current = null;
    }, 450);
    return () => { if (timer.current !== null) clearTimeout(timer.current); };
  }, [draft, step, ready, onDraftMetaChange]);

  useEffect(() => () => {
    if (timer.current && !finishing.current) {
      clearTimeout(timer.current);
      saveSetupDraft(latest.current.draft, latest.current.step).then(onDraftMetaChange).catch(() => {});
    }
  }, [onDraftMetaChange]);

  async function startFresh() {
    if (!window.confirm("저장된 초안을 삭제하고 새 테스트를 시작할까요?")) return;
    setBusy(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    try {
      await clearSetupDraft();
      const fresh = createDraft();
      initialSnapshot.current = JSON.stringify({ draft: fresh, step: 0 });
      setDraft(fresh);
      setStep(0);
      setFileName("");
      setHasSavedDraft(false);
      setSaveState("saved");
      setMessage("새 테스트를 시작했습니다.");
      onDraftMetaChange(null);
    } catch {
      setMessage("초안을 지우지 못했습니다. 브라우저 저장소를 확인한 뒤 다시 시도하세요.");
    } finally { setBusy(false); }
  }

  async function completeSetup() {
    setBusy(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    try {
      finishing.current = true;
      await clearSetupDraft();
      onDraftMetaChange(null);
      finish({ ...draft, status: "실행 대기", updated: "방금", ai: draft.personas.length, tone: "running" });
    } catch {
      finishing.current = false;
      setBusy(false);
      setMessage("초안을 정리하지 못했습니다. 다시 시도해 주세요.");
    }
  }
  const patch = (change: Partial<IntegratedStudy>) => setDraft(s => ({ ...s, ...change }));
  const updateProduct = (change: Partial<Product>) => setDraft(s => ({ ...s, ...(change.name !== undefined ? { name: change.name } : {}), product: { ...s.product, ...change } }));
  const updatePanel = (change: Partial<Panel>) => setDraft(s => ({ ...s, panel: { ...s.panel, ...change }, personas: [] }));
  const updateScreens = (next: Screen[]) => patch({ screens: next, goal: next.some(s => s.id === draft.goal) ? draft.goal : next.at(-1)?.id || "" });
  const updateScreen = (id: string, change: Partial<Screen>) => updateScreens(draft.screens.map(s => s.id === id ? { ...s, ...change } : s));

  async function uploadPlan(file: File | undefined) {
    if (!file) return;
    setBusy(true); setFileName(file.name);
    try {
      if (/\.pdf$/i.test(file.name)) {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        const pages = [];
        for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
          const content = await (await doc.getPage(i)).getTextContent();
          pages.push(content.items.map(item => "str" in item ? item.str : "").join(" "));
        }
        if (!pages.join("").trim()) throw new Error("텍스트를 추출할 수 없는 PDF입니다. 스캔 이미지라면 내용을 직접 붙여넣으세요.");
        patch({ plan: pages.join("\n") });
        setMessage(`PDF ${doc.numPages}쪽에서 텍스트를 읽었습니다. 내용을 확인하세요.`);
      } else {
        patch({ plan: await file.text() });
        setMessage("문서를 읽었습니다. 내용을 확인하세요.");
      }
    } catch (error) { setMessage(`파일을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  }
  function organize() {
    if (!draft.plan.trim()) return setMessage("기획서 내용을 먼저 입력하세요.");
    setBusy(true); setMessage("기획서 정리 중…");
    window.setTimeout(() => {
      updateProduct(extractPlanDemo(draft.plan));
      setBusy(false);
      setMessage("체험용 정리를 마쳤습니다. 제품 정보를 검토하고 수정하세요. 실제 AI 추출은 아직 연결되지 않았습니다.");
    }, 350);
  }
  function loadSample(fromFigma = false) {
    if (fromFigma && !/figma\.com\/(?:file|design|proto)\//i.test(draft.figmaUrl)) return setMessage("Figma URL 형식을 확인하세요.");
    if (fromFigma) { setBusy(true); setMessage("프로토타입 화면을 불러오는 중…"); }
    const apply = () => { updateScreens(sampleScreens()); setMessage(fromFigma ? "데모 모드: Figma 파일 대신 일정메이트 샘플을 불러왔습니다." : "샘플 화면 5개를 불러왔습니다."); setBusy(false); };
    if (fromFigma) window.setTimeout(apply, 450); else apply();
  }
  async function addImages(files: FileList | File[]) {
    if (!files.length) return;
    setBusy(true);
    try {
      const added = await Promise.all([...files].map(async file => ({ label: file.name.replace(/\.[^.]+$/, ""), description: "", fields: 0, image: await readImage(file), elements: [] })));
      updateScreens([...draft.screens, ...added].map((s, i) => ({ ...s, id: `S${String(i + 1).padStart(2, "0")}` })));
      setMessage(`이미지 ${added.length}장을 추가했습니다.`);
    } catch { setMessage("이미지를 읽지 못했습니다."); }
    finally { setBusy(false); }
  }
  function removeScreen(id: string) {
    const remaining = draft.screens.filter(s => s.id !== id);
    const mapping = Object.fromEntries(remaining.map((s, i) => [s.id, `S${String(i + 1).padStart(2, "0")}`]));
    patch({ screens: remaining.map(s => { const elements = s.elements.filter(e => mapping[e.to]).map(e => ({ ...e, to: mapping[e.to] })); return { ...s, id: mapping[s.id], elements, linksDraft: elements.map(e => `${e.text}>${e.to}`).join(", ") }; }), goal: mapping[draft.goal] || mapping[remaining.at(-1)?.id ?? ""] || "" });
  }
  function next() {
    if (busy) return;
    setMessage("");
    if (step === 0 && (!draft.product.name.trim() || !draft.product.description.trim())) return setMessage("제품명과 설명을 입력하세요.");
    if (step === 1 && (!draft.screens.length || !draft.task.trim() || !draft.goal)) return setMessage("화면, 과제, 목표 화면을 확인하세요.");
    if (step === 1 && draft.screens.some(s => s.elements.some(e => !draft.screens.some(target => target.id === e.to)))) return setMessage("버튼 연결의 도착 화면 번호를 확인하세요.");
    if (step === 1 && !canReachGoal(draft.screens, draft.goal)) return setMessage("첫 화면에서 목표 화면까지 이어지는 버튼 연결을 만들어 주세요.");
    if (step === 2) { setBusy(true); setMessage("설정한 범위에서 Persona를 생성하는 중…"); window.setTimeout(() => { patch({ personas: generatePersonas(draft) }); setBusy(false); setMessage(""); setStep(3); }, 350); return; }
    if (step === 3) return completeSetup();
    setStep(step + 1);
  }
  if (!ready) return <><Header title="새 테스트" subtitle="저장된 설정을 확인하고 있습니다." /><main className="integrated-page setup-page"><section className="flow-card" role="status">작성 중인 테스트를 불러오는 중…</section></main></>;
  return <>
    <Header title="새 테스트" subtitle="제품, 프로토타입, AI 패널을 한 흐름에서 준비하세요." />
    <main className="integrated-page setup-page">
      <div className="flow-top"><button className="text-button" onClick={() => setPage("studies")}><ArrowLeft size={16} /> 테스트 목록</button><div className="setup-save-actions"><span className={`setup-save-status ${saveState}`} role="status">{!ready ? "초안 확인 중…" : saveState === "saving" ? "초안 저장 중…" : saveState === "error" ? "자동 저장 실패" : hasSavedDraft ? "초안 자동 저장됨 · 이 브라우저" : "입력하면 자동 저장됩니다"}</span>{hasSavedDraft && <button className="text-button" disabled={busy} onClick={startFresh}>새로 시작</button>}<span className="demo-mark">AI 시뮬레이션 · 데모 데이터</span></div></div>
      <ol className="flow-steps" aria-label="테스트 생성 단계">{labels.map((label, i) => <li key={label} className={i === step ? "active" : i < step ? "done" : ""}><span>{i < step ? <Check size={14} /> : i + 1}</span><b>{label}</b></li>)}</ol>
      <div className="flow-heading"><p>STEP {step + 1} / 4</p><h2>{labels[step]}</h2><span>{["AI Persona가 읽을 제품 정보를 준비합니다.", "Agent가 탐색할 화면과 이동 경로를 설정합니다.", "테스트에 참여할 AI 사용자의 범위를 고릅니다.", "생성된 사용자를 확인한 뒤 테스트를 시작합니다."][step]}</span></div>
      {message && <div className="flow-message" role="status">{message}</div>}
      {step === 0 && <div className="setup-grid">
        <section className="flow-card"><h3>제품 기획서</h3><p>내용을 직접 입력하거나 파일을 올리세요.</p><label htmlFor="plan-text">기획서 내용</label><textarea id="plan-text" rows={10} value={draft.plan} onChange={e => patch({ plan: e.target.value })} />
          <div className="flow-actions"><label className="secondary file-button"><Upload size={15} /> .txt · .md · .pdf<input type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" hidden onChange={e => uploadPlan(e.target.files?.[0])} /></label><button className="primary" disabled={busy} onClick={organize}><WandSparkles size={15} /> AI로 정리</button></div>
          {fileName && <small className="subtle">선택한 파일: {fileName}</small>}<p className="demo-note">현재는 체험용 텍스트 정리입니다. 결과를 직접 수정할 수 있습니다.</p></section>
        <section className="flow-card"><h3>제품 정보</h3><p>이 내용이 각 Persona의 Ask 판단에 사용됩니다.</p>
          <label htmlFor="product-name">제품명 *</label><input id="product-name" value={draft.product.name} onChange={e => updateProduct({ name: e.target.value })} />
          <label htmlFor="product-desc">설명 *</label><textarea id="product-desc" rows={3} value={draft.product.description} onChange={e => updateProduct({ description: e.target.value })} />
          <label htmlFor="product-features">기능 · 한 줄에 하나</label><textarea id="product-features" rows={5} value={draft.product.features.join("\n")} onChange={e => updateProduct({ features: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })} />
          <label htmlFor="product-price">가격</label><input id="product-price" value={draft.product.price} onChange={e => updateProduct({ price: e.target.value })} />
          <div className="product-preview"><small>AI PERSONA가 읽는 제품 소개</small><h4>{draft.product.name || "제품명"}</h4><p>{draft.product.description || "제품 설명이 여기에 표시됩니다."}</p><div>{draft.product.features.map(f => <span key={f}>{f}</span>)}</div><b>{draft.product.price || "가격 미정"}</b></div>
        </section>
      </div>}
      {step === 1 && <section className="flow-card"><div className="flow-card-head"><div><h3>프로토타입 화면</h3><p>첫 화면에서 시작합니다. 버튼 연결은 <code>버튼명&gt;S02</code> 형식입니다.</p></div><span>{draft.screens.length}개 화면</span></div>
        <div className="figma-row"><label htmlFor="figma-url">Figma URL</label><div><input id="figma-url" value={draft.figmaUrl} placeholder="https://www.figma.com/design/…" onChange={e => patch({ figmaUrl: e.target.value })} /><button className="secondary" disabled={busy} onClick={() => draft.figmaUrl.trim() ? loadSample(true) : setMessage("Figma URL을 입력하세요.")}>{busy ? "불러오는 중…" : "Figma 불러오기"}</button></div><small className="subtle">실제 Figma 연결 전입니다. 체험 모드에서는 샘플 화면을 불러옵니다.</small></div>
        <div className="flow-actions"><label className="secondary file-button"><ImagePlus size={15} /> 이미지 여러 장<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={e => addImages(e.target.files || [])} /></label><button className="secondary" onClick={() => updateScreens([...draft.screens, { id: `S${String(draft.screens.length + 1).padStart(2, "0")}`, label: "새 화면", description: "", fields: 0, image: null, elements: [] }])}><Plus size={15} /> 빈 화면</button><button className="secondary" onClick={() => loadSample()}>샘플(일정메이트)</button></div>
        <div className="screen-grid">{draft.screens.map((screen, i) => <article className="screen-card" key={screen.id}><div className="screen-card-head"><b>{screen.id}{i === 0 && <em>시작</em>}{screen.id === draft.goal && <em>목표</em>}</b><button className="icon-btn" aria-label={`${screen.id} 삭제`} onClick={() => removeScreen(screen.id)}><Trash2 size={15} /></button></div><label className="screen-thumb">{screen.image ? <img src={screen.image} alt={`${screen.label} 화면`} /> : <span><ImagePlus size={19} /> 이미지 추가</span>}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={async e => { if (e.target.files?.[0]) updateScreen(screen.id, { image: await readImage(e.target.files[0]) }); }} /></label><label>화면 이름<input value={screen.label} onChange={e => updateScreen(screen.id, { label: e.target.value })} /></label><label>설명<input value={screen.description} onChange={e => updateScreen(screen.id, { description: e.target.value })} /></label><label>버튼 연결<input value={screen.linksDraft ?? screen.elements.map(e => `${e.text}>${e.to}`).join(", ")} onChange={e => updateScreen(screen.id, { linksDraft: e.target.value, elements: parseLinks(e.target.value) })} placeholder="다음>S02" /></label><div className="link-list">{screen.elements.map((e, j) => <span key={`${e.text}-${j}`}>{e.text} → {e.to}</span>)}</div></article>)}</div>
        <div className="setup-grid task-grid"><label>AI Persona 과제<input value={draft.task} onChange={e => patch({ task: e.target.value, desc: `${e.target.value} 검증` })} /></label><label>목표 화면<select value={draft.goal} onChange={e => patch({ goal: e.target.value })}>{draft.screens.map(s => <option key={s.id} value={s.id}>{s.id} · {s.label}</option>)}</select></label></div><p className="prototype-check">{draft.screens[0]?.id} {draft.screens[0]?.label}에서 {draft.goal} {draft.screens.find(s => s.id === draft.goal)?.label}까지 · 연결 {draft.screens.reduce((n, s) => n + s.elements.length, 0)}개 · {canReachGoal(draft.screens, draft.goal) ? "목표 화면 도달 가능" : "연결 확인 필요"}</p>
      </section>}
      {step === 2 && <section className="flow-card"><h3>AI 패널 조건</h3><p>고른 범위에서 서로 다른 사용자를 생성합니다. 실제 인구 분포를 대표하지는 않습니다.</p><div className="panel-options">{(Object.keys(PANEL_OPTIONS) as (keyof Panel)[]).map(key => <fieldset key={key}><legend>{PANEL_LABELS[key]}</legend><div className="segmented">{PANEL_OPTIONS[key].map(([value, label]) => <button type="button" key={optionKey(value)} className={optionKey(draft.panel[key]) === optionKey(value) ? "on" : ""} aria-pressed={optionKey(draft.panel[key]) === optionKey(value)} onClick={() => updatePanel({ [key]: value } as Partial<Panel>)}>{label}</button>)}</div></fieldset>)}</div></section>}
      {step === 3 && <section className="flow-card"><div className="flow-card-head"><div><span className="section-kicker">AI RESEARCH PANEL</span><h3>생성된 Persona</h3><p>같은 사용자들이 Ask와 Act를 모두 수행합니다.</p></div><button className="secondary" onClick={() => { const generation = (draft.generation || 0) + 1; patch({ generation, personas: generatePersonas({ ...draft, generation }) }); }}>다시 생성</button></div><div className="persona-grid">{draft.personas.map(p => <article className="persona-card" key={p.persona_id}><div className="persona-head"><span>{p.persona_id.slice(-2)}</span><div><small>AI PARTICIPANT</small><b>{p.persona_id}</b></div><em>{p.age}세 · {OCCUPATIONS[p.occupation]}</em></div><div className="trait-list">{p.traits.length ? p.traits.map(t => <span key={t}>#{TRAITS[t]}</span>) : <span>일반 사용자</span>}</div><p className="persona-context">현재 도구 <b>{TOOLS[p.existing_tool]}</b></p><div className="persona-metrics">{[["앱 사용 빈도", p.app_usage_freq], ["가격 민감도", p.price_sensitivity], ["디지털 수용도", p.digital_adoption]].map(([label, value]) => <div className="persona-meter" key={label}><span>{label}</span><b>{Number(value).toFixed(2)}</b></div>)}</div></article>)}</div></section>}
      <div className="flow-footer"><button className="secondary" disabled={busy || !ready} onClick={() => step ? (setMessage(""), setStep(step - 1)) : setPage("studies")}>{step ? "이전 단계" : "목록으로"}</button><button className="primary" disabled={busy || !ready} onClick={next}>{busy ? "처리 중…" : step === 2 ? "Persona 생성·확인" : step === 3 ? "AI 테스트로 이동" : "다음 단계"} <ArrowRight size={16} /></button></div>
    </main>
  </>;
}
