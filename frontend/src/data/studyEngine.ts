import type { ActEvent, ActResult, AskResult, IntegratedStudy, Panel, Persona, PersonaResult, RunData, RunFrame, Screen, Study } from "../types";

export const SAMPLE_PLAN = `일정메이트는 대학생의 수업, 과제, 동아리 일정을 한곳에서 정리합니다.\n자동 정리, 우선순위 추천, 캘린더 연동, 친구 공유, 알림 설정을 제공합니다. 기본 기능은 무료입니다.`;

export const SAMPLE_SCREENS: Screen[] = [
  { id: "S01", label: "온보딩", description: "일정을 자동으로 정리하고 오늘 할 일의 우선순위를 추천해 드려요.", fields: 0, image: null, elements: [{ text: "시작하기", to: "S02" }] },
  { id: "S02", label: "회원가입", description: "이메일, 비밀번호, 휴대폰 번호 인증이 필요해요.", fields: 3, image: null, elements: [{ text: "다음", to: "S03" }, { text: "뒤로", to: "S01" }] },
  { id: "S03", label: "학교·학년", description: "학교명, 학년, 전공을 알려주세요.", fields: 3, image: null, elements: [{ text: "다음", to: "S04" }, { text: "건너뛰기", to: "S04" }] },
  { id: "S04", label: "관심분야 선택", description: "관심분야를 5개 이상 골라주세요.", fields: 4, image: null, elements: [{ text: "완료", to: "S05" }, { text: "건너뛰기", to: "S05" }] },
  { id: "S05", label: "홈", description: "오늘의 일정과 추천 우선순위", fields: 0, image: null, elements: [] },
];

export const PANEL_OPTIONS: { [K in keyof Panel]: Array<[Panel[K], string]> } = {
  count: [[3, "3명"], [5, "5명"], [10, "10명"]],
  occupation: [["university_student", "대학생"], ["office_worker", "직장인"]],
  age: [[[20, 24], "20~24"], [[20, 29], "20대"], [[25, 34], "25~34"]],
  app_usage: [[[0.1, 0.5], "낮음"], [[0.4, 0.8], "중간"], [[0.6, 1], "높음"], [[0.2, 0.95], "전체"]],
  price_sensitivity: [[[0.1, 0.5], "낮음"], [[0.4, 0.8], "중간"], [[0.6, 1], "높음"], [[0.2, 0.95], "전체"]],
  digital_adoption: [[[0.1, 0.5], "낮음"], [[0.4, 0.8], "중간"], [[0.6, 1], "높음"], [[0.3, 0.95], "전체"]],
};

export const PANEL_LABELS: Record<keyof Panel, string> = { count: "인원", occupation: "소속", age: "연령", app_usage: "앱 사용 빈도", price_sensitivity: "가격 민감도", digital_adoption: "디지털 수용도" };
export const OCCUPATIONS: Record<string, string> = { university_student: "대학생", office_worker: "직장인" };
export const TOOLS: Record<string, string> = { google_calendar: "구글 캘린더", notion: "노션", naver_calendar: "네이버 캘린더", paper_planner: "종이 플래너", none: "없음" };
export const TRAITS: Record<string, string> = { productivity_app_user: "생산성 앱 사용자", early_adopter: "새 앱 먼저 사용", budget_tight: "예산 빠듯", privacy_conscious: "개인정보 민감", time_sensitive: "시간에 쫓김", form_averse: "입력 부담" };
export const DROP_LABELS: Record<string, string> = { UNCLEAR_PURPOSE: "서비스 목적이 불분명함", TOO_MANY_STEPS: "단계·입력 항목이 많음", PRIVACY: "개인정보 요구가 부담됨", PRICE: "가격 부담", TRUST: "신뢰하기 어려움", FEATURE_MISSING: "필요한 기능이 없음", SWITCHING_COST: "기존 도구에서 옮기기 어려움", NAVIGATION_LOST: "다음 경로를 찾기 어려움", MAX_TURNS: "행동 횟수 상한" };

const hash = (value: string) => [...String(value)].reduce((n, c) => ((n * 31 + c.charCodeAt(0)) >>> 0), 7);
const rng = (seed: number) => { let n = seed || 1; return () => ((n = (1664525 * n + 1013904223) >>> 0) / 4294967296); };
const between = (random: () => number, [lo, hi]: number[]) => Math.round((lo + random() * (hi - lo)) * 100) / 100;
export const optionKey = (value: unknown) => JSON.stringify(value);
export const percent = (n: number, d: number) => d ? Math.round(n / d * 100) : 0;
export const money = (value: number) => value ? `${Number(value).toLocaleString("ko-KR")}원` : "지불 의향 없음";

export function createDraft(): IntegratedStudy {
  return {
    id: `study-${Date.now()}`, name: "일정메이트", desc: "회원가입 온보딩 흐름 검증", version: "v1", status: "설정 중", updated: "방금", ai: 0, real: 0, tone: "draft", integrated: true,
    plan: SAMPLE_PLAN,
    product: { name: "일정메이트", description: "흩어진 일정을 한곳에 모아 오늘 할 일의 우선순위를 추천하는 앱", features: ["자동 정리", "우선순위 추천", "캘린더 연동", "친구 공유", "알림 설정"], price: "기본 무료" },
    figmaUrl: "", generation: 0, screens: SAMPLE_SCREENS.map(s => ({ ...s, elements: s.elements.map(e => ({ ...e })) })), task: "회원가입을 완료하세요", goal: "S05",
    panel: { count: 5, occupation: "university_student", age: [20, 29], app_usage: [0.2, 0.95], price_sensitivity: [0.6, 1], digital_adoption: [0.3, 0.95] }, personas: [], run: null,
  };
}

export function extractPlanDemo(text: string) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const name = lines[0]?.replace(/^\[?(서비스 )?기획서\]?\s*[:：]?\s*/, "").split(/[은는:：]/)[0].trim() || "새 제품";
  const candidates = ["자동 정리", "우선순위 추천", "캘린더 연동", "친구 공유", "알림 설정"].filter(f => text.includes(f));
  return { name, description: lines.slice(0, 2).join(" ").slice(0, 180), features: candidates.length ? candidates : lines.filter(s => /^[-•]/.test(s)).map(s => s.replace(/^[-•]\s*/, "")).slice(0, 8), price: /무료/.test(text) ? "기본 무료" : /유료|구독/.test(text) ? "유료" : "" };
}

export function generatePersonas(study: IntegratedStudy): Persona[] {
  const { panel } = study; const random = rng(hash(study.product.name + JSON.stringify(panel) + String(study.generation || 0)));
  const ids = new Set<string>(); const tools = Object.keys(TOOLS);
  return Array.from({ length: panel.count }, () => {
    let id; do { id = `P${String(1 + Math.floor(random() * 999)).padStart(3, "0")}`; } while (ids.has(id)); ids.add(id);
    const app_usage_freq = between(random, panel.app_usage), price_sensitivity = between(random, panel.price_sensitivity), digital_adoption = between(random, panel.digital_adoption);
    const traits = [app_usage_freq >= .75 && "productivity_app_user", digital_adoption >= .85 && "early_adopter", price_sensitivity >= .7 && "budget_tight", digital_adoption < .55 && "privacy_conscious", random() < .4 && "time_sensitive", random() < .3 && "form_averse"].filter((trait): trait is string => typeof trait === "string");
    return { persona_id: id, age: panel.age[0] + Math.floor(random() * (panel.age[1] - panel.age[0] + 1)), occupation: panel.occupation, app_usage_freq, price_sensitivity, digital_adoption, existing_tool: tools[Math.floor(random() * tools.length)], traits };
  });
}

function askFor(persona: Persona, study: IntegratedStudy): AskResult {
  const score = Math.max(1, Math.min(5, Math.round(3.1 + persona.app_usage_freq * 1.3 + persona.digital_adoption * .8 - persona.price_sensitivity * .6)));
  const concern = persona.traits.includes("privacy_conscious") ? "PRIVACY" : persona.price_sensitivity > .8 ? "PRICE" : "TOO_MANY_STEPS";
  const needed_features = study.product.features.filter((_, i) => (i + Math.floor(persona.app_usage_freq * 10)) % 3 !== 0).slice(0, 3);
  const unneeded_features = study.product.features.filter(f => !needed_features.includes(f)).slice(0, 2);
  const reason = concern === "PRIVACY" ? "기능은 편리해 보이지만 개인정보를 얼마나 요구하는지 먼저 보고 싶어요." : concern === "PRICE" ? "일정 관리에는 도움이 되겠지만 가격을 보고 계속 쓸지 결정할 것 같아요." : "필요한 기능은 있어 보여요. 가입 과정이 너무 길지 않으면 써볼게요.";
  return { usage_intention: score, willingness_to_pay: score >= 4 && persona.price_sensitivity < .8 ? 4900 : 0, concern, needed_features, unneeded_features, reason };
}

function actFor(persona: Persona, study: IntegratedStudy, index: number): ActResult {
  const byId: Record<string, Screen> = Object.fromEntries(study.screens.map(s => [s.id, s]));
  const events: ActEvent[] = [], path: string[] = []; let current: string | undefined = study.screens[0]?.id; let end: ActResult["end"] | null = null;
  for (let turn = 0; turn < 10 && current; turn++) {
    const screen: Screen = byId[current]; path.push(current);
    if (current === study.goal) { end = { result: "complete", screen: current }; break; }
    const privacy = persona.traits.includes("privacy_conscious") && /개인정보|휴대폰|인증/.test(screen.description);
    const form = persona.traits.includes("form_averse") && (screen.fields || 0) >= 3;
    const steps = persona.traits.includes("time_sensitive") && turn >= 2 && (screen.fields || 0) >= 3;
    const cautious = persona.price_sensitivity >= .7 && persona.digital_adoption < .8 && turn >= 2 && (screen.fields || 0) >= 3;
    if (index > 0 && (privacy || form || steps || cautious)) {
      const drop_reason = privacy ? "PRIVACY" : "TOO_MANY_STEPS";
      events.push({ turn: turn + 1, screen: current, action: "abandon", target: null, reason: privacy ? "필요한 정보보다 더 많은 개인정보를 요구하는 것 같아 여기서 멈출게요." : "입력할 게 많아서 지금은 계속하기 어려워요.", drop_reason });
      end = { result: "drop", screen: current, drop_reason }; break;
    }
    const choice: Screen["elements"][number] | undefined = screen.elements.find(e => /건너뛰기/.test(e.text) && persona.price_sensitivity > .8) || screen.elements.find(e => !/뒤로/.test(e.text));
    if (!choice || !byId[choice.to]) { events.push({ turn: turn + 1, screen: current, action: "abandon", target: null, reason: "다음에 무엇을 해야 할지 찾을 수 없어요.", drop_reason: "NAVIGATION_LOST" }); end = { result: "drop", screen: current, drop_reason: "NAVIGATION_LOST" }; break; }
    events.push({ turn: turn + 1, screen: current, action: "click", target: choice.text, to: choice.to, reason: /건너뛰기/.test(choice.text) ? "선택 정보는 나중에 입력하고 먼저 진행하고 싶어요." : "과제를 마치기 위해 다음 단계로 이동할게요." });
    current = choice.to;
    if (current === study.goal) { path.push(current); end = { result: "complete", screen: current }; break; }
  }
  if (!end) { end = { result: "drop", screen: current, drop_reason: "MAX_TURNS" }; }
  if (current && path.at(-1) !== current) path.push(current);
  return { events, path, end };
}

export function buildRun(study: IntegratedStudy, existingResults: PersonaResult[] | null = null): RunData & { frames: RunFrame[] } {
  const results = existingResults || study.personas.map((persona, index) => ({ persona_id: persona.persona_id, ask: askFor(persona, study), act: actFor(persona, study, index) }));
  const frames: RunFrame[] = [];
  results.forEach(result => {
    frames.push({ type: "ask-start", id: result.persona_id });
    frames.push({ type: "ask-done", id: result.persona_id, ask: result.ask });
    frames.push({ type: "act-start", id: result.persona_id, screen: study.screens[0]?.id });
    result.act.events.forEach(event => frames.push({ type: "turn", id: result.persona_id, event }));
    frames.push({ type: "act-end", id: result.persona_id, act: result.act });
  });
  return { results, frames };
}

export function visibleRun(frames: RunFrame[], cursor: number, personas: Persona[]) {
  const entries: Record<string, { persona_id: string; status: string; ask: AskResult | null; act: { events: ActEvent[]; path: string[]; end: ActResult["end"] | null } }> = Object.fromEntries(personas.map(p => [p.persona_id, { persona_id: p.persona_id, status: "waiting", ask: null, act: { events: [], path: [], end: null } }]));
  let phase = "ready", currentId: string | undefined = personas[0]?.persona_id, currentScreen: string | null | undefined = null, lastTarget: string | null = null;
  frames.slice(0, cursor).forEach(frame => {
    const entry = entries[frame.id]; currentId = frame.id;
    if (frame.type === "ask-start") { phase = "ask"; entry.status = "ask-running"; currentScreen = null; }
    if (frame.type === "ask-done") { entry.ask = frame.ask; entry.status = "ask-complete"; }
    if (frame.type === "act-start") { phase = "act"; entry.status = "act-running"; currentScreen = frame.screen; entry.act.path = frame.screen ? [frame.screen] : []; }
    if (frame.type === "turn") { entry.act.events.push(frame.event); lastTarget = frame.event.target; currentScreen = frame.event.to || frame.event.screen; if (frame.event.to && entry.act.path.at(-1) !== frame.event.to) entry.act.path.push(frame.event.to); }
    if (frame.type === "act-end") { entry.act = frame.act; entry.status = frame.act.end.result; currentScreen = frame.act.end.screen; }
  });
  if (cursor === frames.length && cursor > 0) phase = "done";
  return { entries, phase, currentId, currentScreen, lastTarget };
}

export function reportFor(study: Study) {
  const results = study.run?.results || [], asks = results.filter(r => r.ask), acts = results.filter(r => r.act?.end), both = results.filter(r => r.ask && r.act?.end);
  const positive = both.filter(r => r.ask.usage_intention >= 4).length, complete = both.filter(r => r.act.end.result === "complete").length;
  const drops = acts.filter(r => r.act.end.result === "drop");
  const count = (items: string[]) => Object.entries(items.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item]: (acc[item] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const wtps = asks.map(r => r.ask.willingness_to_pay).sort((a, b) => a - b); const middle = Math.floor(wtps.length / 2);
  return { results, asks, acts, both, positive, complete, drops, positiveRate: percent(positive, both.length), completionRate: percent(complete, both.length), gap: percent(complete, both.length) - percent(positive, both.length), averageIntent: asks.length ? (asks.reduce((n, r) => n + r.ask.usage_intention, 0) / asks.length).toFixed(1) : "—", medianWtp: wtps.length ? (wtps.length % 2 ? wtps[middle] : Math.round((wtps[middle - 1] + wtps[middle]) / 2)) : 0, maxWtp: Math.max(0, ...wtps), paying: wtps.filter(v => v > 0).length, concerns: count(asks.map(r => r.ask.concern)), dropScreens: count(drops.map(r => r.act.end.screen).filter((value): value is string => Boolean(value))), dropReasons: count(drops.map(r => r.act.end.drop_reason).filter((value): value is string => Boolean(value))), turns: acts.map(r => r.act.events.length) };
}
