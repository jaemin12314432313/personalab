export const DROP_LABELS: Record<string, string> = {
  UNCLEAR_PURPOSE: "목적이 불분명함", TOO_MANY_STEPS: "복잡한 절차", PRIVACY: "개인정보 요구",
  PRICE: "가격 부담", TRUST: "신뢰 부족", FEATURE_MISSING: "필요한 기능 없음",
  SWITCHING_COST: "전환 부담", NAVIGATION_LOST: "경로를 찾지 못함", MAX_TURNS: "탐색 상한 도달",
};
export interface Product { name: string; description: string; features: string[]; price: string }
export interface Screen { image?:string|null; id: string; label: string; description: string; elements: { text: string; to: string | null }[] }
export interface Persona { id: number; attributes: { profile: { age: number; sex?: string; region?: string; job_group: string }; card_text: string; traits: Record<string, string | number>; source: { persona_id?: string; stub?: boolean; scoring_version?: string; match_level?: number; stand_in?: boolean; library_entry_id?: number; library_panel_id?: number; library_version?: string; panel_key?: string; nvidia_uuid?: string } } }
export interface RunMeta { engine: "rule" | "llm"; model?: string | null; prompt_rev?: string | null; usage?: { calls: number; input_tokens: number; output_tokens: number } | null; failed_personas?: number }
export interface Ask { usage_intention: number; willingness_to_pay: number; concern: string; needed_features: string[]; unneeded_features: string[]; reason: string }
export interface Act { path: string[]; events: { turn: number; screen: string; action: "click" | "abandon" | "fill" | "scroll"; target: string | null; to?: string | null; reason?: string | null; drop_reason?: string | null; concern?: { code: string; note: string } | null }[]; end: { result: "complete" | "drop"; screen: string | null; drop_reason?: string | null } }
export interface Result { id: number; persona_id: string; ask: Ask | null; act: Act | null }
export interface ObservedScreen extends Screen { url?:string; elements:(Screen['elements'][number]&{id?:string;kind?:string;type?:string;href?:string|null;role?:string|null;navigation?:boolean;selected?:boolean})[] }
export interface SourceInspection { capture_ready?:boolean; captured_at:string;layout_viewport?:{width:number;height:number};viewport:{width:number;height:number};document:{width:number;height:number};headings:{level:number;text:string}[];heading_count:number;landmarks:{role:string;label:string}[];landmark_count:number;element_count:number;elements_truncated:boolean;image_count:number;unloaded_image_count:number;frame_count:number;dialog_count:number;blocked_request_count:number;html_documents:string[] }
export interface SitePage {capture_ready?:boolean;image?:string;capture_error?:string;captured_at?:string;url:string;label:string;state:"loaded"|"error"|"pending";final_url?:string;error?:string;controls?:number;issues:{code:string;label:string;count:number}[]}
export interface SiteMap {mode?:"snapshot";time_limited?:boolean;collection_seconds?:number;pages:SitePage[];edges:{from:string;to:string;label:string}[];excluded_count:number;limit_reached:boolean;max_pages:number;max_discovered:number;scanned_at:string}
export interface PreflightNavigation {parent?:string|null;id:string;label:string;group:string;kind:"global"|"section";status:"pending"|"visited"|"unconfirmed";state_id:string|null;attempts:number}
export interface PreflightState {navigation?:string|null;id:string;label:string;url:string;excerpt:string;path:string[];element_count:number;image:string|null}
export interface PreflightTransition {from:string;to:string|null;action:string;path:string[];status:"changed"|"unchanged"|"blocked"|"unconfirmed"|"unreplayed";restricted_requests?:number}
export interface SourcePreflight {navigation?:PreflightNavigation[];base_state_limit?:number;navigation_reserve?:number;states:PreflightState[];transitions:PreflightTransition[];skipped:{label:string;reason:string}[];attempts:number;clicks:number;input_fills:number;limited:boolean;status:"done"|"partial"|"unavailable";error?:string;max_states:number;max_attempts:number;max_depth:number;timeout_seconds:number;scanned_at:string}
export interface ExplorationJob { mode?:"snapshot";id:string;status:'queued'|'running'|'pausing'|'paused'|'limited'|'done'|'failed';phase:'pages'|'screens'|'complete';version:number;budget:{states:number;attempts:number;clicks:number;seconds:number;pages:number};elapsed_seconds:number;states:number;pending_actions:number;pages_found:number;pages_checked:number;pages_failed:number;attempts:number;clicks:number;reason?:string|null;error?:string|null;updated_at:string }
export interface WorkflowSource { needs_reconnect?:boolean; exploration?:ExplorationJob; preflight?:SourcePreflight; site_map?:SiteMap; observed_screen?:ObservedScreen;inspection?:SourceInspection; kind?: 'web'|'html'|'figma'|'manual'; url?: string; title?: string; entry?: string; preview?: string; viewport?: string; suggestions?: {name:string;url:string}[]; restrictions?:string[] }
export interface AudienceFilters {query:string;age_min:number|null;age_max:number|null;jobs:string[];regions:string[];digital:string[]}
export interface AudienceDefinition {description:string;context:string;filters:AudienceFilters;entry_ids:number[];requested_count?:number|null}
export interface WorkflowScope { round_note?:string; product_id?:string; test_title?:string; reviewed_exploration_id?:string; exploration?:"site"|"journey"|null; priorities?:string[]; max_turns?:number|null; product_kind?:'web'|'ios'|'android'; audience?:AudienceDefinition; mode:'general'|'focused'; focus:string; goal_url:string; goal_text:string; viewport:'desktop'|'mobile'; scenario:string }
export interface Workflow { study_id:number;root_study_id:number;revision:number;source:WorkflowSource;scope:WorkflowScope }
export interface BrowserEvidence {id:number;persona_id:number;turn:number;screen:Omit<Screen,"elements"> & {capture_ready?:boolean;exploration?:{mode:"site";entry:"assigned"|"original"};url?:string;viewport?:{width:number;height:number};elements:(Screen['elements'][number]&{id?:string;rect?:{x:number;y:number;width:number;height:number}})[]};image:string;action:{action?:string;status?:'failed';error?:string;reason?:string;target?:string|null;drop_reason?:string|null}}
export interface Revision {note?:string;study_id:number;revision:number;name:string;status:string;created_at?:string|null;runs:{id:number;mode:string;status:string;progress:number}[]}
export interface WorkspaceState { display_name?:string|null; archived?:boolean; trashed?:boolean }
export const studyTitle=(s:Study)=>s.workspace?.display_name||s.product.name||s.name;
export interface Study {
  execution?:{run_id:number;status:"pending"|"running"|"done"|"failed";progress:number};
  runStartedAt?:string;
  audienceDraft?:AudienceDefinition;
  workspace?: WorkspaceState;
  /** 이번 회차를 구분하는 짧은 상세 설명. 서버에는 워크플로 범위(round_note)로 저장한다 */
  roundNote?: string;
  /** 같은 앱·웹(제품)의 테스트를 묶는 식별자. 서버에는 워크플로 범위(product_id)로 저장한다 */
  productId?: string;
  /** 앱·웹 안에서 무엇을 살펴보는 테스트인지(예: 전반 탐색, 가입 흐름). 서버에는 test_title */
  testTitle?: string;
  id: string; name: string; created: string; source: "demo" | "server"; status: "draft" | "ready" | "running" | "done" | "failed";
  product: Product; screens: Screen[]; task: string; goal: string;
  conditions: { preset: string; age: string; price: string[] }; count: number; seed: number;
  workflow?: Workflow; evidence?: BrowserEvidence[];
  reportSource?: "ui-mock" | "local-demo";
  runMeta?: RunMeta | null; // 이 결과를 만든 실행의 엔진·모델·프롬프트 개정·사용량
  panelSource?: 'library' | 'engine'; libraryPanelId?: number;
  personas: Persona[]; results: Result[]; serverId?: number; runs?: { ask?: number; act?: number };
}
export const STEPS = ["제품 기획", "프로토타입", "페르소나 패널", "실행", "리포트"];
export const DEFAULT_SCREENS: Screen[] = [
  { id: "S01", label: "온보딩", description: "흩어진 일정을 자동으로 정리합니다. 오늘 할 일을 한눈에 확인하세요.", elements: [{ text: "시작하기", to: "S02" }] },
  { id: "S02", label: "회원가입", description: "이메일, 비밀번호, 휴대폰 번호 인증을 입력합니다.", elements: [{ text: "다음", to: "S03" }, { text: "뒤로", to: "S01" }] },
  { id: "S03", label: "학교·학년", description: "학교, 학년, 전공을 입력합니다.", elements: [{ text: "다음", to: "S04" }, { text: "건너뛰기", to: "S04" }] },
  { id: "S04", label: "관심분야", description: "관심분야를 5개 이상 선택합니다.", elements: [{ text: "완료", to: "S05" }, { text: "건너뛰기", to: "S05" }] },
  { id: "S05", label: "홈", description: "오늘의 일정과 우선순위를 확인합니다.", elements: [] },
];
export function newStudy(): Study {
  return { id: crypto.randomUUID(), name: "새 테스트", created: new Date().toISOString(), source: "server", status: "draft", product: { name: "", description: "", features: [], price: "" }, screens: [], task: "", goal: "", conditions: { preset: "", age: "", price: [] }, count: 5, seed: 42, personas: [], results: [] };
}
const recorded = [
  { id: "P938", age: 32, concern: "UNCLEAR_PURPOSE", drop: "TOO_MANY_STEPS", intention: 3, wtp: 3000, ask: "시간에 쫓기는 직장인으로서 일정 관리가 중요하지만, 대학생용이라고 해서 나한테 얼마나 맞을지 조금 애매하네.", act: "바빠 죽겠는데 회원가입에 인증 절차가 너무 복잡해서 그냥 안 할래요." },
  { id: "P069", age: 29, concern: "PRIVACY", drop: "PRIVACY", intention: 2, wtp: 0, ask: "개인 일정을 정리하는 건데 프라이버시가 걱정되기도 하고, 이미 노션을 쓰고 있어서 굳이 바꿀 이유를 모르겠어.", act: "회원가입하는데 왜 이렇게 개인정보를 많이 요구하는지 모르겠어서 그냥 그만둘래요." },
  { id: "P392", age: 27, concern: "PRIVACY", drop: "PRIVACY", intention: 2, wtp: 0, ask: "사생활 기록이 담기는 거라 보안이나 개인정보 보호가 걱정돼서 잘 안 쓰게 될 것 같아.", act: "개인정보를 너무 많이 입력하라고 해서 찝찝하니까 그만둘래." },
  { id: "P563", age: 34, concern: "PRICE", drop: "PRIVACY", intention: 2, wtp: 0, ask: "예산이 넉넉하지 않아서 유료 구독까지 하면서 쓰고 싶진 않고, 지금 쓰는 네이버 캘린더로도 충분하거든요.", act: "아니 회원가입하는데 휴대폰 번호 인증까지 해야 되나, 개인정보 털릴 것 같아서 그냥 찜찜하네." },
  { id: "P374", age: 27, concern: "PRIVACY", drop: "PRIVACY", intention: 2, wtp: 0, ask: "개인 일정을 다른 곳에 모아두는 게 찜찜하고, 네이버 캘린더를 이미 잘 쓰고 있어서 굳이 바꿀 이유를 모르겠어요.", act: "회원가입에 휴대폰 번호까지 요구하는 건 개인정보 측면에서 좀 찝찝하네." },
];
export const DEMO: Study = {
  id: "recorded-demo-v2", name: "일정메이트 온보딩", created: "2026-10-13T00:00:00.000Z", source: "demo", status: "done",
  product: { name: "일정메이트", description: "대학생의 수업, 과제, 동아리 일정을 한곳에서 정리하고 오늘 할 일의 우선순위를 추천합니다.", features: ["자동 정리", "우선순위 추천", "캘린더 연동", "친구 공유", "알림 설정"], price: "기본 무료" },
  screens: DEFAULT_SCREENS, task: "회원가입을 완료하세요", goal: "S05", conditions: { preset: "30s_office", age: "27-34", price: [] }, count: 5, seed: 42,
  personas: recorded.map((p, i) => ({ id: i + 1, attributes: { profile: { age: p.age, job_group: "직장인" }, card_text: `${p.age}세 직장인. 복구한 데모 리포트에 포함된 페르소나입니다.`, traits: {}, source: { persona_id: p.id } } })),
  results: recorded.map((p, i) => ({ id: i + 1, persona_id: p.id, ask: { usage_intention: p.intention, willingness_to_pay: p.wtp, concern: p.concern, needed_features: [], unneeded_features: [], reason: p.ask }, act: { path: ["S01", "S02"], events: [{ turn: 1, screen: "S01", action: "click", target: "시작하기", to: "S02" }, { turn: 2, screen: "S02", action: "abandon", target: null, reason: p.act, drop_reason: p.drop }], end: { result: "drop", screen: "S02", drop_reason: p.drop } } })),
};
export function personaId(persona: Persona) { return persona.attributes.source.persona_id || `P${String(persona.id).padStart(3, "0")}`; }
export function distribution(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1]);
}
export function statistics(results: Result[]) {
  const asks = results.filter((r): r is Result & { ask: Ask } => r.ask !== null);
  const acts = results.filter((r): r is Result & { act: Act } => r.act !== null);
  const paired = results.filter((r): r is Result & { ask: Ask; act: Act } => r.ask !== null && r.act !== null);
  const system = acts.filter(r => r.act.end.drop_reason === "MAX_TURNS");
  const completed = acts.filter(r => r.act.end.result === "complete").length;
  const positive = asks.filter(r => r.ask.usage_intention >= 4).length;
  const gap = paired.length ? (paired.filter(r => r.ask.usage_intention >= 4).length - paired.filter(r => r.act.end.result === "complete").length) / paired.length * 100 : null;
  const dropped = acts.filter(r => r.act.end.result === "drop" && r.act.end.drop_reason !== "MAX_TURNS");
  return { asks, acts, paired, completed, positive, system, gap, dropped, topScreens: distribution(dropped.map(r => r.act.end.screen || "")), reasons: distribution(dropped.map(r => r.act.end.drop_reason || "")), concerns: distribution(asks.map(r => r.ask.concern)), average: asks.length ? asks.reduce((sum, r) => sum + r.ask.usage_intention, 0) / asks.length : null };
}
export function percent(value: number, total: number) { return total ? Math.round(value / total * 100) : 0; }
export function reachable(screens: Screen[], goal: string): boolean {
  const byId = new Map(screens.map(screen => [screen.id, screen]));
  const pending = [screens[0]?.id], visited = new Set<string>();
  while (pending.length) { const id = pending.shift(); if (!id || visited.has(id)) continue; if (id === goal) return true; visited.add(id); pending.push(...(byId.get(id)?.elements.map(e => e.to || "") || [])); }
  return false;
}
export function validateScreens(screens: Screen[]) {
  if (!screens.length) throw new Error("화면을 하나 이상 추가해 주세요.");
  const ids = new Set(screens.map(s => s.id));
  if (ids.size !== screens.length) throw new Error("화면 번호가 중복됩니다.");
  for (const screen of screens) {
    if (!screen.id.trim() || !screen.label.trim()) throw new Error("화면 번호와 이름을 입력해 주세요.");
    const names = new Set<string>();
    for (const button of screen.elements) { if (!button.text.trim()) throw new Error("버튼 이름을 입력해 주세요."); if (names.has(button.text)) throw new Error(`${screen.id}에 같은 이름의 버튼이 있습니다.`); names.add(button.text); if (button.to && !ids.has(button.to)) throw new Error(`${screen.id}의 연결 대상 ${button.to}가 없습니다.`); }
  }
}
