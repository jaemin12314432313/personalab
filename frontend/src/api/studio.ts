import type { AudienceDefinition, AudienceFilters, Persona, Result, RunMeta, Study, WorkspaceState, Workflow, WorkflowScope, BrowserEvidence, Revision } from "../studio/model";

export interface Capabilities { audience_builder_ready?:boolean; workspace_management_ready?:boolean; workflow_ready?:boolean; browser_ready?:boolean; persona_ready: boolean; llm_ready: boolean; provider: string; missing: string[]; max_turns?: number; library_ready?: boolean; library_count?: number; model?: string; persona_transmission_allowed?: boolean; figma_ready?: boolean; local_tools_enabled?: boolean; interview_records_ready?: boolean; interview_llm_ready?: boolean; agent_engine?: 'rule'|'llm' }
export interface Run { id: number; status: string; progress: number; mode: "ask" | "act" }
export interface Report { source?: "live"|"local-demo"; study_id: number; ask_run_id: number | null; act_run_id: number | null; results: Result[]; engine?: "rule"|"llm"|null; meta?: RunMeta | null }
export interface AuthUser { id: number; email: string }
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; } }

async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(path.includes("/interview") ? 120000 : path.includes("/sources/") ? 120000 : path.endsWith("/panel/generate") ? 180000 : 20000);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", headers: body === undefined ? undefined : { "Content-Type": "application/json", "X-Requested-With": "PersonaLab" }, body: body === undefined ? undefined : JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch (error) { if (signal?.aborted) throw error; throw new Error("실행 서버에 연결할 수 없습니다. 연결 상태를 확인해 주세요."); }
  const text = await response.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error("실행 서버가 올바른 응답을 보내지 않았습니다."); }
  if (!response.ok) { const detail = (data as { detail?: unknown }).detail; const message = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map(item => item.msg || "입력값을 확인해 주세요.").join(" ") : "요청을 처리하지 못했습니다."; if (response.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined') window.dispatchEvent(new window.CustomEvent('personalab:session-expired')); throw new ApiError(message, response.status); }
  return data as T;
}
export const getCapabilities = () => request<Capabilities>("/capabilities");
export const currentUser = () => request<AuthUser>("/auth/me");
export const login = (email: string, password: string) => request<AuthUser>("/auth/login", { email, password });
export const register = (email: string, password: string) => request<AuthUser>("/auth/register", { email, password });
export const logout = () => request<{message: string}>("/auth/logout", {});
const scopeWithNote = (study: Study) => ({ ...study.workflow!.scope, round_note: (study.roundNote ?? study.workflow!.scope.round_note ?? '').trim(), product_id: study.productId ?? study.workflow!.scope.product_id ?? '', test_title: (study.testTitle ?? study.workflow!.scope.test_title ?? '').trim() });
export async function prepareStudy(study: Study, onCreated: (id: number) => void): Promise<number> {
  const id = study.serverId || (await request<{ id: number }>("/studies", { name: study.name })).id;
  onCreated(id);
  await request(`/studies/${id}/name`, {name:study.product.name||study.name});
  await request(`/studies/${id}/product`, { description: `${study.product.name}\n${study.product.description}`, features: study.product.features, price: study.product.price });
  if (study.workflow?.source.kind === 'web' || study.workflow?.source.kind === 'html') {
    await saveWorkflow(id, scopeWithNote(study));
  } else {
    await request(`/studies/${id}/prototype/manual`, { screens: study.screens });
    await request(`/studies/${id}/task`, { description: study.task+(study.workflow?.scope.audience?.context?` 사용 상황: ${study.workflow.scope.audience.context}`:"")+(study.workflow?.scope.focus?` 특히 확인할 부분: ${study.workflow.scope.focus}`:""), goal_screen_id: study.goal });
  }
  if(study.workflow && study.workflow.source.kind!=="web" && study.workflow.source.kind!=="html")await saveWorkflow(id,scopeWithNote(study));
  return id;
}
export const generatePanel = (id: number, study: Study) => request<Persona[]>(`/studies/${id}/panel/generate`, { conditions: { preset: study.conditions.preset, age: study.conditions.age, ...(study.conditions.price.length ? { price: study.conditions.price } : {}) }, n: study.count, seed: study.seed });
export const startRun = (id: number, mode: "ask" | "act") => request<Run>(`/studies/${id}/runs`, { mode });
export const getRun = (id: number, signal?: AbortSignal) => request<Run>(`/runs/${id}/status`, undefined, signal);
export const getReport = (id: number) => request<Report>(`/studies/${id}/report`);
export const getRunReport = (id: number) => request<Report>(`/runs/${id}/report`);
export const importFigma = (id: number, url: string) => request<{screens:Study["screens"]; warnings:string[]}>(`/studies/${id}/prototype`, { url });
export interface StudyListEntry { id:number;name:string;status:string;root_study_id?:number;revision?:number;product_id?:string;test_title?:string;round_note?:string;workspace?:WorkspaceState }
export const listStudies=(includeHidden=false)=>request<StudyListEntry[]>(includeHidden?'/studies?include_hidden=true':'/studies');
export type ManagementAction='rename'|'duplicate'|'archive'|'unarchive'|'trash'|'restore'|'delete';
export interface ManagementResult {root_study_id:number;affected_study_ids:number[];workspace:WorkspaceState;deleted:boolean;duplicate_id?:number|null}
export const emptyTrash=(confirmation:string)=>request<{deleted:number;skipped:number;study_ids:number[]}>(`/studies/trash/empty`,{confirmation});
export const manageStudy=(id:number,action:ManagementAction,fields:{name?:string;confirmation?:string}={})=>request<ManagementResult>(`/studies/${id}/manage`,{action,...fields});
export interface StudyDetail { workspace?:WorkspaceState; source?: "live"|"local-demo"; id: number; name: string; status: string; product: { description: string; features: string[]; price: string } | null; prototype: { screens: Study["screens"] } | null; task: { description: string; goal_screen_id: string } | null; personas: Persona[]; runs: Run[] }
export const getStudy = (id: number) => request<StudyDetail>(`/studies/${id}`);
export async function watchRun(id: number, onProgress: (run: Run) => void, signal: AbortSignal) {
  while (!signal.aborted) {
    const run = await getRun(id, signal);
    onProgress(run);
    if (run.status === "done") return run;
    if (run.status === "failed") throw new Error(`${run.mode === "ask" ? "Ask" : "Act"} 실행에 실패했습니다. 서버의 실행 기록을 확인한 후 다시 시도해 주세요.`);
    await new Promise<void>((resolve, reject) => { const cancel = () => { clearTimeout(timer); reject(new DOMException("진행률 확인을 중단했습니다.", "AbortError")); }; const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, 1800); signal.addEventListener("abort", cancel, { once: true }); });
  }
  throw new DOMException("진행률 확인을 중단했습니다.", "AbortError");
}

export interface LibraryPanel {
  id: number; panel_key: string; version_hash: string; source_commit: string; count: number;
  metadata: { report?: { target?: Record<string, unknown>; scoring_version?: string }; viewer_verified?: boolean; count?: number };
}
export const listLibraryPanels = () => request<LibraryPanel[]>('/persona-library/panels');
export const importLibraryPanel = (studyId: number, panelId: number, n: number, seed: number) =>
  request<Persona[]>(`/studies/${studyId}/panel/import`, {panel_id: panelId, n, seed});


export interface PersonaPromptPreview {
  persona_id:number; display_id:string; card_text:string; profile:Record<string,unknown>;
  traits:Record<string,unknown>; screen_id:string; system:string; contents:string[];
  response_schema:Record<string,unknown>; preview_kind:string;
}
export const getPersonaPrompt = (studyId:number, personaId:number) => request<PersonaPromptPreview>(`/studies/${studyId}/personas/${personaId}/prompt`);

export interface InterviewMessage {id:number;question:string;answer:string;mode:'records'|'llm';evidence:{log_id:number;screen_id:string;screen_label:string;quote?:string|null}[];created_at:string}
export const getInterview=(runId:number,personaId:number)=>request<{messages:InterviewMessage[];llm_allowed:boolean;source:string}>(`/runs/${runId}/personas/${personaId}/interview`);
export const askInterview=(runId:number,personaId:number,question:string,mode:'records'|'llm'='records')=>request<InterviewMessage>(`/runs/${runId}/personas/${personaId}/interview`,{question,mode});
export const createLocalDemo=()=>request<{study_id:number;run_id:number;source:'local-demo'}>('/local/demo',{});

// 보관함 원본을 로그인한 사용자의 브라우저 안에서 조회한다. 모델 호출이 아니다.
export interface LibraryPersona { id: number; panel_id: number; source_persona_id: string; profile_hash: string; attributes: Persona["attributes"] }
export interface LibraryPage { total: number; limit: number; offset: number; items: LibraryPersona[] }
export const listLibraryPersonas = (panelId: number, offset = 0) => request<LibraryPage>(`/persona-library/panels/${panelId}/personas?limit=12&offset=${offset}`);

export const createDraft = (name:string) => request<{id:number}>('/studies',{name});
// images=false: 설정값만 필요한 호출은 화면 캡처 이미지를 빼고 받는다(응답이 수백 KB 줄어든다).
export const getWorkflow = (id:number, images = true) => request<Workflow>(`/studies/${id}/workflow${images ? '' : '?images=0'}`);
export const saveWorkflow = (id:number,scope:WorkflowScope) => request<Workflow>(`/studies/${id}/workflow`,{scope});
export const connectWeb = (id:number,url:string,viewport:string,product_kind:'web'|'ios'|'android'='web') => request<Workflow & {screens:Study['screens']}>(`/studies/${id}/sources/web`,{url,viewport,product_kind});
export const connectHtml = (id:number,files:{path:string;data:string}[],entry:string,viewport:string,product_kind:'web'|'ios'|'android'='web') => request<Workflow & {screens:Study['screens']}>(`/studies/${id}/sources/html`,{files,entry,viewport,product_kind});
export const getRevisions = (id:number) => request<Revision[]>(`/studies/${id}/revisions`);
// carry=false: 대상 사용자·참여 구성·탐색 범위를 비운 채 새 앱·웹처럼 시작한다(이전 내용은 화면의 '가져오기'로)
export const discardRound = (id:number) => request<{deleted:number;root_study_id:number}>(`/studies/${id}/discard`,{});
export const createRevision =(id:number, note = '', carry = false) => request<{id:number}>(`/studies/${id}/revisions`,{note,carry});
export const getEvidence = (id:number,after=0) => request<BrowserEvidence[]>(`/runs/${id}/evidence?after=${after}`);
export const cancelRun = (id:number) => request<{cancel_requested:boolean}>(`/runs/${id}/cancel`,{});
export const getRunControl = (id:number) => request<{cancel_requested:boolean;error:string|null}>(`/runs/${id}/control`);

export interface AudienceFacets {total:number;jobs:string[];regions:string[];digital:string[];age_min:number|null;age_max:number|null;max_selection:number}
export interface AudienceSearch {total:number;duplicates_excluded:number;items:LibraryPersona[]}
export interface AudienceRecommendation {total:number;requested_count:number;items:LibraryPersona[]}
export const recommendAudience=(filters:AudienceFilters,count:number)=>request<AudienceRecommendation>('/persona-library/audience/recommend',{filters,count});
export const getLibraryPersona=(id:number)=>request<LibraryPersona>(`/persona-library/personas/${id}`);
export const audienceFacets=()=>request<AudienceFacets>('/persona-library/audience/facets');
export const searchAudience=(filters:AudienceFilters,offset=0,limit=12)=>request<AudienceSearch>('/persona-library/audience/search',{filters,offset,limit});
export const selectAudience=(id:number,audience:AudienceDefinition)=>request<Persona[]>(`/studies/${id}/panel/select`,{audience});

export interface ExplorationUpdate {job:import('../studio/model').ExplorationJob|null;source:Pick<import('../studio/model').WorkflowSource,'site_map'|'preflight'>|null}
export const getExploration=(id:number,version=-1)=>request<ExplorationUpdate>(`/studies/${id}/exploration?after_version=${version}`);
export const controlExploration=(id:number,action:'start'|'pause'|'resume',job_id?:string)=>request<ExplorationUpdate>(`/studies/${id}/exploration`,{action,job_id});

export const recaptureSource=(id:number)=>request<Workflow & {screens:Study['screens']}>(`/studies/${id}/sources/recapture`,{});
export const refreshSourceCapture=(id:number,job_id?:string)=>request<Workflow & {screens:Study['screens']}>(`/studies/${id}/sources/preview`,{job_id});
export const reviewExploration=(id:number,job_id:string)=>request<Workflow>(`/studies/${id}/exploration/review`,{job_id});
