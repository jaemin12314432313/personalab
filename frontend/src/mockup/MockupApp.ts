import {executionState} from './ExecutionState';
import {browserSnapshot,displayAttributes,portraitMarkup} from './DisplayPersona';
import { siteMode } from './SiteCoverage';
import { mountLiveStage } from './LiveStage';
import { sourceRecognitionMarkup, sourceDetailsMarkup, explorationMarkup, sourceReview, sourceNeedsReconnect, explorationBlock, type SourceCheckState, type RecognitionSelection, type RecognitionTab } from './SourceRecognition';
import { mountAudienceBuilder, emptyAudience } from './AudienceBuilder';
import { mountWorkspaceManager } from './WorkspaceManager';
import { unzipSync } from 'fflate';
import { sourceMarkup, scopeMarkup, overviewMarkup, comparisonMarkup, browserSource, defaultScope, productKindLabel } from './WorkflowView';
import { mountWorkspaceSidebar } from './WorkspaceSidebar';
import { workspaceContent, workspaceSideList, toggleWorkspaceAskAll, selectWorkspace, selectedWorkspaceKey, shiftCalendar, calendarToday, setWorkspaceTab, getWorkspaceTab, toggleWorkspaceFinished, visibleTabs, type WorkspaceEntry, type WorkspacePerson, type WorkspaceRound } from './WorkspaceView';
import { demoEnabled, demoEntries } from './WorkspaceDemo';
import { mountReport } from './ReportView';
import template from './template.html?raw';
import { mountDemo } from './DemoExperience';
import { mountPeopleHero } from './PeopleHero';
import { promptPanel, executionPrompt, copyPrompt, downloadPrompt } from './PersonaPrompt';
import { mountScreenEditor } from './ScreenEditor';
import { LANDING_ANCHORS, mountMarketing, updateMarketingAuth } from './Marketing';
import { brandMarkup } from './Brand';
import { outcome, recordAnswer } from './ReportModel';
import { withSampleMock } from './SampleMock';
import { SAMPLE_SITE, sampleSitePayload } from './sampleSite';
import * as api from '../api/studio';
import { DEFAULT_SCREENS, DROP_LABELS, studyTitle, newStudy, percent, personaId, reachable, statistics, validateScreens } from '../studio/model';
import type { Persona, Result, Screen, Study, Revision, BrowserEvidence, AudienceDefinition, WorkflowScope } from '../studio/model';

const STORAGE_PREFIX = 'personalab-connected-mockup-v1';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const reason = (code?: string | null) => code ? DROP_LABELS[code] || code : '—';
const panelViews=['panel','personas','scope'];
const DEFAULT_PANEL_COUNT = 30; // 실제로는 한 앱을 3명으로 확인하지 않으므로 기본 인원을 넉넉하게 둔다
const steps = ['product', 'source-review', 'proto', 'panel','personas','scope', 'run', 'report', 'interview', 'overview', 'compare'];
const setupViews = ['product','source-review','proto','panel','personas','scope','run'];
const resultViews = ['overview','report','interview','compare'];
// 이전 버전이 자동으로 붙인 이름의 접미사만 표시할 때 정리한다.
const testName = (value: string) => value === '새 스터디' ? '새 테스트' : value.replace(/ 스터디$/, ' 테스트');

export function mountMockup(root: HTMLElement) {
  root.innerHTML = template.replaceAll('{{PERSONALAB_BRAND}}', brandMarkup).replace('{{WORKFLOW_SOURCE}}',sourceMarkup());
  const disposeMarketing = mountMarketing(root);
  const disposePeople = mountPeopleHero(root);
  const disposeDemo = mountDemo(root.querySelector<HTMLElement>('#v-demo')!);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => {
    const node = document.getElementById(id); if (!node) throw new Error(`Missing element: ${id}`); return node as T;
  };
  const input = (id: string) => el<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
  let KEY = STORAGE_PREFIX + ':guest';
  let user: api.AuthUser | null = null, authChecked = false, authBusy = false, sessionEpoch = 0;
  let authMode: 'login' | 'register' = 'login', restoreCounter = 0;
  function blankStudy() { const fresh = newStudy(); fresh.count = DEFAULT_PANEL_COUNT; return fresh; }
  let study = blankStudy();
  let revisions:Revision[] = [], sourceFiles:File[] = [], comparisonRequest=0;
  let sourceCheck:SourceCheckState={phase:'idle'},sourceCheckKey='',sourceScreenId='';
  let recognitionSelection:RecognitionSelection={};
  let explorationPolling=false,explorationBusy=false;
  let reportView: ReturnType<typeof mountReport> | undefined;
  let returnAfterRunCheck:{view:string;id:string;run:number;owner:number}|undefined;
  let capabilities: api.Capabilities | null = null, serverReady = false, busy = false, running = false;
  let libraryPanels: api.LibraryPanel[] = [];
  let promptRequest=0, promptPersonaId=0,panelContinuing=false,runRefresh=0,cancelRequestedRun=0,runRefreshPaused=false;
  let visualPaused = false, playTimer: ReturnType<typeof setTimeout> | undefined;
  let visualQueue: { persona: Persona; screen: string; text: string; state: string; target?: string | null }[] = [];
  const seen = new Set<string>();
  const liveStage=mountLiveStage(el('browserExecution'));
  let rotorPosition = 0, rotorTarget = 0, rotorFrame = 0;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let workspaceChecked = false;
  let serverStudies: api.StudyListEntry[] = [];
  let workspaceView='active',workspaceEntries=new Map<string,WorkspaceEntry>();
  const audienceBuilder=mountAudienceBuilder(el('audienceBuilder'),{
    get:()=>study,key:()=>`${sessionEpoch}:${study.id}:${Boolean(user&&capabilities?.audience_builder_ready)}:${study.runs?.act||study.runs?.ask||''}`,ready:()=>Boolean(user&&serverReady&&capabilities?.audience_builder_ready),
    draft:a=>{if(user&&!study.runs?.act&&!study.runs?.ask){study.audienceDraft=a;persist();}},notify:notice,changed:()=>renderPanelNavigation(),
    apply:async audience=>{
      if(busy||running)throw new Error('현재 작업이 끝난 뒤 저장하세요.');
      const owner=sessionEpoch,draftId=study.id;busy=true;
      try{const id=await ensureDraft();requireSession(owner,draftId);const people=await api.selectAudience(id,audience);requireSession(owner,draftId);
        study.personas=people;study.count=people.length;study.panelSource='library';study.libraryPanelId=undefined;study.results=[];study.status='ready';
        if(!study.workflow)study.workflow={study_id:id,root_study_id:id,revision:1,source:{kind:'manual'},scope:defaultScope()};
        study.workflow.scope.audience=audience;delete study.audienceDraft;persist();renderPanel();renderRoster();renderStudioContext();
      }finally{if(sameSession(owner))busy=false;}
    }
  });
  const workspaceManager=mountWorkspaceManager(root,{entry:key=>workspaceEntries.get(key),session:()=>sessionEpoch,apply:manageWorkspaceEntry});
  const workspaceSidebar = mountWorkspaceSidebar(root, {
    sessionKey: () => user ? sessionEpoch : null,
    panels: () => libraryPanels, studies: () => serverStudies.filter(s=>!s.workspace?.trashed).map(s=>({...s,name:s.workspace?.display_name||s.name})),
    ready: () => serverReady, checked: () => workspaceChecked,
    panelName: libraryLabel,
    openRun: (studyId, runId) => { void task(() => openStudy(undefined, studyId, runId)); },
  });
  function sameSession(epoch: number, id?: string) { return Boolean(user) && sessionEpoch === epoch && (!id || study.id === id); }
  function requireSession(epoch: number, id?: string) { if (!sameSession(epoch, id)) throw new Error('로그인 상태가 변경되었습니다.'); }
  function setUser(value: api.AuthUser | null) {
    updateMarketingAuth(root, Boolean(value));
    input('plan').value='';document.getElementById('personalabPrintReport')?.remove();
    const guide=el<HTMLDialogElement>('workflowGuide');if(guide.open)guide.close();
    const capture=el<HTMLDialogElement>('sourceCaptureDialog');if(capture.open)capture.close();el<HTMLImageElement>('sourceCaptureImage').removeAttribute('src');
    sessionEpoch++;returnAfterRunCheck=undefined;runRefreshPaused=false; clearPlayback(); user = value; running = false; busy = false; serverStudies = []; capabilities = null; serverReady = false; workspaceChecked = false;
    libraryPanels = [];
    input('workspaceSearch').value = ''; input('workspaceSort').value = 'status';input('workspaceFilter').value='all';workspaceView='active';workspaceEntries.clear();workspaceManager.reset();
    closeAccountMenus();
    KEY = value ? `${STORAGE_PREFIX}:user:${value.id}` : STORAGE_PREFIX + ':guest';
    resetPasswordVisibility();clearAuthErrors();root.querySelectorAll<HTMLButtonElement>('[data-auth-logout]').forEach(button=>{button.disabled=false;button.textContent='로그아웃';});
    if (!value) { input('authEmail').value = ''; input('authPassword').value = ''; input('authConfirm').value = ''; const dialog = el<HTMLDialogElement>('connectionDetails'); if (dialog.open) dialog.close(); }
    study = blankStudy();revisions=[];sourceFiles=[];comparisonRequest++;
    el("comparisonResult").replaceChildren();el("comparisonControls").replaceChildren();
    if(value){try{const history=JSON.parse(localStorage.getItem(KEY+':history')||'[]');if(Array.isArray(history))localStorage.setItem(KEY+':history',JSON.stringify(history.map(browserSnapshot)));}catch{/* 다른 초안은 보존한다 */}}
    if (value) { try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved?.id && saved?.product && Array.isArray(saved.screens) && Array.isArray(saved.personas) && Array.isArray(saved.results)) study = browserSnapshot(saved); } catch { /* 손상된 초안은 자동으로 사용하지 않는다. */ } }
    document.querySelectorAll<HTMLElement>('[data-auth-user]').forEach(node => { node.textContent = value?.email || ''; });
    syncInputs(); lockInputs();
    workspaceSidebar.reset(); renderWorkspace();
    notice('');
  }
  function resetPasswordVisibility() {
    root.querySelectorAll<HTMLButtonElement>('[data-auth-toggle]').forEach(button=>{
      el<HTMLInputElement>(button.dataset.authToggle!).type='password';button.textContent='보기';button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',button.dataset.authToggle==='authConfirm'?'확인 비밀번호 표시':'비밀번호 표시');
    });el('authCapsLock').hidden=true;
  }
  function authFieldError(id:string,text:string) {
    input(id).setAttribute('aria-invalid',String(Boolean(text)));el(id+'Error').textContent=text;el(id+'Error').hidden=!text;
  }
  function clearAuthErrors() { ['authEmail','authPassword','authConfirm'].forEach(id=>authFieldError(id,''));authError(''); }
  function updateAuthBusy() {
    el('authForm').setAttribute('aria-busy',String(authBusy));
    el('authForm').querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button').forEach(field=>{field.disabled=authBusy;});
    el('authSwitch').setAttribute('aria-disabled',String(authBusy));
    const label=authMode==='register'?'가입하고 시작하기':'로그인';const progress=authMode==='register'?'계정을 만들고 있어요…':'로그인 중…';
    el('authSubmit').textContent=authBusy?progress:label;el('authProgress').textContent=authBusy?progress:'';
  }
  function setAuthMode(mode: 'login' | 'register') {
    if (authMode !== mode) { input('authPassword').value='';input('authConfirm').value='';resetPasswordVisibility();clearAuthErrors(); }
    authMode=mode;const signup=mode==='register';
    el('authEyebrow').textContent=signup?'CREATE ACCOUNT':'SIGN IN';el('authTitle').textContent=signup?'회원가입':'로그인';
    el('authDescription').textContent=signup?'이메일로 가입하고 내 워크스페이스를 만드세요.':'로그인하고 내 테스트를 이어서 살펴보세요.';
    el('authConfirmField').hidden=!signup;el<HTMLInputElement>('authConfirm').required=signup;el<HTMLInputElement>('authPassword').autocomplete=signup?'new-password':'current-password';
    el('authSwitchLabel').textContent=signup?'이미 계정이 있으신가요?':'아직 계정이 없으신가요?';
    el<HTMLAnchorElement>('authSwitch').href=signup?'#login':'#register';el('authSwitch').textContent=signup?'로그인하기 →':'이메일로 가입하기 →';updateAuthBusy();
  }
  function authError(text:string,retry=false,existing=false) {
    el('authError').textContent=text;el('authError').hidden=!text;el('authRetry').hidden=!text||!retry;el('authExistingLogin').hidden=!text||!existing;
  }
  async function restoreSession() {
    if(authBusy)return;const requestId=++restoreCounter;
    try {
      const account=await api.currentUser();if(requestId!==restoreCounter)return;
      if(!Number.isInteger(account.id)||!account.email)throw new Error('로그인 정보를 확인하지 못했습니다.');
      if(user?.id!==account.id)setUser(account);authChecked=true;
      if(location.hash==='#login'||location.hash==='#register')location.hash='#workspace';route();void probe();
    } catch(error) {
      if(requestId!==restoreCounter)return;authChecked=true;
      if(error instanceof api.ApiError&&error.status===401){if(user)setUser(null);else if(!el('authRetry').hidden)authError('');route();}
      else if(user){serverReady=false;renderRunControls();notice('로그인 상태를 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.',true);}
      else{route();authError('로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',true);}
    }
  }
  function announceSession() { try { localStorage.setItem(STORAGE_PREFIX + ':auth-sync', crypto.randomUUID()); } catch { /* 쿠키 세션에는 영향을 주지 않는다. */ } }
  function hasDraft(s: Study) { return Boolean(s.product.name || s.product.description || s.serverId || s.personas.length); }
  function localStudies(): Study[] {
    if (!user) return [];
    try { const history = JSON.parse(localStorage.getItem(KEY + ':history') || '[]'); return [study, ...(Array.isArray(history) ? history : [])].filter(s => s?.id && s?.product && Array.isArray(s.screens) && Array.isArray(s.personas) && Array.isArray(s.results) && hasDraft(s)).map(browserSnapshot); }
    catch { return hasDraft(study) ? [study] : []; }
  }
  function archiveCurrent() {
    if (!user || !hasDraft(study)) return;
    const history = [...localStudies().filter(s => s.id !== study.id), study];
    // 브라우저 저장 공간이 차면, 서버에 원본이 있는 테스트의 복사본부터 오래된 순으로 비우고 다시 시도한다.
    // 서버에 없는 작성 중 테스트는 마지막까지 지킨다.
    for (;;) {
      try { localStorage.setItem(KEY + ':history', JSON.stringify(history.map(browserSnapshot))); return; }
      catch (error) {
        const at = history.findIndex(s => s.serverId && s.id !== study.id);
        if (at < 0) throw error;
        history.splice(at, 1);
      }
    }
  }
  function recordRunStatus(target:Study,run:number,value:{status:string;progress?:number}){
    if(!['pending','running','done','failed'].includes(value.status))throw new Error('실행 상태를 확인하지 못했습니다. 다시 확인해 주세요.');
    target.execution={run_id:run,status:value.status as 'pending'|'running'|'done'|'failed',progress:Math.max(0,Math.min(1,value.progress||0))};
    target.status=value.status==='pending'?'running':value.status as Study['status'];
  }
  // 5단계에서 '실행 시작'을 누른 순간부터 실행 화면 배치로 바로 그린다(준비 화면 → 실행 화면으로 한 번 더 바뀌며 덜컹이는 것을 막는다)
  let launching='';
  const executedLayout=()=>hasExecution()||launching===study.id;
  function hasExecution(s:Study=study){return Boolean(s.runs?.act||s.runs?.ask||s.results.some(r=>r.act||r.ask));}
  function hasActRecords(s:Study=study){return s.results.some(r=>r.act);}
  function navigationIssue(view:string,allowSaving=false):{view:string;message:string;focus?:string}|null{
    if(hasExecution()){
      const state=executionState(study);
      if(['report','interview','compare'].includes(view)&&(!state.canReport||view==='interview'&&!state.canInterview))return {view:'run',message:view==='interview'&&state.partial&&!state.finished?'종료 기록이 있는 페르소나가 있어야 인터뷰를 열 수 있어요.':state.message,focus:'runActionState'};
      return null;
    }
    if(resultViews.includes(view))return {view:resumeSetup(study),message:'설정을 완료하고 탐색을 실행한 뒤 기록을 확인하세요.'};
    const current=location.hash.slice(1),order=['product','source-review','panel','personas','scope','run'];
    if(order.indexOf(view)>order.indexOf(current)&&order.includes(current)&&!allowSaving&&(panelContinuing||audienceBuilder.state().saving))return {view:current,message:'현재 설정을 저장하고 있어요. 저장이 끝나면 다음으로 이동해 주세요.'};
    if(!['source-review','panel','personas','scope','run'].includes(view))return null;
    if(sourceCheck.phase==='loading')return {view:'product',message:'화면을 확인하고 있습니다. 연결이 끝나면 다음 단계로 이동해 주세요.'};
    if(study.workflow?.source.needs_reconnect&&!hasExecution())return {view:'product',message:'살펴볼 화면을 먼저 연결해 주세요.',focus:'recaptureSource'};
    if(sourceNeedsReconnect(study))return {view:'product',message:'선택한 화면 크기로 다시 연결해 주세요. 캡처는 이전 크기입니다.',focus:study.workflow?.source.kind==='html'?'connectHtml':'connectWeb'};
    if(browserSource(study)&&study.workflow?.source.inspection?.capture_ready===false)return {view:'product',message:'시작 화면 캡처를 새로고침한 뒤 진행해 주세요.',focus:'sourcePreview'};
    if(view!=='source-review'&&browserSource(study)&&explorationBlock(study))return {view:'source-review',message:explorationBlock(study),focus:'explorationJob'};
    if(!study.screens.length)return {view:'product',message:'살펴볼 화면을 먼저 연결해 주세요.',focus:'sourceUrl'};
    if(view==='source-review')return null;
    const audience=audienceBuilder.state();
    if(['personas','scope'].includes(view)&&!audience.description)return {view:'panel',message:'어떤 사용자를 위한 테스트인지 한두 문장으로 적어주세요.',focus:'audienceDescription'};
    if(['scope','run'].includes(view)){
      if(capabilities?.audience_builder_ready&&!audience.description)return {view:'panel',message:'어떤 사용자를 위한 테스트인지 한두 문장으로 적어주세요.',focus:'audienceDescription'};
      if(capabilities?.audience_builder_ready&&audienceBuilder.isDirty())return {view:'personas',message:'변경한 대상 사용자 구성을 먼저 저장해 주세요.',focus:'panelContinue'};
      if(!study.personas.length)return {view:'personas',message:'이번 테스트에 참여할 페르소나를 선택하고 저장해 주세요.',focus:'audienceCandidatesSection'};
      if(view==='run'&&!panelScopeReady())return {view:'scope',message:browserSource(study)&&siteMode(study)?`꼭 확인할 것은 한 줄에 ${PRIORITY_MAX_CHARS}자 이내, 최대 ${PRIORITIES_MAX}줄로 적어 주세요.`:'확인할 사용 흐름을 한 줄로 적어 주세요.',focus:browserSource(study)&&siteMode(study)?'scopePriorities':'workflowScope'};
    }
    return null;
  }

  function setupStepKey(s:Study){return `${KEY}:step:${s.serverId?`server:${s.serverId}`:s.id}`;}
  function rememberSetup(view:string){if(user&&!hasExecution()&&setupViews.includes(view)){localStorage.setItem(setupStepKey(study),view);localStorage.setItem(`${KEY}:step:${study.id}`,view);}}
  function resumeSetup(s:Study){
    if(!s.screens.length)return 'product';
    const saved=localStorage.getItem(setupStepKey(s))||localStorage.getItem(`${KEY}:step:${s.id}`);
    if(saved&&setupViews.includes(saved)&&(saved!=='run'||s.personas.length>0)&&(saved!=='proto'||!browserSource(s)))return saved;
    if(s.personas.length)return 'run';
    return browserSource(s)?'source-review':s.product.name&&s.product.description?'proto':'product';
  }
  function resumeView(s: Study) {
    if(!hasExecution(s))return resumeSetup(s);
    if(s.status==='running'||s.status==='failed')return 'run';
    if(s.runs?.act)return executionState(s).final?'report':'run';
    if(s.status==='done'&&s.results.some(r=>r.act))return 'report';
    return 'run';
  }

  function clearPlayback() { clearTimeout(playTimer); playTimer = undefined; visualQueue = []; seen.clear(); el('log').innerHTML = ''; }
  /* 새 테스트: 앱·웹을 고르거나 새로 추가하고, 무엇을 살펴볼지 이름을 붙인다. 수정 회차는 회차 상세만 받는다. */
  let dialogMode: 'new' | 'revision' = 'new', afterRevisionPrepare: (() => Promise<void>) | undefined;
  const NEW_PRODUCT = '__new';
  const PRIORITIES_MAX = 50, PRIORITY_MAX_CHARS = 300; // 백엔드 SITE_SCAN_MAX_PRIORITIES·SITE_SCAN_PRIORITY_MAX_CHARS와 같다
  const DEFAULT_TEST_TITLE = '전반 탐색';
  /** 이미 만든 앱·웹(소속 정보가 있는 것만). 이름·주소가 같다는 이유로 합치지 않는다. */
  function knownProducts(): { id: string; name: string; entry: WorkspaceEntry }[] {
    const seen = new Map<string, { id: string; name: string; entry: WorkspaceEntry }>();
    for (const e of workspaceEntries.values()) if (e.productId && !e.trashed && !e.archived && !seen.has(e.productId)) seen.set(e.productId, { id: e.productId, name: e.name, entry: e });
    return [...seen.values()];
  }
  function syncNewTestFields() {
    if (dialogMode === 'revision') return;
    const picked = input('newTestProduct').value, isNew = picked === NEW_PRODUCT || el('newTestProductField').hidden;
    el('newTestNameField').hidden = !isNew;
    // 새 앱·웹의 첫 테스트는 '전반 탐색'으로 시작하므로 이름을 묻지 않는다. 같은 앱·웹에 테스트를 더할 때만 구분용 이름을 받는다
    el('newTestTitleField').hidden = isNew;
    if (isNew && !input('newTestTestTitle').value) input('newTestTestTitle').value = DEFAULT_TEST_TITLE;
    if (!isNew && input('newTestTestTitle').value === DEFAULT_TEST_TITLE) input('newTestTestTitle').value = '';
  }
  let pendingInterviewPersona=0; // 개요에서 사람을 눌러 인터뷰로 올 때, 그 사람을 미리 고른다
  let stayRevisionServer=0;
  function openNewTestDialog(mode: 'new' | 'revision' = 'new', prepare?: () => Promise<void>, opts: { productId?: string; forceNew?: boolean; stayServer?: number; prevNote?: string } = {}){
    if(!user){location.hash='#login';return;}
    dialogMode=mode;afterRevisionPrepare=prepare;stayRevisionServer=mode==='revision'?opts.stayServer||0:0;
    const dialog=el<HTMLDialogElement>('newTestDialog'),revision=mode==='revision',products=revision?[]:knownProducts();
    el('newTestTitle').textContent=revision?'수정 회차 만들기':'새 앱·웹';
    el('newTestLead').textContent=revision?'이번 회차에서 무엇을 확인하거나 바꿨는지 짧게 적어 주세요. 비워 둬도 돼요.':'앱·웹 이름만 적으면 시작할 수 있어요. 고친 뒤 다시 확인하는 건 수정 회차로 쌓여요.';
    el('newTestSubmit').textContent=revision?'회차 만들기':'만들기';
    el('newTestProductField').hidden=true; // 같은 앱·웹의 다음 확인은 새 테스트가 아니라 '수정 회차'로 쌓는다
    el('newTestNameField').hidden=revision;el('newTestTitleField').hidden=revision;el('newTestNoteField').hidden=!revision;
    const select=el<HTMLSelectElement>('newTestProduct');
    select.innerHTML=products.map(p=>`<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('')+`<option value="${NEW_PRODUCT}">＋ 새 앱·웹 추가</option>`;
    // '새 앱·웹' 버튼은 새 앱·웹으로, 앱·웹 안의 '테스트 추가'는 그 앱·웹으로, 그 밖에는 지금 보던 앱·웹으로 시작한다
    const current=opts.forceNew?NEW_PRODUCT:opts.productId||workspaceEntries.get(selectedWorkspaceKey())?.productId;
    select.value=current===NEW_PRODUCT?NEW_PRODUCT:current&&products.some(p=>p.id===current)?current:products.length?products[0].id:NEW_PRODUCT;
    input('newTestName').value='';input('newTestTestTitle').value='';input('newTestNote').value='';el('newTestError').textContent='';
    { // 수정 회차: 이전 회차에 적은 글을 한 번 눌러 그대로 가져올 수 있게 한다
      const prevNote=(opts.prevNote??study.roundNote??study.workflow?.scope.round_note??'').trim(),reuse=el<HTMLButtonElement>('newTestNoteReuse');
      reuse.hidden=!revision||!prevNote;reuse.dataset.note=prevNote;
      reuse.textContent=prevNote?`이전 회차 글 그대로 쓰기 · ${prevNote.length>40?prevNote.slice(0,40)+'…':prevNote}`:'';
    }
    syncNewTestFields();
    if(!dialog.open)dialog.showModal();
    input(revision?'newTestNote':el('newTestNameField').hidden?'newTestTestTitle':'newTestName').focus();
  }
  function askRevision(prepare?: () => Promise<void>, opts: { stayServer?: number; prevNote?: string } = {}){ openNewTestDialog('revision',prepare,opts); }
  /** 기존 앱·웹의 공통 자료(주소·화면 크기·대상 사용자·설명)를 새 테스트로 이어받는다. 과거 실행은 바꾸지 않는다. */
  async function inheritFromProduct(from: WorkspaceEntry, draftId: string) {
    const owner = sessionEpoch;
    let url = '', viewport = '', kind = '', audience: AudienceDefinition | undefined, description = '';
    const local = localStudies().find(s => s.id === from.local || (from.server && s.serverId === from.server));
    if (local) { url = local.workflow?.source.url || ''; viewport = local.workflow?.scope.viewport || ''; kind = local.workflow?.scope.product_kind || ''; audience = local.workflow?.scope.audience; description = local.product.description; }
    else if (from.server) {
      try { const [wf, detail] = await Promise.all([api.getWorkflow(from.server), api.getStudy(from.server)]); url = wf.source.url || ''; viewport = wf.scope.viewport || ''; kind = wf.scope.product_kind || ''; audience = wf.scope.audience; const d = detail.product?.description || ''; description = d.includes('\n') ? d.slice(d.indexOf('\n') + 1) : ''; } catch { return; }
    }
    if (!sameSession(owner, draftId) || study.id !== draftId || hasExecution() || study.screens.length) return;
    study.workflow = { study_id: 0, root_study_id: 0, revision: 1, source: { kind: 'manual' }, scope: { ...defaultScope(), ...(kind ? { product_kind: kind as WorkflowScope['product_kind'] } : {}), ...(viewport ? { viewport: viewport as WorkflowScope['viewport'] } : {}), ...(audience ? { audience } : {}), product_id: study.productId, test_title: study.testTitle, round_note: study.roundNote } };
    if (!study.product.description && description) study.product.description = description;
    persist(); syncInputs();
    if (url && location.hash === '#product') { input('sourceUrl').value = url; notice('이 앱·웹의 이전 연결 주소와 대상 사용자 설정을 가져왔어요. 화면 연결을 눌러 새로 확인하세요.'); }
  }
  function submitNewTest(){
    const note=input('newTestNote').value.trim();
    if(dialogMode==='revision'){
      el<HTMLDialogElement>('newTestDialog').close();
      if(stayRevisionServer){
        // 워크스페이스 개요에서 만들면 화면을 옮기지 않고, 바로 오른쪽에 새 회차 카드가 생긴다
        const from=stayRevisionServer;stayRevisionServer=0;
        void task(async()=>{const owner=sessionEpoch;const created=await api.createRevision(from,note);requireSession(owner);await probe();renderWorkspace();notice(`새 회차를 만들었어요. 오른쪽 카드에서 이어서 설정하세요.${created.id?'':''}`);});
        return;
      }
      if(afterRevisionPrepare){const prepare=afterRevisionPrepare;void task(async()=>{await prepare();await createStudy(true,note,true);});}
      else createStudy(true,note);
      return;
    }
    const picked=el('newTestProductField').hidden?NEW_PRODUCT:input('newTestProduct').value,existing=knownProducts().find(p=>p.id===picked);
    const name=existing?existing.name:input('newTestName').value.trim();
    const testTitle=input('newTestTestTitle').value.trim()||(existing?'':DEFAULT_TEST_TITLE);
    if(!name){el('newTestError').textContent='앱·웹 이름을 입력해 주세요.';input('newTestName').focus();return;}
    if(!testTitle){el('newTestError').textContent='무엇을 살펴볼지 테스트 이름을 적어 주세요. 예: 가입 흐름';input('newTestTestTitle').focus();return;}
    el<HTMLDialogElement>('newTestDialog').close();
    createStudy(false);
    if(location.hash!=='#product')return; // 진행 중인 작업 때문에 열리지 않았다면 이름을 덮어쓰지 않는다
    study.productId=existing?existing.id:crypto.randomUUID();study.testTitle=testTitle;
    study.product={...study.product,name};input('pname').value=name;persist();
    if(existing)void inheritFromProduct(existing.entry,study.id);
  }
  el('newTestProduct').addEventListener('change',syncNewTestFields);
  el('newTestForm').addEventListener('submit',event=>{event.preventDefault();submitNewTest();});
  el('newTestCancel').addEventListener('click',()=>el<HTMLDialogElement>('newTestDialog').close());
  function createStudy(copy = false, note = '', fromTask = false): Promise<void> | void {
    workspaceView='active';input('workspaceFilter').value='all';
    if (!user) { location.hash = '#login'; return; }
    if(busy&&!fromTask){notice('현재 저장·연결 작업이 끝나면 새 테스트를 열 수 있어요.',true);return;}
    if (running||study.status==='running') { notice('현재 실행이 끝나거나 취소된 뒤 새 테스트를 시작해 주세요.', true); return; }
    if(copy && study.serverId && capabilities?.workflow_ready){const work=async()=>{const owner=sessionEpoch,id=study.id;const created=await api.createRevision(study.serverId!,note);requireSession(owner,id);await openStudy(undefined,created.id);location.hash='#product';notice('이전 기록을 보존하고 같은 테스트의 새 수정 회차를 만들었습니다.');};if(fromTask)return work();void task(work);return;}
    try { archiveCurrent(); } catch { notice('작성 중인 테스트를 보관하지 못했습니다.', true); return; }
    input('plan').value='';const previous = study; study = newStudy(); study.count = DEFAULT_PANEL_COUNT; if(note)study.roundNote = note;
    study.screens = structuredClone(copy ? previous.screens : []);revisions=[];sourceFiles=[];
    study.goal = copy ? previous.goal : ''; study.task = copy ? previous.task : '';
    if (copy) { study.product = structuredClone(previous.product); study.conditions = structuredClone(previous.conditions); study.count = previous.count; study.seed = previous.seed; study.panelSource = previous.panelSource; study.libraryPanelId = previous.libraryPanelId; }
    clearPlayback(); persist(); syncInputs(); lockInputs();
    el('askTag').textContent = 'Ask 대기'; el('actTag').textContent = 'Act 대기';
    (el('runBar').firstElementChild as HTMLElement).style.transform = 'scaleX(0)';
    el('startRun').textContent = '실행 시작'; workspaceSidebar.show('tests'); location.hash = '#product'; notice('');
  }
  // Boards for tests that only exist on the server: load the selected one on demand with the existing APIs.
  const serverDetail = new Map<number, { people: WorkspacePerson[]; roundList: WorkspaceRound[]; at: number; screens?: number; personas?: number }>();
  const serverDetailLoading = new Set<number>();
  const roundState = (status: string): [WorkspaceRound['state'], string] => status === 'done' ? ['done', '완료'] : status === 'running' || status === 'pending' ? ['running', '실행 중'] : status === 'failed' ? ['failed', '중단'] : status === 'ready' ? ['ready', '준비 완료'] : ['draft', '작성 중'];
  async function ensureServerDetail(key: string) {
    const entry = workspaceEntries.get(key), id = entry?.server;
    const cached = id ? serverDetail.get(id) : undefined;
    // 결과가 바뀔 수 있으므로(실행이 끝난 직후, 인터뷰를 한 뒤) 오래된 정보는 다시 가져온다
    if (!id || entry?.trashed || (entry?.people?.some(p => p.state && p.state !== 'pending') && !cached) || (cached && Date.now() - cached.at < 4000) || serverDetailLoading.has(id) || !serverReady || demoEnabled()) return;
    serverDetailLoading.add(id); const owner = sessionEpoch;
    try {
      const [detail, revisions] = await Promise.all([api.getStudy(id), api.getRevisions(id).catch(() => [] as Revision[])]);
      // 가장 최근 회차가 아직 실행 전이면, 결과가 있는 가장 최근 회차의 사람들을 인터뷰 목록에 쓴다
      let src = detail, srcId = id;
      if (![...(detail.runs || [])].some(run => run.mode === 'act' && run.status === 'done')) {
        const prior = [...revisions].sort((a, b) => b.revision - a.revision).find(r => r.study_id !== id && r.runs.some(x => x.mode === 'act' && x.status === 'done'));
        if (prior) { try { src = await api.getStudy(prior.study_id); srcId = prior.study_id; } catch { /* 이 회차의 사람들로 둔다 */ } }
      }
      const latestAct = [...(src.runs || [])].filter(run => run.mode === 'act').sort((a, b) => b.id - a.id)[0];
      const report = latestAct ? await api.getRunReport(latestAct.id) : await api.getReport(srcId);
      if (!sameSession(owner)) return;
      const screens = src.prototype?.screens || [];
      const people: WorkspacePerson[] = src.personas.slice(0, 200).map(p => {
        const attributes = displayAttributes(p.attributes), res = report.results.find(r => r.id === p.id), act = res?.act, last = act?.events[act.events.length - 1];
        const lane = act ? (act.end.result === 'complete' ? 2 : 3) : latestAct && ['running', 'pending'].includes(latestAct.status) ? 1 : latestAct?.status === 'failed' ? 3 : 0;
        return { studyId: srcId, pid: p.id, code: act?.end.drop_reason || undefined, state: res?.act ? outcome(res) : 'pending' as const, id: personaId(p), age: attributes.profile.age, job: attributes.profile.job_group, face: portraitMarkup(attributes, 'ws-face-img'), lane: lane as 0 | 1 | 2 | 3, quote: last?.reason || last?.drop_reason || act?.end.drop_reason || '', screen: screens.find(x => x.id === (last?.screen || act?.end.screen))?.label || '', actions: act?.events.length || 0, refs: new Set(act?.events.map(e => e.screen)).size };
      });
      // 회차마다 저장된 결과를 모아 '쌓이는' 추이를 만든다
      const statsOf = async (r: Revision): Promise<WorkspaceRound['stats']> => {
        const act = [...r.runs].filter(x => x.mode === 'act' && x.status === 'done').sort((a, b) => b.id - a.id)[0];
        if (!act) return undefined;
        try { const rep = act.id === latestAct?.id ? report : await api.getRunReport(act.id); const rows = rep.results.filter(x => x.act); if (!rows.length) return undefined; const o = rows.map(x => outcome(x)); const issues = new Set(rows.filter(x => outcome(x) === 'drop').map(x => `${x.act!.end.screen}|${x.act!.end.drop_reason}`)); return { llm: rep.engine === 'llm', total: rows.length, complete: o.filter(k => k === 'complete').length, drop: o.filter(k => k === 'drop').length, system: o.filter(k => k === 'system').length, visited: new Set(rows.flatMap(x => x.act!.path)).size, problems: issues.size }; } catch { return undefined; }
      };
      // 사람마다 서버에 저장된 인터뷰 대화 개수를 모아 개요에 보여 준다
      if (latestAct) {
        const counts = await Promise.all(people.map((p, i) => i < 24 && p.state && p.state !== 'pending' && p.pid ? api.getInterview(latestAct.id, p.pid).then(r => r.messages.length).catch(() => 0) : Promise.resolve(0)));
        people.forEach((p, i) => { p.asked = counts[i]; });
      }
      const wfScope = await api.getWorkflow(id).then(w => w.scope).catch(() => undefined);
      const siteRound = wfScope ? (wfScope.exploration ? wfScope.exploration === 'site' : !(wfScope.goal_url || wfScope.goal_text)) : false;
      const sortedRevisions = [...revisions].sort((a, b) => a.revision - b.revision);
      const allStats = await Promise.all(sortedRevisions.map(statsOf));
      if (!sameSession(owner)) return;
      const roundList: WorkspaceRound[] = sortedRevisions.map((r, i) => { const [state, stateLabel] = roundState(r.status); return { label: `R${i + 1}`, state, stateLabel, date: r.created_at?.slice(0, 10) || undefined, studyId: r.study_id, note: r.note || undefined, stats: allStats[i], site: siteRound }; });
      serverDetail.set(id, { people, roundList, at: Date.now(), screens: screens.length, personas: src.personas.length });
      renderWorkspace();
    } catch { /* leave the board empty; opening the test shows the actual error */ } finally { serverDetailLoading.delete(id); }
  }
  // 회차 하나 삭제: 카드 안에서 한 번 더 확인한 뒤 지운다(1회차는 버튼이 없고, 서버도 거절한다)
  async function roundDeleteAction(button: HTMLElement) {
    const wrap = button.closest<HTMLElement>('.ws-rdel-wrap'); if (!wrap) return;
    if (button.dataset.roundDelete) {
      const id = button.dataset.roundDelete;
      wrap.innerHTML = `<span class="ws-rdel-ask">이 회차의 결과와 기록이 모두 지워져요.</span><button type="button" class="ws-rdel danger" data-round-delete-yes="${id}">삭제</button><button type="button" class="ws-rdel" data-round-delete-cancel>취소</button><em class="ws-rnote-err" role="alert"></em>`;
      return;
    }
    if (button.hasAttribute('data-round-delete-cancel')) { renderWorkspace(); return; }
    const id = Number(button.dataset.roundDeleteYes), err = wrap.querySelector<HTMLElement>('.ws-rnote-err');
    if (!id || busy) return; const owner = sessionEpoch; busy = true; (button as HTMLButtonElement).disabled = true;
    try {
      await api.discardRound(id); requireSession(owner);
      serverStudies = serverStudies.filter(s => s.id !== id); serverDetail.clear();
      if (study.serverId === id) { study = blankStudy(); revisions = []; sourceFiles = []; clearPlayback(); persist(); }
      try { const history = JSON.parse(localStorage.getItem(KEY + ':history') || '[]'); if (Array.isArray(history)) localStorage.setItem(KEY + ':history', JSON.stringify(history.filter((s: Study) => s?.serverId !== id))); } catch { /* 브라우저 복사본 정리는 실패해도 서버 결과와 무관하다 */ }
      await probe(); renderWorkspace(); notice('회차를 삭제했어요.');
    } catch (e) { (button as HTMLButtonElement).disabled = false; if (err) err.textContent = e instanceof Error ? e.message : '삭제하지 못했어요.'; }
    finally { if (sameSession(owner)) busy = false; }
  }
  // 회차 카드의 '바꾼 점' 한두 줄: 카드 안에서 바로 쓰고 저장한다
  async function roundNoteAction(button: HTMLElement) {
    const wrap = button.closest<HTMLElement>('.ws-rnote-wrap, .ws-rnote-editor'); if (!wrap) return;
    if (button.dataset.roundNote) {
      const id = button.dataset.roundNote, text = button.dataset.note || '';
      const editor = document.createElement('div'); editor.className = 'ws-rnote-editor';
      const area = document.createElement('textarea'); area.className = 'ws-rnote-input'; area.maxLength = 200; area.rows = 2; area.value = text; area.placeholder = '예: 약관 동의를 한 화면으로 줄였어요'; area.setAttribute('aria-label', '이 회차에서 바꾼 점');
      const actions = document.createElement('span'); actions.className = 'ws-rnote-actions';
      const save = document.createElement('button'); save.type = 'button'; save.className = 'ws-rnote-edit'; save.dataset.roundNoteSave = id; save.textContent = '저장';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'ws-rnote-edit'; cancel.dataset.roundNoteCancel = ''; cancel.textContent = '취소';
      const err = document.createElement('em'); err.className = 'ws-rnote-err'; err.setAttribute('role', 'alert');
      actions.append(save, cancel, err); editor.append(area, actions); wrap.replaceWith(editor); area.focus(); return;
    }
    if (button.hasAttribute('data-round-note-cancel')) { renderWorkspace(); return; }
    const id = Number(button.dataset.roundNoteSave), area = wrap.querySelector<HTMLTextAreaElement>('textarea'), err = wrap.querySelector<HTMLElement>('.ws-rnote-err');
    if (!area || !id) return; const note = area.value.trim().slice(0, 200); (button as HTMLButtonElement).disabled = true;
    try {
      const wf = await api.getWorkflow(id); await api.saveWorkflow(id, { ...wf.scope, round_note: note });
      for (const d of serverDetail.values()) for (const r of d.roundList) if (r.studyId === id) r.note = note || undefined;
      if (study.serverId === id) { study.roundNote = note; if (study.workflow) study.workflow.scope.round_note = note; }
      renderWorkspace();
    } catch (e) { (button as HTMLButtonElement).disabled = false; if (err) err.textContent = e instanceof Error ? e.message : '저장하지 못했어요.'; }
  }
  function renderWorkspace() {
    { const trashed = [...workspaceEntries.values()].filter(e => e.trashed && e.server).length; const btn = el('emptyTrashBtn'); btn.hidden = !(workspaceView === 'trash' && trashed > 0); btn.textContent = `휴지통 비우기 (${trashed})`; }
    const rows = new Map<string, WorkspaceEntry>();
    for (const s of localStudies().sort((a,b)=>(b.workflow?.revision||1)-(a.workflow?.revision||1))) {
      const remote=serverStudies.find(r=>r.id===s.serverId);
      if(s.serverId&&serverReady&&workspaceChecked&&capabilities?.workspace_management_ready&&!remote)continue;
      const root=s.workflow?.root_study_id||remote?.root_study_id||s.serverId;
      const key = root ? `server:${root}` : s.id;
      if(root&&serverStudies.some(r=>(r.root_study_id||r.id)===root&&(r.revision||1)>(s.workflow?.revision||remote?.revision||1)))continue;
      if (rows.has(key)) continue;
      const management=remote?.workspace||s.workspace;
      rows.set(key, {productId:s.productId||remote?.product_id||s.workflow?.scope?.product_id||undefined,testTitle:s.testTitle||remote?.test_title||s.workflow?.scope?.test_title||undefined,note:s.roundNote??remote?.round_note??s.workflow?.scope?.round_note??undefined,key,archived:management?.archived,trashed:management?.trashed,manageable:!s.serverId||Boolean(capabilities?.workspace_management_ready&&serverReady),server:s.serverId,rounds:root?serverStudies.filter(r=>(r.root_study_id||r.id)===root).length||1:1, name: management?.display_name||(remote&&capabilities?.workspace_management_ready?remote.name:s.product.name||testName(s.name)), description: s.task || s.product.description || '제품 소개부터 이어서 작성하세요.', context: s.product.description || undefined, state: ((st: Study['status']) => st === 'draft' && s.personas.length ? 'ready' : st)(remote?.status && remote.status !== 'draft' ? remote.status as Study['status'] : s.status), local: s.id, screens: s.screens.length, personas: s.personas.length, records: s.results.filter(r => r.act).length, personaIds: s.personas.slice(0,3).map(p => personaId(p)), people: s.personas.slice(0, 12).map(p => { const act = s.results.find(r => r.id === p.id)?.act; const last = act?.events[act.events.length - 1]; const lane = act ? (act.end.result === 'complete' ? 2 : 3) : (s.status === 'running' ? 1 : s.status === 'failed' ? 3 : 0); const label = s.screens.find(x => x.id === (last?.screen || act?.end.screen))?.label || ''; return { id: personaId(p), age: p.attributes.profile.age, job: p.attributes.profile.job_group, face: portraitMarkup(p.attributes, 'ws-face-img'), lane: lane as 0 | 1 | 2 | 3, quote: last?.reason || last?.drop_reason || act?.end.drop_reason || '', screen: label, actions: act?.events.length || 0, refs: new Set(act?.events.map(e => e.screen)).size }; }), kind: ({ web: '웹 서비스', ios: 'iOS 앱', android: 'Android 앱' } as Record<string, string>)[s.workflow?.scope?.product_kind || ''] || undefined, created: s.created, startedAt: s.runStartedAt, step: hasExecution(s) ? undefined : Math.max(0, ['product', 'source-review', 'panel', 'personas', 'scope', 'run'].indexOf(({ proto: 'source-review' } as Record<string, string>)[resumeSetup(s)] || resumeSetup(s))), source: s.reportSource === 'local-demo' ? '로컬 가상 예시' : s.reportSource === 'ui-mock' ? 'UI 목데이터' : s.serverId ? '서버에 연결됨' : '이 브라우저에 저장됨' });
    }
    for (const s of [...serverStudies].sort((a,b)=>(b.revision||1)-(a.revision||1))) if (!rows.has(`server:${s.root_study_id||s.id}`)) rows.set(`server:${s.root_study_id||s.id}`, { productId:s.product_id||undefined,testTitle:s.test_title||undefined,note:s.round_note||undefined,key:`server:${s.root_study_id||s.id}`,archived:s.workspace?.archived,trashed:s.workspace?.trashed,manageable:Boolean(capabilities?.workspace_management_ready&&serverReady),rounds:serverStudies.filter(r=>(r.root_study_id||r.id)===(s.root_study_id||s.id)).length,name:s.workspace?.display_name||testName(s.name), description: '서버에 저장된 테스트입니다. 열어서 화면과 탐색 기록을 확인하세요.', state: s.status, server: s.id, source: '서버에 저장됨' });
    for (const row of rows.values()) {
      const extra = row.server ? serverDetail.get(row.server) : undefined;
      if (extra) { if (extra.people.length) { row.people = extra.people; row.records = extra.people.filter(p => p.state && p.state !== 'pending').length; } if (extra.roundList.length) row.roundList = extra.roundList; if (extra.screens) row.screens = extra.screens; if (extra.personas) row.personas = extra.personas; }
      if (!row.roundList?.length) { const date = row.startedAt || row.created; if (date) { const [state, stateLabel] = roundState(row.state === 'pending' ? 'running' : row.state); row.roundList = [{ label: `R${row.rounds || 1}`, state, stateLabel, date, dateKind: row.startedAt ? 'started' : 'created' }]; } }
      else if (row.startedAt) { const last = row.roundList[row.roundList.length - 1]; last.date = row.startedAt; last.dateKind = 'started'; }
    }
    if (demoEnabled()) demoEntries().forEach(e => rows.set(e.key!, e)); // 실제 테스트는 그대로 두고 예시를 뒤에 덧붙인다
    const query = input('workspaceSearch').value.trim().toLocaleLowerCase('ko-KR');
    workspaceEntries=rows;
    const activeCount=[...rows.values()].filter(r=>!r.archived&&!r.trashed).length;
    el('workspaceCount').textContent=String(activeCount);el('workspaceNavCount').textContent=String(new Set([...rows.values()].filter(r=>!r.archived&&!r.trashed).map(r=>r.productId||r.key)).size);
    root.querySelectorAll<HTMLElement>('[data-wm-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.wmView===workspaceView)));
    el('workspaceSideList').innerHTML = workspaceSideList([...rows.values()], query, input('workspaceSort').value, workspaceView, input('workspaceFilter').value, !workspaceChecked);
    el('workspaceStudies').innerHTML = workspaceContent([...rows.values()], query, input('workspaceSort').value, serverReady, !workspaceChecked,workspaceView,input('workspaceFilter').value);
    root.querySelectorAll<HTMLElement>('[data-ws-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.wsTab === getWorkspaceTab())));
    const shown = root.querySelector<HTMLElement>('.ws-it.sel')?.dataset.wsSelect; if (shown) void ensureServerDetail(shown);
    { const open = visibleTabs(shown ? workspaceEntries.get(shown) : undefined); root.querySelectorAll<HTMLElement>('[data-ws-tab]').forEach(b => { b.hidden = !open.includes(b.dataset.wsTab as never); b.setAttribute('aria-selected', String(b.dataset.wsTab === getWorkspaceTab())); }); }
    workspaceSidebar.render();
  }
  function trackServerDraft(id:number){if(!serverStudies.some(s=>s.id===id))serverStudies.push({id,name:study.product.name||study.name,status:'draft',root_study_id:id,revision:1,product_id:study.productId,test_title:study.testTitle,round_note:study.roundNote,workspace:study.workspace});}
  async function manageWorkspaceEntry(entry:WorkspaceEntry,action:api.ManagementAction,fields:{name?:string;confirmation?:string}) {
    const owner=sessionEpoch;requireSession(owner);if(busy)throw new Error('진행 중인 요청이 끝난 뒤 다시 시도하세요.');busy=true;
    try{
      let result:api.ManagementResult|undefined;
      if(entry.server){
        if(!serverReady||!capabilities?.workspace_management_ready)throw new Error('서버에 다시 연결한 뒤 관리할 수 있습니다.');
        result=await api.manageStudy(entry.server,action,fields);requireSession(owner);
        try{localStorage.setItem(KEY+':management-sync',crypto.randomUUID());}catch{/* 다른 탭 알림 실패가 서버 결과를 바꾸지 않는다. */}
      }else if(['running','pending'].includes(entry.state)&&action!=='rename')throw new Error('실행이 끝난 뒤 관리할 수 있습니다.');
      const matches=(s:Study)=>result?Boolean(s.serverId&&result!.affected_study_ids.includes(s.serverId)):s.id===entry.local;
      const all=[...new Map(localStudies().map(s=>[s.id,s])).values()];
      if(action==='duplicate'){
        if(result?.duplicate_id){await probe();requireSession(owner);await openStudy(undefined,result.duplicate_id);}
        else{
          const original=all.find(matches);if(!original)throw new Error('복제할 초안이 없습니다.');
          archiveCurrent();const fresh=newStudy();const copy=structuredClone(original);
          study={...copy,id:fresh.id,created:fresh.created,serverId:undefined,status:'draft',runs:undefined,results:[],evidence:[],workspace:{display_name:entry.name.slice(0,195)+' 복사본',archived:false,trashed:false},workflow:copy.workflow?{...copy.workflow,study_id:0,root_study_id:0,revision:1}:undefined};
          persist();syncInputs();lockInputs();location.hash='#product';
        }
        workspaceView='active';renderWorkspace();return;
      }
      const next=result?.workspace||{...all.find(matches)?.workspace};
      if(!result){if(action==='rename')next.display_name=fields.name;if(action==='archive'||action==='unarchive')next.archived=action==='archive';if(action==='trash')next.trashed=true;if(action==='restore'){next.trashed=false;next.archived=false;}}
      const affectedCurrent=matches(study),remove=action==='delete';
      const updated=all.filter(s=>!remove||!matches(s)).map(s=>matches(s)?{...s,workspace:next}:s);
      if(result){serverStudies=serverStudies.filter(s=>!remove||!result!.affected_study_ids.includes(s.id)).map(s=>result!.affected_study_ids.includes(s.id)?{...s,workspace:next}:s);}
      // 같은 루트의 과거 회차도 갱신해 캐시에서 다시 나타나지 않게 한다.
      for(const old of all.filter(matches))if(remove){localStorage.removeItem(`${KEY}:step:${old.id}`);localStorage.removeItem(setupStepKey(old));}
      if(affectedCurrent&&(remove||action==='trash'||action==='archive')){study=blankStudy();revisions=[];sourceFiles=[];clearPlayback();comparisonRequest++;el('comparisonResult').replaceChildren();}
      else if(affectedCurrent)study={...study,workspace:next};
      localStorage.setItem(KEY+':history',JSON.stringify(updated.filter(s=>s.id!==study.id).map(browserSnapshot)));
      persist();syncInputs();lockInputs();workspaceSidebar.reset();renderWorkspace();
    }finally{if(sameSession(owner))busy=false;}
  }
  async function openStudy(localId?: string, serverId?: number, runId?: number) {
    const owner = sessionEpoch; requireSession(owner);
    if (running) throw new Error('현재 실행이 끝난 뒤 다른 테스트를 열어 주세요.');
    const cached = localId ? localStudies().find(s => s.id === localId) : undefined;
    if (localId && !cached) throw new Error('이 브라우저에서 테스트를 찾지 못했습니다.');
    let restored: Study;
    if (cached) {restored=structuredClone(cached);if(restored.workspace?.trashed)throw new Error('휴지통에서 먼저 복원하세요.');if(restored.serverId&&serverReady&&capabilities?.workspace_management_ready){const detail=await api.getStudy(restored.serverId);requireSession(owner);restored.workspace=detail.workspace;}}
    else {
      if (!serverId) return;
      const [detail, initialReport] = await Promise.all([api.getStudy(serverId), api.getReport(serverId)]);
      const latestAct = runId ? detail.runs?.find(run => run.id === runId && run.mode === 'act') : [...(detail.runs || [])].filter(run => run.mode === 'act').sort((a,b) => b.id - a.id)[0];
      if (runId && !latestAct) throw new Error('이 테스트의 UI·UX 실행 기록을 찾지 못했습니다.');
      const report=latestAct ? await api.getRunReport(latestAct.id) : initialReport;
      requireSession(owner);
      restored = newStudy(); restored.serverId = serverId; restored.name = detail.name;restored.workspace=detail.workspace;
      if (detail.product) { const parts = detail.product.description.split('\n'); restored.product = { name: parts.length > 1 ? parts.shift()! : detail.name, description: parts.join('\n'), features: detail.product.features, price: detail.product.price }; }
      restored.screens = detail.prototype?.screens || []; restored.goal = detail.task?.goal_screen_id || ''; restored.task = detail.task?.description || '';
      restored.personas = detail.personas.map(p=>({...p,attributes:displayAttributes(p.attributes)})); restored.count = detail.personas.length || DEFAULT_PANEL_COUNT; restored.results = report.results; restored.runMeta = report.meta ?? null; restored.reportSource=report.source==='local-demo'?'local-demo':undefined;
      restored.libraryPanelId = detail.personas[0]?.attributes.source.library_panel_id;
      restored.panelSource = restored.libraryPanelId ? 'library' : detail.personas.length ? 'engine' : 'library';
      restored.runs = Object.fromEntries([...(detail.runs || [])].sort((a,b) => a.id - b.id).map(run => [run.mode, run.id]));
      if (runId && latestAct) restored.runs.act = latestAct.id;
      restored.status = latestAct ? latestAct.status==='done'?'done':latestAct.status==='failed'?'failed':'running' : detail.personas.length?'ready':'draft';
      if (runId && latestAct) restored.status = latestAct.status === 'done' ? 'done' : latestAct.status === 'failed' ? 'failed' : 'running';
      if(latestAct)recordRunStatus(restored,latestAct.id,latestAct);
    }
    if(cached && restored.serverId && restored.runs?.act){const state=await api.getRun(restored.runs.act);requireSession(owner);recordRunStatus(restored,restored.runs.act,state);}
    if(restored.serverId && capabilities?.workflow_ready) await hydrateWorkflow(restored);
    requireSession(owner); archiveCurrent(); study = restored;runRefreshPaused=false; clearPlayback(); persist(); syncInputs(); lockInputs();
    el('startRun').textContent = study.runs?.ask || study.runs?.act ? '실행 상태 확인' : '실행 시작';
    workspaceSidebar.show('tests'); location.hash = `#${resumeView(study)}`; notice('');
    if(study.runs?.act&&study.status==='running')void refreshStoredRun();
  }
  let noticeTimer=0;
  function notice(text: string, error = false) { const n = el('liveNotice'); window.clearTimeout(noticeTimer); if(text)noticeTimer=window.setTimeout(()=>{n.hidden=true;n.textContent='';},error?12000:5000); n.textContent = text; n.classList.toggle('error', error); n.setAttribute('role',error?'alert':'status'); n.hidden = !text || !(steps.includes(location.hash.slice(1)) || location.hash === '#workspace'); }
  function persist() { renderStudioContext();renderPanelNavigation(); if (!user) return; try { localStorage.setItem(KEY, JSON.stringify(browserSnapshot(study)));rememberSetup(location.hash.slice(1)); } catch { notice('브라우저 저장 공간이 부족합니다. 현재 화면을 닫기 전에 결과를 내려받으세요.', true); } }
  const message = (error: unknown) => error instanceof Error ? error.message : String(error);
  async function task(work: () => Promise<void>) { if (!user) return; if (busy) { notice('이전 작업이 끝나는 중이에요. 잠시 뒤 다시 눌러 주세요.', true); return; } const owner = sessionEpoch; busy = true; try { await work(); } catch (error) { if (sameSession(owner)) notice(message(error), true); } finally { if (sameSession(owner)) busy = false; } }
  function syncInputs() {
    fillProductFromScreens();
    input('pname').value = study.product.name; input('roundNote').value = study.roundNote ?? study.workflow?.scope.round_note ?? ''; input('pdesc').value = study.product.description;
    input('pfeat').value = study.product.features.join('\n'); input('pprice').value = study.product.price;
    input('task').value = study.task;
    const countSelect = el<HTMLSelectElement>('panelCount');
    if (![...countSelect.options].some(option => option.value === String(study.count))) { const option = document.createElement('option'); option.value = String(study.count); option.textContent = `${study.count}명 · 저장된 패널`; countSelect.add(option); }
    input('panelCount').value = String(study.count);
    input('panelPreset').value = study.conditions.preset; input('panelPrice').value = study.conditions.price[0] || '';
    input('screenJson').value = JSON.stringify(study.screens, null, 2);
    el('goal').innerHTML = study.screens.map(s => `<option value="${escape(s.id)}">${escape(s.id)} ${escape(s.label)}</option>`).join(''); input('goal').value = study.goal;
    input('panelSource').value = study.panelSource || (study.personas.length && !study.personas[0]?.attributes.source.library_panel_id ? 'engine' : 'library');
    renderLibraryControls(); renderScreens(); renderPanel(); renderReport(); renderRoster(); buildPhones();syncWorkflow();renderStudioContext();
  }
  function readInputs() {
    if(hasExecution())return;
    study.roundNote = input('roundNote').value.trim();
    study.product = { name: input('pname').value.trim(), description: input('pdesc').value.trim(), features: input('pfeat').value.split('\n').map(v => v.trim()).filter(Boolean), price: input('pprice').value.trim() };
    study.name = study.product.name ? `${study.product.name} 테스트` : '새 테스트';
    if(!browserSource(study)){study.task = input('task').value.trim(); study.goal = input('goal').value;}
    readScope();
    if(!capabilities?.audience_builder_ready){study.count = Number(input('panelCount').value); const preset = input('panelPreset').value;
    study.conditions = { preset, age: preset === 'univ' ? '20-29' : preset === '30s_office' ? '30-39' : preset === '60plus' ? '60-' : '40-49', price: input('panelPrice').value ? [input('panelPrice').value] : [] };
    study.panelSource = input('panelSource').value === 'engine' ? 'engine' : 'library';
    study.libraryPanelId = Number(input('libraryPanel').value) || study.libraryPanelId;}
    persist();
  }
  function validate() {
    readInputs();if(!study.screens.length)throw new Error('먼저 살펴볼 화면을 연결해 주세요.');
    fillProductFromScreens();
    if(!study.product.features.length)study.product.features=[study.workflow?.scope.scenario||study.task||'화면 이해와 주요 경로 탐색'];
    if(browserSource(study)){if(!study.screens.length)throw new Error('먼저 화면을 연결하세요.');return;}
    validateScreens(study.screens); if (!study.task || !study.goal || !reachable(study.screens, study.goal)) throw new Error('사용 흐름과 도달 가능한 목표 화면을 설정해 주세요.');
  }
  async function prepare() { const owner = sessionEpoch, draftId = study.id; requireSession(owner); validate(); const id = await api.prepareStudy(study, value => { if (sameSession(owner, draftId)) { study.serverId = value;trackServerDraft(value);persist(); } }); requireSession(owner, draftId); study.serverId = id;if(capabilities?.workflow_ready){study.workflow=await api.getWorkflow(id);requireSession(owner,draftId);}persist();return id; }
  async function probe() {
    if (!user) return;
    const owner = sessionEpoch;
    try {
      const [cap, panels] = await Promise.all([api.getCapabilities(), api.listLibraryPanels()]);
      const list=await api.listStudies(Boolean(cap.workspace_management_ready));
      if (!sameSession(owner)) return;
      workspaceChecked = true; capabilities = cap; serverStudies = list; libraryPanels = Array.isArray(panels) ? panels : []; serverReady = true;
      if(study.serverId&&browserSource(study)&&!study.workflow?.source.preview)await restoreSavedPreview();
      const ownRemote=serverStudies.find(r=>r.id===study.serverId);if(ownRemote?.workspace)study.workspace=ownRemote.workspace;
      if(cap.workspace_management_ready&&study.serverId&&!busy&&!running&&(!ownRemote||ownRemote.workspace?.trashed)){
        const cached=localStudies().filter(s=>s.id!==study.id||Boolean(ownRemote)).map(s=>s.id===study.id?{...s,workspace:ownRemote?.workspace}:s);
        localStorage.setItem(KEY+':history',JSON.stringify(cached.map(browserSnapshot)));study=blankStudy();revisions=[];sourceFiles=[];clearPlayback();persist();syncInputs();lockInputs();if(steps.includes(location.hash.slice(1)))location.hash='#workspace';
      }
      if(study.runs?.act&&!study.execution&&!running&&!runRefreshPaused)await refreshStoredRun();
      renderLibraryControls(); renderTransmissionState();renderStudioContext();
      el('engineStatus').textContent = (libraryPanels.length || capabilities.persona_ready) && capabilities.agent_engine === 'rule' ? '규칙 기반 탐색 · 비용 없음' : (libraryPanels.length || capabilities.persona_ready) && capabilities.llm_ready ? cap.persona_transmission_allowed === false ? '연결됨 · 카드 전송 보류' : '엔진 연결됨' : '서버 연결 · 준비 필요';
      el('connectionContents').innerHTML = `<p>서버와 DB 연결 확인</p><p>페르소나 보관함 ${libraryPanels.reduce((n,p) => n+p.count,0)}명 · ${escape(cap.provider)} · ${escape(cap.model || '서버 설정 모델')}</p><ul>${cap.missing.map(m => `<li>${escape(m)}</li>`).join('') || '<li>저장된 페르소나와 LLM이 연결되어 있습니다.</li>'}</ul><p>탐색 상한: ${cap.max_turns ?? '서버 설정'}턴. 한도에 도달한 기록은 사용자 이탈과 구분합니다.</p>`;
    } catch (error) {
      if (!sameSession(owner)) return;
      workspaceChecked = true; serverReady = false; capabilities = null; libraryPanels = [];
      el('engineStatus').textContent = '서버 연결 필요'; el('connectionContents').textContent = message(error);
      renderLibraryControls(); renderTransmissionState();
    }
    renderWorkspace();
  }
  function renderTransmissionState() {
    renderRunControls();
  }
  function renderRunControls() {
    const executed=executedLayout(),records=hasActRecords(),hasRun=Boolean(study.runs?.act),state=executionState(study);
    el('v-run').classList.toggle('execution-started',executed);
    const runActions=executed&&browserSource(study)?el('browserExecution').querySelector<HTMLElement>('.ls-follow-controls'):el('runHeaderActions');
    runActions?.append(el('cancelRun'),el('pauseBtn'));
    const issue=navigationIssue('run');
    const unavailable=!serverReady?'실행 서버에 연결하지 못했습니다. 연결 상태를 확인해 주세요.':!hasRun&&capabilities?.agent_engine!=='rule'&&capabilities?.persona_transmission_allowed===false?'실제 페르소나 카드의 외부 전송이 보류되어 있어요. 설정을 저장하고 기존 결과를 살펴볼 수 있습니다.':!hasRun&&capabilities?.agent_engine!=='rule'&&!capabilities?.llm_ready?'새 탐색을 시작하려면 모델 연결이 필요합니다. 연결 상태를 확인해 주세요.':'';
    const reason=hasRun?unavailable:issue?.message||unavailable;
    el('transmissionStatus').hidden=!reason;
    // 규칙 기반 엔진이면 비용이 없다는 것과 결과가 체험용이라는 것을 실행 전에 알린다
    el('engineNotice').hidden=capabilities?.agent_engine!=='rule'||running||executedLayout();
    el('transmissionStatus').textContent=reason;
    const button=el<HTMLButtonElement>('startRun');button.disabled=running||Boolean(reason);
    button.textContent=running?'실행 상태 확인 중…':hasRun?'상태 새로고침':'실행하기 →';button.classList.toggle('solid',!records);button.hidden=hasRun&&state.canReport;
    el('runActionTitle').textContent=executed?(state.partial?'부분 실행 기록':state.final?'탐색 종료':'실행 관찰'):'6 / 6 · 실행';
    el('runActionState').textContent=reason||(runRefreshPaused?'서버 실행 상태를 다시 확인하세요. 연결 지연으로 완료 여부를 판단하지 않습니다.':'')||(executed?state.message:'설정을 확인하고 탐색을 시작하세요.');
    el('runTitle').textContent=!executed?'탐색할 준비가 됐나요?':study.status==='running'?'페르소나가 화면을 살펴보고 있어요.':study.status==='failed'?'실행 상태를 확인해 주세요.':records?'탐색 기록이 저장됐어요.':'실행이 종료됐어요.';
    el('runDescription').textContent=!executed?'대상 화면, 페르소나와 범위를 확인한 뒤 탐색을 시작하세요.':study.status==='running'?'저장된 행동과 화면이 순서대로 쌓입니다. 화면을 나가도 서버 실행은 계속됩니다.':study.status==='failed'?'완료하지 못한 실행입니다. 남은 기록을 확인하고, 다시 탐색하려면 수정 회차를 만들어 주세요.':records?'보고서에서 발견한 지점과 원문을 확인하고, 같은 페르소나와 대화를 이어가세요.':'실행은 종료됐지만 저장된 탐색 기록이 없습니다. 연결 상태를 확인하거나 수정 회차에서 다시 시작하세요.';
    el('runResultLink').hidden=!executed;el('runResultLink').setAttribute('aria-disabled',String(!state.canReport));el('runResultLink').textContent=state.partial?'부분 실행 기록 보기 →':state.final?'리포트 열기 →':'탐색 종료 후 리포트 열기';
    el('runBackLink').textContent='← 이전 · 탐색 범위';el('runBackLink').hidden=executed;
    el('runPreparation').classList.toggle('is-compact',executed);
    const chip=el('runStateChip'),recorded=study.results.filter(r=>r.act).length,people=study.personas.length;
    chip.hidden=!executed;chip.dataset.kind=study.status==='running'?'run':study.status==='failed'?'bad':'ok';
    chip.innerHTML=executed?`<i aria-hidden="true"></i><b>${study.status==='running'?'실행 중':study.status==='failed'?'중단됐어요 · 확인이 필요해요':records?'탐색이 끝났어요':'종료됐지만 기록이 없어요'}</b><span>${people?`${people}명 중 ${recorded}명의 종료 기록`:''}</span><em>${study.status==='running'?'화면은 행동마다 갱신되는 캡처예요. 이 화면을 나가도 실행은 계속돼요.':'지금 보는 것은 저장된 기록이에요.'}</em>`:'';
    el('cancelRun').hidden=!capabilities?.workflow_ready||!hasRun||study.status!=='running';
    el<HTMLButtonElement>('cancelRun').disabled=cancelRequestedRun===study.runs?.act;
    el('cancelRun').textContent=cancelRequestedRun===study.runs?.act?'취소 요청됨':'실행 취소';
    root.querySelectorAll<HTMLButtonElement>('[data-create-revision],#newConnectedStudy').forEach(b=>b.disabled=(b.id==='newConnectedStudy'?!study.serverId:!executed)||running||state.phase==='running'||state.phase==='checking');
    if(browserSource(study))liveStage.update(study);
  }
  function libraryLabel(panel: api.LibraryPanel) {
    const labels: Record<string,string> = {univ:'20대 대학생', '30s_office':'30대 사무·관리직', '40s_all':'40대 전체', '60plus':'60세 이상'};
    const key = Object.keys(labels).find(key => panel.panel_key.startsWith(`panel_${key}_`));
    return key ? labels[key] : panel.panel_key;
  }
  function renderLibraryControls() {
    const custom=Boolean(capabilities?.audience_builder_ready);el('audienceBuilder').hidden=false;el('legacyPanelSetup').hidden=true;audienceBuilder.sync();if(custom)return;
    const fromLibrary = input('panelSource').value !== 'engine';
    const select = el<HTMLSelectElement>('libraryPanel');
    const matching = libraryPanels.find(p => p.panel_key.startsWith(`panel_${study.conditions.preset}_`));
    const desired = study.libraryPanelId || Number(select.value) || matching?.id || libraryPanels[0]?.id;
    select.innerHTML = libraryPanels.length ? libraryPanels.map(p => `<option value="${p.id}">${escape(libraryLabel(p))} · ${p.count}명</option>`).join('') : '<option value="">보관함 패널이 없습니다</option>';
    if (desired && libraryPanels.some(p => p.id === desired)) select.value = String(desired);
    el('libraryControls').hidden = !fromLibrary; el('engineControls').hidden = fromLibrary;
    el('libraryAvailability').textContent = libraryPanels.length ? `${libraryPanels.length}개 패널 · 총 ${libraryPanels.reduce((n,p) => n+p.count,0)}명의 원본 카드` : serverReady ? '등록된 패널이 없습니다.' : '서버 연결 상태를 확인해 주세요.';
    el('samplePanel').textContent = fromLibrary ? '선택한 페르소나 가져오기' : '새 조건으로 패널 생성';
    el('panelMethodNote').textContent = fromLibrary ? '원본 카드와 특성을 유지해 이번 테스트의 패널로 저장합니다.' : '원본 조사와 NVIDIA 데이터로 새로 샘플링합니다. 최초 실행에는 데이터 다운로드가 필요할 수 있습니다.';
  }
  function renderScreens() {
    const isExample=JSON.stringify(study.screens)===JSON.stringify(DEFAULT_SCREENS);el('prototypeSourceNote').hidden=!isExample;el('prototypeSourceNote').textContent='일정메이트 예시 화면 구조입니다. 내 화면에 맞게 문구와 연결을 편집하거나 Figma에서 가져오세요.';
    screenEditor.render();
    el('screens').innerHTML = study.screens.map(s => `<div class="scr-card"><div class="mini-phone" aria-hidden="true"><span class="bar w80"></span><span class="bar w60"></span><span class="fld"></span><span class="cta"></span></div><div><span class="sid">${escape(s.id)}</span> <span class="snm">${escape(s.label)}</span>${s.id === study.goal ? '<span class="goal">목표</span>' : ''}</div><div class="btns">${s.elements.map(e => `[${escape(e.text)} → ${escape(e.to || '현재 화면')}]`).join(' ') || '버튼 없음'}</div></div>`).join('');
  }
  function closePersonaPrompt() {
    promptRequest++; el('personaPromptDetail').hidden=true;el('personaPromptDetail').innerHTML='';
    el('tickets').querySelectorAll<HTMLElement>('[data-persona-prompt]').forEach(button=>button.setAttribute('aria-expanded','false'));
  }
  function renderPanel() {
    audienceBuilder.sync();
    closePersonaPrompt();el('workflowScope').innerHTML=scopeMarkup(study);
    el('tickets').innerHTML = study.personas.length ? study.personas.map(p => {
      const profile = p.attributes.profile;
      const fromLibrary = Boolean(p.attributes.source.library_entry_id);
      return `<div class="ticket"><div class="photo">${portraitMarkup(p.attributes,'ticket-portrait')}</div><div><div class="no">${escape(personaId(p))}</div><div class="nm">${[profile.age+'세',profile.sex,profile.job_group,profile.region].filter(Boolean).map(escape).join(' · ')}</div><p class="card-text">${escape(p.attributes.card_text)}</p><p class="hint">${study.reportSource==='local-demo' ? '로컬 점검용 가상 카드' : fromLibrary ? '보관함에서 선택' : '엔진 샘플링'} · AI 페르소나 · 요약 프로필</p><button class="btn sm ticket-prompt-button" type="button" data-persona-prompt="${p.id}" aria-controls="personaPromptDetail" aria-expanded="false">프로필 보기 ↗</button></div></div>`;
    }).join('') : '<div class="live-empty">저장된 패널과 인원을 선택한 뒤 페르소나를 가져오세요.</div>';
    el('panelSummary').textContent = study.personas.length ? `이번 테스트에 참여하는 AI 페르소나 ${study.personas.length}명` : '선택한 원본 카드가 여기에 표시됩니다.';
  }
  function renderRoster() {
    el('roster').innerHTML = study.personas.length ? study.personas.map(p => { const r = study.results.find(r => r.id === p.id); const status = r?.act ? (r.act.end.result === 'complete' ? '완료' : reason(r.act.end.drop_reason)) : study.evidence?.some(e=>e.persona_id===p.id)?study.status==='running'?'탐색 중':'기록 있음':'대기'; return `<div data-roster="${p.id}"><span class="rid">${escape(personaId(p))}</span><span>${p.attributes.profile.age}세 ${escape(p.attributes.profile.job_group)}</span><span class="st ${r?.act?.end.result === 'complete' ? 'done' : r?.act ? 'quit' : 'wait'}">${escape(status)}</span></div>`; }).join('') : '<div class="live-empty">패널을 먼저 생성해 주세요.</div>';
  }
  function buildPhones() {
    const stage = el('prototypePhones');
    stage.innerHTML = study.screens.map(s => `<article class="prototype-phone" data-screen="${escape(s.id)}"><div class="prototype-phone-bezel"><div class="prototype-phone-status"><span>9:41</span><i></i><span>▰</span></div><header class="prototype-phone-header"><strong>${escape(study.product.name || '프로토타입')}</strong><span>${escape(s.id)}</span></header><div class="prototype-phone-body dynamic-screen">${s.image?`<img class="registered-screen-image" src="${escape(s.image)}" alt="${escape(s.label)} 등록 시안">`:""}<span class="phone-product-kicker">${escape(s.label)}</span><h3>${escape(s.label)}</h3><p>${escape(s.description).replace(/\n/g, '<br>')}</p>${s.elements.map(e => `<span class="phone-button" data-target="${escape(e.text)}">${escape(e.text)} →</span>`).join('')}</div><div class="prototype-home-indicator"></div></div></article>`).join('');
    rotorPosition = 0; rotorTarget = 0; cancelAnimationFrame(rotorFrame); drawRotor(0);
    el('prototypeSceneCode').textContent = study.screens[0]?.id || '—'; el('prototypeSceneName').textContent = study.screens[0]?.label || '화면 없음';
  }
  function drawRotor(position: number) {
    const phones = [...el('prototypePhones').querySelectorAll<HTMLElement>('.prototype-phone')]; const width = el('prototypeStage').clientWidth;
    phones.forEach((phone, i) => { const angle = (i - position) * Math.PI * 2 / Math.max(phones.length, 1); const front = (Math.cos(angle) + 1) / 2; phone.style.transform = `translateX(-50%) translate3d(${Math.sin(angle) * Math.min(325, Math.max(110, width * .38))}px,0,${(Math.cos(angle) - 1) * 235}px) rotateY(${-Math.sin(angle) * 48}deg)`; phone.style.opacity = String(.33 + .67 * front); phone.style.zIndex = String(Math.round(front * 100)); });
  }
  function showScreen(id: string, state: string, target?: string | null) {
    const next = study.screens.findIndex(s => s.id === id); if (next < 0) return;
    el('prototypeSceneCode').textContent = id; el('prototypeSceneName').textContent = study.screens[next].label; el('runCarousel').dataset.state = state;
    [...el('prototypePhones').querySelectorAll<HTMLElement>('.prototype-phone')].forEach((p, i) => { p.classList.toggle('run-screen-active', i === next); p.querySelectorAll<HTMLElement>('[data-target]').forEach(b => b.classList.toggle('run-button-picked', i === next && Boolean(target) && b.dataset.target === target)); });
    cancelAnimationFrame(rotorFrame); const from = rotorPosition, start = performance.now(); rotorTarget = next;
    const tick = (now: number) => { const progress = media.matches ? 1 : Math.min(1, (now - start) / 600); rotorPosition = from + (rotorTarget - from) * (1 - Math.pow(1 - progress, 4)); drawRotor(rotorPosition); if (progress < 1) rotorFrame = requestAnimationFrame(tick); }; rotorFrame = requestAnimationFrame(tick);
  }
  function play() {
    if (visualPaused || playTimer || !visualQueue.length || location.hash !== '#run') return;
    const event = visualQueue.shift()!; showScreen(event.screen, event.state, event.target);
    el('nowWho').textContent = `${personaId(event.persona)} · ${event.persona.attributes.profile.age}세 ${event.persona.attributes.profile.job_group}`;
    el('think').innerHTML = `<span class="lab">수신된 실행 기록 · Synthetic User Response</span>${escape(event.text)}`;
    el('roster').querySelectorAll<HTMLElement>('[data-roster]').forEach(row => row.classList.toggle('now', row.dataset.roster === String(event.persona.id)));
    playTimer = setTimeout(() => { playTimer = undefined; play(); }, media.matches ? 300 : 1000);
  }
  function ingest(results: Result[], runId: number) {
    study.results = results; persist(); renderRoster(); renderReport();
    for (const r of results) {
      const p = study.personas.find(p => p.id === r.id); if (!p) continue;

      if (r.act && !browserSource(study)) { const key = `${runId}:${r.id}:act`; if (!seen.has(key)) { seen.add(key); for (const event of r.act.events) visualQueue.push({ persona: p, screen: event.screen, text: event.reason || '', state: event.action === 'abandon' ? 'quit' : 'go', target: event.target }); visualQueue.push({ persona: p, screen: r.act.end.screen || study.screens[0]?.id || '', text: r.act.end.result === 'complete' ? '목표 화면에 도달했습니다.' : `탐색 종료 · ${reason(r.act.end.drop_reason)}`, state: r.act.end.result === 'complete' ? 'done' : 'quit' }); addLog(`${personaId(p)} · Act ${r.act.end.result === 'complete' ? '완료' : '중단'}`, r.act.events.at(-1)?.reason || reason(r.act.end.drop_reason)); } }
    }
    play();
  }
  function addLog(title: string, text: string) { const li = document.createElement('li'); li.innerHTML = `<b>${escape(title)}</b><span class="q">${escape(text)}</span>`; el('log').prepend(li); while (el('log').childElementCount > 60) el('log').lastElementChild?.remove(); }
  async function execute() {
    if (running) return;
    if(study.runs?.act){await refreshStoredRun();return;}
    const issue=navigationIssue('run');if(issue){location.hash=`#${issue.view}`;notice(issue.message,true);return;}
    const owner = sessionEpoch, draftId = study.id;
    await probe(); requireSession(owner, draftId);
    if (!study.runs?.act && capabilities?.agent_engine !== 'rule' && capabilities?.persona_transmission_allowed === false) throw new Error('실제 페르소나 카드의 외부 전송이 보류되어 있습니다.');
    if (!study.runs?.act && !study.runs?.ask) await prepare();
    requireSession(owner, draftId); if (!serverReady || (!study.runs?.act&&capabilities?.agent_engine!=='rule'&&!capabilities?.llm_ready)) throw new Error('실제 실행 서버와 LLM 키를 준비해 주세요. 상단 연결 상태에서 확인할 수 있습니다.');
    if (!study.serverId || !study.personas.length) throw new Error('실제 페르소나 패널을 먼저 생성해 주세요.');
    running = true; study.status = 'running'; el<HTMLButtonElement>('startRun').disabled = true; notice('');
    try {
      const modes: ('ask' | 'act')[] = ['act'];
      for (const mode of modes) {
        let id = study.runs?.[mode];
        if (id && (await api.getRun(id)).status === 'failed') throw new Error('이 실행은 실패로 종료됐습니다. 저장된 근거를 확인하거나 수정안으로 새 테스트를 만드세요.');
        requireSession(owner, draftId);
        if (!id) { id = (await api.startRun(study.serverId, mode)).id; requireSession(owner, draftId); study.runs = { ...study.runs, [mode]: id }; if (mode === 'act') study.runStartedAt = new Date().toISOString(); persist(); lockInputs(); }
        while (true) {
          const [status, report] = await Promise.all([api.getRun(id), api.getRunReport(id)]);
          requireSession(owner, draftId);
          await refreshEvidence();requireSession(owner,draftId);
          recordRunStatus(study,id,status);
          ingest(report.results, id); el(mode === 'ask' ? 'askTag' : 'actTag').textContent = `탐색 ${Math.round(status.progress * study.personas.length)}/${study.personas.length}`;
          el('runBar').setAttribute('aria-valuenow', String(Math.round(status.progress * 100))); (el('runBar').firstElementChild as HTMLElement).style.transform = `scaleX(${status.progress})`;
          if (status.status === 'failed') {const detail=capabilities?.workflow_ready?await api.getRunControl(id):null;throw new Error(detail?.error||'실행을 완료하지 못했습니다. 저장된 기록을 확인하세요.');}
          if (status.status === 'done') break;
          await new Promise(resolve => setTimeout(resolve, 1800));
        }
      }
      const report = await currentReport(); requireSession(owner, draftId); study.results = report.results; study.runMeta = report.meta ?? null; study.status = 'done'; if (study.serverId) serverDetail.delete(study.serverId); persist(); renderReport(); notice('실행 기록이 서버에 저장되었습니다. 보고서에서 확인하세요.');if(capabilities?.workflow_ready)await loadRevisions();
    } catch (error) { if (sameSession(owner, draftId)) { if(!study.runs?.act)study.status='ready';else if(study.status==='running')runRefreshPaused=true;persist(); } throw error; }
    finally { if (sameSession(owner, draftId)) { running = false; renderStudioContext(); lockInputs(); } }
  }
  async function refreshStoredRun(){
    const owner=sessionEpoch,draftId=study.id,run=study.runs?.act,request=++runRefresh;
    if(!run||running)return;
    runRefreshPaused=false;
    el<HTMLButtonElement>('startRun').disabled=true;el('startRun').textContent='상태 확인 중…';
    try{
      const [status,report]=await Promise.all([api.getRun(run),api.getRunReport(run)]);
      requireSession(owner,draftId);if(request!==runRefresh)return;
      if(!['pending','running','done','failed'].includes(status.status))throw new Error('실행 상태를 확인하지 못했습니다. 다시 새로고침해 주세요.');
      recordRunStatus(study,run,status);study.results=report.results;study.runMeta=report.meta??null;
      let evidenceWarning='';try{await refreshEvidence();}catch{requireSession(owner,draftId);evidenceWarning='일부 화면 이미지를 불러오지 못했어요. 저장된 종료 기록과 리포트는 확인할 수 있습니다.';}requireSession(owner,draftId);if(request!==runRefresh)return;
      persist();renderRoster();renderReport();renderOverview();
      const destination=returnAfterRunCheck;if(destination&&destination.id===study.id&&destination.run===run&&destination.owner===sessionEpoch){returnAfterRunCheck=undefined;if(location.hash==='#run'&&!navigationIssue(destination.view)){location.hash='#'+destination.view;route();}}
      const progress=Math.max(0,Math.min(1,status.progress||0));el('runBar').setAttribute('aria-valuenow',String(Math.round(progress*100)));(el('runBar').firstElementChild as HTMLElement).style.transform=`scaleX(${progress})`;
      el('actTag').textContent=study.status==='running'?`탐색 ${Math.round(progress*study.personas.length)}/${study.personas.length}`:study.status==='failed'?'실행 종료 · 확인 필요':'탐색 완료';
      if(evidenceWarning)notice(evidenceWarning,true);
      if(study.status==='failed'&&capabilities?.workflow_ready){try{const control=await api.getRunControl(run);requireSession(owner,draftId);if(request!==runRefresh)return;notice(control.error||'실행을 완료하지 못했습니다. 저장된 기록을 확인하거나 수정 회차를 만들어 주세요.',true);}catch{requireSession(owner,draftId);notice('실행은 중단됐어요. 상세 오류 설명을 불러오지 못했지만 저장된 부분 기록은 확인할 수 있습니다.',true);}}
    }catch(error){if(sameSession(owner,draftId)&&request===runRefresh){runRefreshPaused=true;delete study.execution;notice(message(error),true);}}
    finally{if(sameSession(owner,draftId)&&request===runRefresh){lockInputs();renderStudioContext();}}
  }
  function currentReport() { const owner=sessionEpoch,draftId=study.id;return (study.runs?.act ? api.getRunReport(study.runs.act) : api.getReport(study.serverId!)).then(report=>{requireSession(owner,draftId);study.reportSource=report.source==='local-demo'?'local-demo':undefined;if(!study.reportSource){const m=withSampleMock(study,report.results);if(m.mocked){study.reportSource='ui-mock';return {...report,results:m.results};}}return report;}); }
  function lockInputs() { const locked = Boolean(study.runs?.ask || study.runs?.act); document.querySelectorAll<HTMLInputElement>('#v-product input,#v-product textarea,#v-product button:not([data-source-zoom]):not([data-recognition-tab]):not([data-recognition-page]):not([data-recognition-open]):not([data-recognition-state]):not([data-exploration-show]):not([data-exploration-action]),#v-proto input,#v-proto textarea,#v-proto select,#screenEditor button:not([data-edit-screen]),.figma-row button,#screenJson,#v-panel select,#workflowScope input,#workflowScope textarea').forEach(i => { i.disabled = locked || Boolean(sourceCheck.phase==='loading'&&i.closest('#v-product')); }); el<HTMLButtonElement>('samplePanel').disabled = locked; el<HTMLButtonElement>('applyScreens').disabled = locked; renderTransmissionState(); }
  function replayReport() {
    if (!study.results.some(r=>r.act)) { notice('재생할 기록이 없습니다.',true); return; }
    if(browserSource(study)){liveStage.replay();location.hash='#run';return;}
    clearPlayback(); visualPaused=false; el('pauseBtn').textContent='화면 일시정지'; location.hash='#run'; ingest(study.results,study.runs?.act||0);
  }
  function renderStudioContext() {
    renderWorkflowContext();
    const title=studyTitle(study);
    el('studioTestName').textContent=title;el('studioContextName').textContent=title+((study.testTitle??study.workflow?.scope.test_title)?` · ${study.testTitle??study.workflow?.scope.test_title}`:'')+((study.workflow?.revision||1)>1?` · ${study.workflow!.revision}차`:'')+((study.roundNote??study.workflow?.scope.round_note)?` · ${study.roundNote??study.workflow?.scope.round_note}`:'');
    el('studioSaveState').textContent=study.runs?.act?'실행 기록 보관 중':study.serverId?'자동 저장됨':'임시 저장';
    el('studioReadonly').hidden=!['product','source-review','proto',...panelViews].includes(location.hash.slice(1))||!hasExecution();
    const checks=[{label:'연결한 화면',ok:Boolean(study.screens.length),value:study.product.name||'화면을 연결해 주세요',href:'product'},
      {label:'탐색 범위',ok:browserSource(study)?(siteMode(study)||Boolean(study.workflow?.scope.scenario?.trim()||study.workflow?.scope.goal_url||study.workflow?.scope.goal_text)):Boolean(study.screens.length&&study.task&&reachable(study.screens,study.goal)),value:browserSource(study)?`${siteMode(study)?'사이트 전반':'특정 흐름'} · ${productKindLabel(study)} · ${study.workflow?.source.title||'연결된 화면'} · ${study.workflow?.scope.viewport==='mobile'?'모바일':'데스크톱'}`:`${productKindLabel(study)} · ${JSON.stringify(study.screens)===JSON.stringify(DEFAULT_SCREENS)?'예시 ':''}${study.screens.length}개 화면 · ${study.screens.find(s=>s.id===study.goal)?.label||'목표 미설정'}`,href:'scope'},
      {label:'참여 페르소나',ok:Boolean(study.personas.length),value:study.personas.length?`${study.personas.length}명 선택`:'페르소나를 선택하세요',href:'personas'}];
    el('runPreparation').innerHTML=`<div class="studio-run-checks">${checks.map(c=>`<a href="#${c.href}" class="${c.ok?'is-ready':''}"><span>${c.ok?'✓':'—'} ${c.label}</span><strong>${escape(c.value)}</strong><small>${hasExecution()?'설정 보기':c.ok?'확인 / 수정':'설정하러 가기'} ↗</small></a>`).join('')}</div><div class="studio-run-meta"><span>탐색 목적: ${escape(study.task||'아직 설정하지 않았습니다.')}</span><span>한 명당 최대 ${study.workflow?.scope.max_turns??capabilities?.max_turns??3}회 행동 · ${study.personas.length}명</span>${study.results.some(r=>r.act)?'<button type="button" class="btn sm" data-replay-records>저장된 기록 재생 ▷</button>':`<span>${browserSource(study)?'실제 브라우저 · 조회·화면 전환 범위':'화면 설명 · 버튼 연결 기반'}</span>`}</div>`;
  }
  function renderReport() {
    if (reportView) reportView.update(study);
    else reportView=mountReport(el('liveReport'),study,{onReplay:replayReport,onNext:()=>askRevision(),nextLabel:'같은 테스트에 수정 회차 만들기',independentInterview:true,compact:true,canCreateNext:()=>!running&&study.status!=='running',
      onTabChange:tab=>{const next=tab==='interview'?'#interview':'#report';if(location.hash!==next)location.hash=next;},
      canUseLlm:()=>capabilities?.persona_transmission_allowed===true&&capabilities?.interview_llm_ready===true&&study.reportSource!=='local-demo'&&study.reportSource!=='ui-mock',
      loadInterview:async id=>{const owner=sessionEpoch,draftId=study.id,run=study.runs?.act;if(!run||study.reportSource==='ui-mock')return [];const response=await api.getInterview(run,id);requireSession(owner,draftId);return response;},
      askInterview:async(id,question,mode='records')=>{if(study.reportSource==='ui-mock')return {question,answer:recordAnswer(study,id,question),mode:'records' as const};const owner=sessionEpoch,draftId=study.id,run=study.runs?.act;if(!run)throw new Error('탐색 기록을 먼저 저장해 주세요.');if(mode==='llm'&&(capabilities?.persona_transmission_allowed!==true||!capabilities?.interview_llm_ready))throw new Error('이 실행은 새 AI 답변 전송이 허용되지 않았습니다.');const answer=await api.askInterview(run,id,question,mode);requireSession(owner,draftId);return answer;},
    });
  }
  let shownView = '';
  function route() {
    closeAccountMenus();
    const key = location.hash.slice(1) || 'landing';
    const landingAnchor = LANDING_ANCHORS.includes(key);
    let view = landingAnchor ? 'landing' : key === 'register' ? 'login' : panelViews.includes(key)?key:el('root').querySelector(`#v-${CSS.escape(key)}`) ? key : 'landing';
    if ((steps.includes(view) || view === 'workspace') && !authChecked) view = 'auth-loading';
    else if ((steps.includes(view) || view === 'workspace') && !user) view = 'login';
    // 설정 중에 잠긴 탭(실행·리포트 등)을 누르면 비어 있는 단계로 끌고 가지 않고, 지금 단계에 머물며 먼저 할 일만 알려 준다
    const stay=shownView&&setupViews.includes(shownView)&&steps.includes(view)&&shownView!==view?shownView:'';
    const stepName=(v:string)=>({product:'화면 연결','source-review':'화면 확인',panel:'대상 사용자',personas:'참여 구성',scope:'탐색 범위'} as Record<string,string>)[v]||'';
    if(user&&resultViews.includes(view)&&!hasExecution()){
      const go=resumeSetup(study);
      if(stay){notice(go==='run'?'아직 열 수 없어요. 탐색을 실행하고 나면 열려요.':go===stay?'아직 열 수 없어요. 지금 단계를 먼저 마쳐 주세요.':`아직 열 수 없어요. 먼저 ‘${stepName(go)||'설정'}’ 단계를 마쳐 주세요.`,true);view=stay;}else view=go;
      window.history.replaceState(null,'',`#${view}`);
    }
    const blocked=user?navigationIssue(view):null;
    if(blocked){
      if(resultViews.includes(view)&&executionState(study).phase==='checking'&&study.runs?.act)returnAfterRunCheck={view,id:study.id,run:study.runs.act,owner:sessionEpoch};
      if(stay&&setupViews.includes(view)&&blocked.view!==stay&&blocked.view!==view){notice(`아직 열 수 없어요. ${stepName(blocked.view)?`‘${stepName(blocked.view)}’ 단계: `:''}${blocked.message}`,true);view=stay;window.history.replaceState(null,'',`#${view}`);blocked.focus=undefined;}
      else{view=blocked.view;window.history.replaceState(null,'',`#${view}`);notice(blocked.message,true);}
    }
    shownView=view;
    if(returnAfterRunCheck&&!['run',returnAfterRunCheck.view].includes(view))returnAfterRunCheck=undefined;
    if (view === 'login') { if (user) { location.hash = '#workspace'; return; } setAuthMode(authBusy?authMode:key === 'register' ? 'register' : 'login'); }
    if (view !== 'workspace') workspaceSidebar.close();
    document.querySelectorAll<HTMLElement>('.view').forEach(v => v.classList.toggle('on', v.id === `v-${panelViews.includes(view)?'panel':view}`)); el('apphead').hidden = !steps.includes(view);el('studioContext').hidden=!steps.includes(view);root.classList.toggle('studio-active',steps.includes(view));renderStudioContext();
    el('liveNotice').hidden = !(steps.includes(view)||view==='workspace') || !el('liveNotice').textContent;
    if(view!=='workspace')el('workspaceToast').hidden=true;
    rememberSetup(view);
    if (view === 'workspace') { renderWorkspace(); void probe(); }
    if(view==='overview'){renderOverview();void loadRevisions();}
    if(view==='compare'){void loadComparison();}
    if(view==='source-review'){renderSourceDetails();el('sourceReviewTitle').focus({preventScroll:true});}
    if(panelViews.includes(view)){audienceBuilder.sync();el('workflowScope').innerHTML=scopeMarkup(study);renderPanelNavigation();void loadCarry();}
    renderWorkflowContext();
    if (view === 'run') {drawRotor(rotorPosition); play(); if (!running && !visualQueue.length && !playTimer) el('think').textContent = study.results.some(r=>r.act) ? '저장된 기록 재생을 누르면 탐색 경로를 다시 볼 수 있습니다.' : '페르소나를 선택하고 실행하면 탐색 경로가 여기에 나타납니다.'; }
    if (view === 'report'||view === 'interview') { const target=view==='interview'?el('interviewReportSlot'):el('v-report').querySelector<HTMLElement>('.rv-live-page')!;target.append(el('liveReport'));renderReport();if(view==='interview'){reportView?.showTab('interview');if(pendingInterviewPersona){reportView?.selectPersona(pendingInterviewPersona,'interview');pendingInterviewPersona=0;}}else if(el('liveReport').querySelector('[data-report-tab="interview"]'))reportView?.showTab('records'); if (study.serverId && !running) { const owner = sessionEpoch, draftId = study.id; void currentReport().then(r => { if (!sameSession(owner, draftId)) return; study.results = r.results; persist(); renderReport(); }).catch(error => { if (sameSession(owner, draftId)) notice(message(error), true); }); } }
    lockInputs();
    if(blocked?.focus){const target=document.getElementById(blocked.focus);target?.focus({preventScroll:true});target?.scrollIntoView({block:'center'});}
    if (landingAnchor) el(key).scrollIntoView({ behavior: media.matches ? 'auto' : 'smooth', block: 'start' }); else if(!blocked?.focus)window.scrollTo(0,0);
  }
  root.addEventListener('input', event => { if ((event.target as HTMLElement).closest('#v-product,#task,#workflowScope')) { readInputs(); } });
  const pickWorkspace = (event: Event) => {
    const target = event.target as HTMLElement;
    if (event instanceof KeyboardEvent && (event.key === 'ArrowRight' || event.key === 'ArrowLeft') && target.closest('[data-ws-tab]')) {
      const tabs = [...root.querySelectorAll<HTMLElement>('[data-ws-tab]')], at = tabs.indexOf(target.closest<HTMLElement>('[data-ws-tab]')!), next = tabs[(at + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      event.preventDefault(); setWorkspaceTab(next.dataset.wsTab!); renderWorkspace(); root.querySelector<HTMLElement>(`[data-ws-tab="${next.dataset.wsTab}"]`)?.focus(); return;
    }
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
    const tabButton = target.closest<HTMLElement>('[data-ws-tab]');
    if (tabButton?.dataset.wsTab) { setWorkspaceTab(tabButton.dataset.wsTab); renderWorkspace(); return; }
    if (target.closest('[data-ws-only]')) { toggleWorkspaceFinished(); renderWorkspace(); return; }
    const cal = target.closest<HTMLElement>('[data-ws-cal]');
    if (cal) { if (cal.dataset.wsCal === 'today') calendarToday(); else shiftCalendar(cal.dataset.wsCal === 'next' ? 1 : -1); renderWorkspace(); return; }
    if (target.closest('.wm-menu,button,a,input,select')) return;
    const item = target.closest<HTMLElement>('[data-ws-select]'); if (!item?.dataset.wsSelect) return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    selectWorkspace(item.dataset.wsSelect); renderWorkspace();
    const backdrop = root.querySelector<HTMLElement>('.ws-sidebar-backdrop'); if (backdrop && !backdrop.hidden) backdrop.click();
    root.querySelector<HTMLElement>(`[data-ws-select="${CSS.escape(item.dataset.wsSelect)}"]`)?.focus();
  };
  for (const id of ['workspaceTestsPanel', 'workspaceSideList']) { el(id).addEventListener('click', pickWorkspace); el(id).addEventListener('keydown', pickWorkspace); }
  el('workspaceSearch').addEventListener('input', renderWorkspace);
  el('workspaceSort').addEventListener('change', renderWorkspace);
  el('workspaceFilter').addEventListener('change',renderWorkspace);
  root.addEventListener('click',event=>{const b=(event.target as HTMLElement).closest<HTMLElement>('button');if(!b)return;if(b.dataset.wmView){workspaceView=b.dataset.wmView;input('workspaceFilter').value='all';input('workspaceSearch').value='';renderWorkspace();}if(b.hasAttribute('data-wm-reset')){input('workspaceFilter').value='all';input('workspaceSearch').value='';renderWorkspace();input('workspaceSearch').focus();}if(b.hasAttribute('data-wm-refresh'))void probe();});
  function closeAccountMenus() { root.querySelectorAll<HTMLDetailsElement>('.c10-account,.studio-account').forEach(account=>{account.open=false;}); }
  function workspaceKeys(event: KeyboardEvent) {
    const account=root.querySelector<HTMLDetailsElement>('.c10-account[open],.studio-account[open]');
    if(event.key==='Escape'&&account){account.open=false;account.querySelector('summary')?.focus();return;}
    if(location.hash!=='#workspace'||!user)return;
    if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing||event.repeat||document.querySelector('dialog[open]')||(event.target as HTMLElement)?.closest('input,textarea,select,button,a,summary,[contenteditable]'))return;
    if(el<HTMLDialogElement>('workspaceManageDialog').open)return;
    if(event.key==='/'){event.preventDefault();input('workspaceSearch').focus();}
    if(event.key.toLowerCase()==='n'){event.preventDefault();openNewTestDialog();}
  }
  function closeWorkspaceAccount(event: MouseEvent) {
    const target=event.target as HTMLElement;
    root.querySelectorAll<HTMLDetailsElement>('.c10-account,.studio-account').forEach(account=>{
      if(!account.contains(target)||target.closest('.c10-account-menu button,.c10-account-menu a,.studio-account-menu button,.studio-account-menu a'))account.open=false;
    });
  }
  root.addEventListener('click',closeWorkspaceAccount);document.addEventListener('keydown',workspaceKeys);
  el('authForm').addEventListener('input',event=>{
    const id=(event.target as HTMLElement).id;if(['authEmail','authPassword','authConfirm'].includes(id)){authFieldError(id,'');authError('');}
  });
  for(const id of ['authPassword','authConfirm']){
    const caps=(event:KeyboardEvent)=>{el('authCapsLock').hidden=!event.getModifierState('CapsLock');};
    input(id).addEventListener('keyup',event=>caps(event as KeyboardEvent));input(id).addEventListener('keydown',event=>caps(event as KeyboardEvent));input(id).addEventListener('blur',()=>{el('authCapsLock').hidden=true;});
  }
  el('authForm').addEventListener('submit',event=>{
    event.preventDefault();if(authBusy)return;clearAuthErrors();
    const email=input('authEmail').value.trim(),password=input('authPassword').value;input('authEmail').value=email;
    const errors:[string,string][]=[];
    if(!email||!el<HTMLInputElement>('authEmail').checkValidity())errors.push(['authEmail','올바른 이메일 주소를 입력해 주세요.']);
    if([...password].length<4||[...password].length>128)errors.push(['authPassword','비밀번호는 4자 이상, 128자 이하로 입력해 주세요.']);
    if(authMode==='register'&&(!input('authConfirm').value||password!==input('authConfirm').value))errors.push(['authConfirm','비밀번호를 동일하게 한 번 더 입력해 주세요.']);
    if(errors.length){errors.forEach(([id,text])=>authFieldError(id,text));input(errors[0][0]).focus();return;}
    authBusy=true;const requestId=++restoreCounter;updateAuthBusy();const signup=authMode==='register';
    void (signup?api.register:api.login)(email,password).then(account=>{
      if(requestId!==restoreCounter)return;setUser(account);authChecked=true;input('authPassword').value='';input('authConfirm').value='';announceSession();location.hash='#workspace';route();void probe();
    }).catch(error=>{
      if(requestId!==restoreCounter)return;const status=error instanceof api.ApiError?error.status:0;
      authError(status===0?'로그인 서버에 연결하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.':message(error),status===0,signup&&status===409);
    }).finally(()=>{if(requestId===restoreCounter){authBusy=false;updateAuthBusy();}});
  });
  root.addEventListener('change', event => {
    const target = event.target as HTMLElement;
    if(target.closest('#audienceBuilder'))return;
    if(target.closest('#workflowScope')){readScope();persist();return;}
    if (target.closest('#v-panel')) {
      const before = JSON.stringify([study.count, study.conditions,study.panelSource,study.libraryPanelId]); readInputs();renderLibraryControls();
      if (before !== JSON.stringify([study.count, study.conditions,study.panelSource,study.libraryPanelId]) && !study.runs?.ask && !study.runs?.act) {
        study.personas = []; study.results = []; study.status = 'draft'; persist(); renderPanel(); renderRoster(); renderReport();
        notice('패널 조건이 바뀌었습니다. 새 조건으로 페르소나 패널을 다시 생성해 주세요.');
      }
    } else if (target.closest('#goal')) { readInputs(); renderScreens();renderStudioContext(); }
  });
  root.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('a,button'); if (!button) return;
    if(button.hasAttribute('data-workspace-home')&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();workspaceSidebar.show('tests');if(location.hash==='#workspace'){renderWorkspace();el('workspace-title').focus({preventScroll:true});}else location.hash='#workspace';return;}
    if(button.closest('#personaPromptDetail')) {
      if(button.hasAttribute('data-prompt-close')) closePersonaPrompt();
      if(button.hasAttribute('data-prompt-copy')) void copyPrompt(el('personaPromptDetail'));
      if(button.hasAttribute('data-prompt-download')) downloadPrompt(el('personaPromptDetail'),study.personas.find(p=>p.id===promptPersonaId)?.attributes.source.persona_id || String(promptPersonaId));
      return;
    }
    if(button.hasAttribute('data-open-guide')){event.preventDefault();el<HTMLDialogElement>('workflowGuide').showModal();return;}
    if(button.hasAttribute('data-close-guide')){el<HTMLDialogElement>('workflowGuide').close();return;}
    if(button.dataset.personaPrompt) {
      if(busy || !user)return;
      const p=study.personas.find(p=>p.id===Number(button.dataset.personaPrompt));if(!p || !study.serverId)return;
      closePersonaPrompt();const owner=sessionEpoch,draftId=study.id,request=++promptRequest;
      promptPersonaId=p.id;button.setAttribute('aria-expanded','true');
      const panel=el('personaPromptDetail');panel.hidden=false;panel.innerHTML=promptPanel(p,'',{loading:true});
      panel.scrollIntoView({behavior:media.matches?'auto':'smooth',block:'nearest'});
      void task(async()=>{
        try {
          const preview=await api.getPersonaPrompt(study.serverId!,p.id);requireSession(owner,draftId);
          if(request!==promptRequest)return;
          if(preview.persona_id!==p.id)throw new Error('요청한 페르소나와 프롬프트가 일치하지 않습니다.');
          panel.innerHTML=promptPanel(p,executionPrompt(preview),{screen:preview.screen_id});
          panel.querySelector<HTMLElement>('h2')?.focus({preventScroll:true});
        } catch(error) {if(sameSession(owner,draftId)&&request===promptRequest)panel.innerHTML=promptPanel(p,'',{error:message(error)});throw error;}
      });
      return;
    }
    if(button.id==='authSwitch'||button.id==='authExistingLogin'){if(authBusy)event.preventDefault();return;}
    if(button.id==='authRetry'){if(authBusy)return;const retry=button as HTMLButtonElement;retry.disabled=true;retry.textContent='연결 확인 중…';void restoreSession().finally(()=>{retry.disabled=false;retry.textContent='연결 다시 확인';});return;}
    if(button.hasAttribute('data-auth-logout')){
      if(authBusy)return;authBusy=true;const requestId=++restoreCounter;
      root.querySelectorAll<HTMLButtonElement>('[data-auth-logout]').forEach(b=>{b.disabled=true;b.textContent='로그아웃 중…';});
      void api.logout().then(()=>{if(requestId!==restoreCounter)return;setUser(null);authChecked=true;announceSession();location.hash='#login';route();})
        .catch(error=>{if(requestId===restoreCounter)notice('로그아웃하지 못했습니다. '+message(error),true);})
        .finally(()=>{if(requestId===restoreCounter){authBusy=false;updateAuthBusy();root.querySelectorAll<HTMLButtonElement>('[data-auth-logout]').forEach(b=>{b.disabled=false;b.textContent='로그아웃';});}});return;
    }
    if (button.dataset.roundDelete || button.dataset.roundDeleteYes || button.hasAttribute('data-round-delete-cancel')) { void roundDeleteAction(button); return; }
    if (button.dataset.roundNote || button.dataset.roundNoteSave || button.hasAttribute('data-round-note-cancel')) { void roundNoteAction(button); return; }
    if (button.hasAttribute('data-create-study')) { openNewTestDialog('new', undefined, { productId: button.dataset.product, forceNew: button.hasAttribute('data-new-product') }); return; }
    if (button.hasAttribute('data-workspace-connection')) { el<HTMLDialogElement>('connectionDetails').showModal(); void probe(); return; }
    { const reviseServer = Number(button.dataset.wsReviseServer) || (button.dataset.wsReviseLocal ? [...workspaceEntries.values()].find(e => e.local === button.dataset.wsReviseLocal)?.server || 0 : 0); if (reviseServer && capabilities?.workflow_ready) { askRevision(undefined, { stayServer: reviseServer, prevNote: workspaceEntries.get(selectedWorkspaceKey())?.note }); return; } }
    if (button.dataset.wsReviseLocal || button.dataset.wsReviseServer) { askRevision(() => openStudy(button.dataset.wsReviseLocal || undefined, button.dataset.wsReviseServer ? Number(button.dataset.wsReviseServer) : undefined)); return; }
    if (button.dataset.openLocal || button.dataset.openServer) { const then = button.dataset.thenHash, thenPersona = Number(button.dataset.thenPersona) || 0; void task(async () => { await openStudy(button.dataset.openLocal, button.dataset.openServer ? Number(button.dataset.openServer) : undefined); if (thenPersona) pendingInterviewPersona = thenPersona; if (then) location.hash = '#' + then; }); return; }
    if (button.id === 'engineStatus') { el<HTMLDialogElement>('connectionDetails').showModal(); void probe(); }
    if (button.id === 'closeConnection') el<HTMLDialogElement>('connectionDetails').close();
    if (button.id === 'retryConnection') void probe();
    if (button.id === 'newConnectedStudy' || button.hasAttribute('data-copy-study')) { askRevision(); return; }
    if (button.id === 'samplePanel') void task(async () => {
      const owner = sessionEpoch, draftId = study.id;
      await probe(); requireSession(owner, draftId); readInputs();
      const fromLibrary = study.panelSource !== 'engine';
      if (!serverReady) throw new Error('실행 서버에 연결할 수 없습니다.');
      if (fromLibrary && !libraryPanels.some(p => p.id === study.libraryPanelId)) throw new Error('보관함 패널을 선택해 주세요.');
      if (!fromLibrary && !capabilities?.persona_ready) throw new Error('페르소나 엔진의 원본 데이터를 먼저 준비해 주세요.');
      const id = await prepare(); el<HTMLButtonElement>('samplePanel').disabled = true;
      try {
        notice(fromLibrary ? '보관함에서 이번 테스트의 패널을 가져오고 있습니다.' : '실제 페르소나 엔진에서 샘플링하고 있습니다.');
        const panel = fromLibrary ? await api.importLibraryPanel(id, study.libraryPanelId!, study.count, study.seed) : await api.generatePanel(id, study);
        requireSession(owner, draftId);
        if (!panel.length || panel.some(p => p.attributes.source?.stub || p.attributes.source?.stand_in)) throw new Error('유효한 원본 패널을 받지 못했습니다.');
        study.personas = panel; study.results = []; study.status = 'ready'; persist(); renderPanel(); renderRoster();
        notice(`${panel.length}명의 페르소나를 이번 테스트에 저장했습니다.`);
      } finally { if (sameSession(owner, draftId)) el<HTMLButtonElement>('samplePanel').disabled = false; }
    });
    if(button.dataset.authToggle){if(authBusy)return;const field=el<HTMLInputElement>(button.dataset.authToggle),show=field.type==='password';field.type=show?'text':'password';button.textContent=show?'숨기기':'보기';button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',`${button.dataset.authToggle==='authConfirm'?'확인 비밀번호':'비밀번호'} ${show?'숨기기':'표시'}`);return;}
    if(button.hasAttribute('data-replay-records')){replayReport();return;}
    if(button.hasAttribute('data-create-revision')){askRevision();return;}
    if(button.dataset.carryApply){applyCarry(button.dataset.carryApply);return;}
    if(button.dataset.openRevision){void task(()=>openStudy(undefined,Number(button.dataset.openRevision)));return;}
    if(button.id==='cancelRun'){const owner=sessionEpoch,id=study.id,run=study.runs?.act;if(!run||cancelRequestedRun===run)return;cancelRequestedRun=run;renderRunControls();void api.cancelRun(run).then(()=>{if(sameSession(owner,id))notice('취소를 요청했습니다. 진행 중인 행동이 끝나면 기록을 보존하고 멈춥니다.');}).catch(error=>{if(sameSession(owner,id)){cancelRequestedRun=0;renderRunControls();notice(message(error),true);}});return;}
    if (button.id === 'startRun') void task(execute);
    if (button.id === 'pauseBtn') { visualPaused = !visualPaused; button.textContent = visualPaused ? '화면 이어보기' : '화면 일시정지'; if (!visualPaused) play(); }
    if (button.id === 'applyScreens') { try { if (study.runs?.ask || study.runs?.act) throw new Error('실행한 테스트의 화면은 변경할 수 없습니다.'); const parsed = JSON.parse(input('screenJson').value); const screens = Array.isArray(parsed) ? parsed : parsed.screens; validateScreens(screens); setManualSource();study.screens = screens; study.results = []; if (!screens.some((s: Screen) => s.id === study.goal)) study.goal = screens.at(-1).id; persist(); syncInputs(); notice(`${screens.length}개 화면의 연결을 적용했습니다.`); } catch(error) { notice(message(error), true); } }
    if (button.dataset.person) el(`result-${button.dataset.person}`).scrollIntoView({ behavior: media.matches ? 'auto' : 'smooth' });
    if (button.dataset.textFile) { const owner=sessionEpoch,draftId=study.id,targetId=button.dataset.textFile;const picker=document.createElement('input');picker.type='file';picker.accept='.txt,.md,.markdown';picker.onchange=()=>{const selected=picker.files?.[0];if(!selected)return;if(selected.size>2*1024*1024){notice('파일은 2MB 이하로 올려주세요.',true);return;}void selected.text().then(text=>{if(!sameSession(owner,draftId)||study.id!==draftId||hasExecution())return;const box=el<HTMLTextAreaElement>(targetId);const add=text.replace(/\r\n/g,'\n').trim();box.value=(box.value.trim()&&targetId!=='pdesc'?box.value.trim()+'\n':'')+add;box.value=box.value.slice(0,box.maxLength>0?box.maxLength:6000);box.dispatchEvent(new Event('input',{bubbles:true}));notice('파일 내용을 넣었어요. 필요하면 고쳐 쓰세요.');}).catch(error=>notice(message(error),true));};picker.click();return; }
    if (button.dataset.importContext === 'text') { input('pdesc').value = input('plan').value; if (!input('pname').value) input('pname').value = input('plan').value.match(/\[(?:서비스 기획서|서비스 제품 소개|제품 소개)\]\s*(.*)/)?.[1] || ''; if (!input('pfeat').value) input('pfeat').value = input('plan').value.split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2)).join('\n'); readInputs(); notice('제품 소개를 가져왔습니다. 위의 입력 내용을 확인하고 수정하세요.'); }
    if (button.dataset.importContext === 'file') { const owner=sessionEpoch,draftId=study.id;const file = document.createElement('input'); file.type = 'file'; file.accept = '.txt,.md'; file.onchange = () => { const selected = file.files?.[0]; if (selected && selected.size>2*1024*1024){notice('제품 소개 파일은 2MB 이하로 올려주세요.',true);return;}if (selected) void selected.text().then(text => { if(!sameSession(owner,draftId))return;input('plan').value = text; notice('제품 소개를 불러왔습니다. 내용 가져오기를 누르고 제품 정보를 확인하세요.'); }).catch(error => notice(message(error), true)); }; file.click(); }
    if (button.matches('.figma-row button')) void task(async () => {
      const owner=sessionEpoch, draftId=study.id;
      if (study.runs?.ask || study.runs?.act) throw new Error('실행한 테스트의 화면은 변경할 수 없습니다.');
      const url=(document.querySelector('.figma-row input') as HTMLInputElement).value.trim();
      if (!url) throw new Error('Figma 파일 링크를 입력해 주세요.');
      const id=await ensureDraft(); (button as HTMLButtonElement).disabled=true; notice('Figma의 화면과 클릭 연결을 가져오고 있습니다.');
      try {
        const imported=await api.importFigma(id,url); requireSession(owner,draftId); validateScreens(imported.screens);
        setManualSource('figma',url);study.screens=imported.screens; study.goal=[...study.screens].reverse().find(s=>reachable(study.screens,s.id))!.id;
        study.task='주요 기능을 찾아 목표 화면까지 이동하세요';study.results=[];study.status=study.personas.length?'ready':'draft';
        persist();syncInputs();lockInputs(); notice(`${study.screens.length}개 화면을 가져왔습니다. 시작·목표 화면과 연결을 확인하세요. ${imported.warnings.join(' ')}`);
      } finally { if(sameSession(owner,draftId)) (button as HTMLButtonElement).disabled=false; }
    });
    const href = button.getAttribute('href');
    if(href?.startsWith('#')&&(button.closest('#stepper')||resultViews.includes(href.slice(1)))){const issue=navigationIssue(href.slice(1));if(issue){event.preventDefault();notice(issue.message,true);if(issue.view!==location.hash.slice(1)){location.hash='#'+issue.view;route();}if(issue.focus)el(issue.focus).focus({preventScroll:true});return;}}
    if((href==='#source-review'||href==='#panel')&&['product','proto','source-review'].includes(location.hash.slice(1))&&!hasExecution()){
      event.preventDefault();if(href===location.hash)return;const destination=href==='#source-review'||['product','proto'].includes(location.hash.slice(1))?'source-review':'panel';const issue=navigationIssue(destination);
      if(issue){if(location.hash!=='#'+issue.view){location.hash='#'+issue.view;route();}notice(issue.message,true);if(issue.focus){const field=document.getElementById(issue.focus);field?.focus({preventScroll:true});field?.scrollIntoView({block:'center'});}return;}
      const from=location.hash;void task(async()=>{await ensureDraft();if(location.hash===from){location.hash='#'+destination;notice('');}});return;
    }
    if(href==='#scope'&&location.hash==='#personas'&&!hasExecution()){event.preventDefault();void continuePanel();return;}
    if(href==='#run'&&panelViews.includes(location.hash.slice(1))&&!hasExecution()){event.preventDefault();if(location.hash==='#scope')void continuePanel();else{const issue=navigationIssue('run');location.hash=issue?`#${issue.view}`:'#scope';if(issue)notice(issue.message,true);}return;}
  });

  function readScope(){
    if(hasExecution())return;
    if(!study.workflow && document.getElementById('scopeFocus'))study.workflow={study_id:study.serverId||0,root_study_id:study.serverId||0,revision:1,source:{kind:'manual'},scope:defaultScope()};
    if(!study.workflow)return;
    const scope=study.workflow.scope;
    const mode=root.querySelector<HTMLInputElement>('[name=explorationMode]:checked');if(mode)scope.exploration=mode.value as 'site'|'journey';
    const priorities=document.getElementById('scopePriorities') as HTMLTextAreaElement|null;if(priorities)scope.priorities=priorities.value.split('\n').map(v=>v.trim()).filter(Boolean);
    const turns=document.getElementById('scopeMaxTurns') as HTMLSelectElement|null;if(turns)scope.max_turns=Number(turns.value);
    const focus=document.getElementById('scopeFocus') as HTMLTextAreaElement|null;
    if(focus){scope.focus=focus.value.trim();scope.mode=scope.focus?'focused':'general';}
    const purpose=document.getElementById('scopePurpose') as HTMLInputElement|null;
    if(purpose){
      // 특정 흐름은 흐름 한 줄만 받는다. 도착 지점 입력은 없다(도착 여부는 실행 쪽에서 판단)
      scope.scenario=purpose.value.trim();
      study.task=siteMode(study)?'사이트 전반의 화면 이해와 사용 경로 탐색':scope.scenario||'주요 화면을 살펴보세요.';
    }
  }
  function fillProductFromScreens(){
    if(!study.screens.length)return;
    const observed=study.workflow?.source.observed_screen||study.screens[0];
    if(!study.product.name)study.product.name=study.workflow?.source.title||observed.label||'새 테스트';
    // 설명은 사용자가 직접 쓴다. 연결한 페이지에서 긁어온 문구(오류 안내·메뉴 글자 등)를 자동으로 넣지 않는다.
    input('pname').value=study.product.name;input('pdesc').value=study.product.description;
  }
  function renderSourceRecognition(){
    if(sourceCheckKey!==study.id){sourceCheckKey=study.id;sourceCheck={phase:'idle'};sourceScreenId='';recognitionSelection={};}
    el('sourcePreview').innerHTML=sourceRecognitionMarkup(study,sourceCheck,sourceScreenId);
    renderSourceDetails();
    el('sourceRecognition').setAttribute('aria-busy',String(sourceCheck.phase==='loading'));
    const disabled=sourceCheck.phase==='loading'||Boolean(study.runs?.act||study.runs?.ask);
    root.querySelectorAll<HTMLInputElement|HTMLButtonElement>('.wf-source-panel input,.wf-source-panel textarea,.wf-source-panel button').forEach(n=>n.disabled=disabled);
  }
  function renderSourceDetails(){
    const detail=el('sourceDetails');detail.innerHTML=sourceDetailsMarkup(study,sourceCheck,sourceScreenId,recognitionSelection);detail.hidden=!detail.innerHTML;
    detail.setAttribute('aria-busy',String(sourceCheck.phase==='loading'));
  }
  function selectRecognitionTab(tab:RecognitionTab,scroll=false){
    const issue=navigationIssue('source-review');if(issue){notice(issue.message,true);return;}
    recognitionSelection={...recognitionSelection,tab};if(location.hash!=='#source-review'){location.hash='#source-review';route();}renderSourceDetails();el('sourceDetails').querySelector<HTMLElement>('[data-recognition-tab="'+tab+'"]')?.focus({preventScroll:true});
    if(scroll)el('sourceDetails').scrollIntoView({block:'start',behavior:media.matches?'auto':'smooth'});
  }
  function syncWorkflow(){
    input('sourceUrl').value=study.workflow?.source.url||'';
    const viewport=study.workflow?.scope.viewport||'desktop';
    syncProductKind();
    root.querySelectorAll<HTMLInputElement>('[name="sourceViewport"]').forEach(n=>n.checked=n.value===viewport);
    renderSourceRecognition();
    el('workflowScope').innerHTML=scopeMarkup(study);
    el('sourceFileStatus').textContent='';
    if(study.workflow?.source.kind==='html')switchSource('html');else if(study.workflow?.source.kind==='figma'||study.screens.length&&study.workflow?.source.kind==='manual')switchSource('figma');else switchSource('web');
    renderOverview();renderBrowserEvidence();
  }
  function panelScopeReady(){if((study.workflow?.scope.priorities||[]).length>PRIORITIES_MAX||(study.workflow?.scope.priorities||[]).some(p=>p.length>PRIORITY_MAX_CHARS))return false;return browserSource(study)?(siteMode(study)||Boolean(study.workflow?.scope.goal_url||study.workflow?.scope.goal_text)):Boolean(study.task&&study.goal&&reachable(study.screens,study.goal));}
  function renderPanelNavigation(){
    const state=audienceBuilder.state(),locked=hasExecution();
    const page=panelViews.includes(location.hash.slice(1))?location.hash.slice(1):'panel';
    const pageInfo:Record<string,{title:string;description:string;eyebrow:string;back:string;backLabel:string;next:string}>={
      panel:{title:'어떤 사용자의 경험을 살펴볼까요?',description:'제품을 사용할 사람과 사용 상황을 알려주세요. 다음 화면에서 참여 조건과 구성을 정합니다.',eyebrow:'03 / YOUR AUDIENCE',back:'source-review',backLabel:'화면 확인',next:'참여 구성'},
      personas:{title:'이번 테스트에 어떤 시선을 모을까요?',description:'참여 조건과 인원을 정하면 구성을 추천해요. 확인한 뒤 필요한 사람만 교체하세요.',eyebrow:'04 / BUILD YOUR GROUP',back:'panel',backLabel:'사용자 설명',next:'탐색 범위'},
      scope:{title:'어디까지 살펴볼까요?',description:'기본은 사이트 전반 탐색이에요. 꼭 확인할 것과 추가로 알려줄 내용을 적거나, 특정 흐름만 확인할 수도 있어요.',eyebrow:'05 / EXPLORATION SCOPE',back:'personas',backLabel:'참여 구성',next:'실행'},
    };const info=pageInfo[page];
    el('panelPageTitle').textContent=info.title;el('panelPageDescription').textContent=info.description;el('panelPageEyebrow').textContent=info.eyebrow;
    el<HTMLAnchorElement>('panelBackLink').href='#'+info.back;el('panelBackLink').textContent='← 이전 · '+info.backLabel;
    el('audienceBuilder').hidden=page==='scope';audienceBuilder.showPage(page==='personas'?'personas':'people');el('workflowScope').hidden=page!=='scope';
    el('panelActionSelection').textContent=page==='panel'?'3 / 6 · 대상 사용자':page==='personas'?`4 / 6 · 참여 구성 ${state.selected}명`:'5 / 6 · 탐색 범위';
    el('panelActionState').textContent=panelContinuing||state.saving?'설정을 저장하고 있어요.':locked?'실행한 회차의 설정입니다.':page==='panel'?'작성한 설명은 이전 화면으로 이동해도 유지돼요.':page==='personas'?state.loading?'조건과 구성을 확인하고 있어요.':!state.selected?'구성을 추천받거나 직접 선택으로 참여자를 추가하세요.':state.dirty?'선택한 구성을 저장하고 다음으로 이동합니다.':'선택한 페르소나로 탐색 범위를 설정하세요.':!panelScopeReady()?'선택한 탐색 방식과 핵심 확인 항목을 확인해 주세요.':'탐색 범위를 저장하고 실행 전 마지막 확인으로 이동합니다.';
    const button=el<HTMLButtonElement>('panelContinue');button.disabled=panelContinuing||state.saving||(page==='personas'&&state.loading);
    button.textContent=panelContinuing||state.saving?'저장 중…':page==='scope'&&!locked?'실행 시작 →':'다음 · '+info.next+' →';renderRunControls();renderCarryOffer();
  }
  /* 수정 회차는 새 앱·웹처럼 비어 있게 시작한다. 이전 회차에 적어 둔 내용은 버튼을 눌러야만 가져온다 */
  let carrySource:{key:string;prev?:{revision:number;scope:WorkflowScope}}|undefined;
  const carryKey=()=>`${sessionEpoch}:${study.id}`;
  const scopeHasContent=(s:WorkflowScope)=>Boolean(s.focus||s.priorities?.length||s.scenario||s.goal_url||s.goal_text||s.mode==='focused');
  async function loadCarry(){
    const rev=study.workflow?.revision||1,key=carryKey();
    if(!study.serverId||rev<2||hasExecution()||!capabilities?.workflow_ready){carrySource=undefined;renderCarryOffer();return;}
    if(carrySource?.key===key){renderCarryOffer();return;}
    carrySource={key};
    try{
      const list=await api.getRevisions(study.serverId);
      const prev=[...list].filter(r=>r.revision<rev).sort((a,b)=>b.revision-a.revision)[0];
      if(prev&&carryKey()===key){const flow=await api.getWorkflow(prev.study_id);if(carryKey()===key)carrySource={key,prev:{revision:prev.revision,scope:flow.scope}};}
    }catch{/* 이전 내용을 읽지 못해도 새로 입력할 수 있다 */}
    renderCarryOffer();
  }
  function renderCarryOffer(){
    const box=document.getElementById('carryOffer');if(!box)return;
    const page=location.hash.slice(1),prev=carrySource?.key===carryKey()?carrySource.prev:undefined;
    const a=prev?.scope.audience,cur=study.audienceDraft||study.workflow?.scope.audience;
    const show=Boolean(prev)&&panelViews.includes(page)&&!hasExecution()&&(page==='panel'?Boolean(a?.description?.trim()||a?.context?.trim())&&!cur?.description?.trim()&&!cur?.context?.trim():page==='personas'?Boolean(a?.entry_ids?.length)&&!(cur?.entry_ids?.length||study.personas.length):scopeHasContent(prev!.scope)&&!scopeHasContent(study.workflow?.scope||defaultScope()));
    box.hidden=!show;
    box.innerHTML=show?`<span>R${prev!.revision}에 적어 둔 내용이 있어요.</span><button type="button" class="btn" data-carry-apply="${page}">이전 회차 내용 가져오기</button>`:'';
  }
  function applyCarry(part:string){
    const prev=carrySource?.prev;if(!prev||hasExecution())return;
    const a=prev.scope.audience,base=structuredClone(study.audienceDraft||study.workflow?.scope.audience||emptyAudience());
    if(part==='panel'||part==='personas'){
      study.audienceDraft=part==='panel'?{...base,description:a?.description||'',context:a?.context||''}:{...base,filters:structuredClone(a?.filters||base.filters),entry_ids:[...(a?.entry_ids||[])],requested_count:a?.requested_count};
      persist();audienceBuilder.refresh();
    }else if(part==='scope'&&study.workflow){
      const p=prev.scope;
      Object.assign(study.workflow.scope,{mode:p.mode,exploration:p.exploration,priorities:[...(p.priorities||[])],focus:p.focus||'',goal_url:p.goal_url||'',goal_text:p.goal_text||'',scenario:p.scenario||'',max_turns:p.max_turns});
      persist();el('workflowScope').innerHTML=scopeMarkup(study);
    }
    renderPanelNavigation();notice(`R${prev.revision}의 내용을 가져왔어요. 필요하면 고쳐 쓰세요.`);
  }
  async function continuePanel(){
    if(busy||panelContinuing)return;const from=location.hash;
    if(hasExecution()){location.hash=from==='#panel'?'#personas':from==='#personas'?'#scope':'#run';return;}
    if(from==='#panel'){if(audienceBuilder.validateDescription()){location.hash='#personas';notice('');}return;}
    panelContinuing=true;renderPanelNavigation();
    try{
      readInputs();
      if(from==='#personas'){
        if(capabilities?.audience_builder_ready){if((audienceBuilder.isDirty()||!study.personas.length)&&!await audienceBuilder.save())return;}
        else if(!study.personas.length){notice('페르소나를 먼저 선택해 주세요.',true);return;}
        if(location.hash===from){location.hash='#scope';notice('');}return;
      }
      const issue=navigationIssue('run',true);if(issue){location.hash='#'+issue.view;notice(issue.message,true);const target=document.getElementById(issue.focus||'workflowScope');target?.focus({preventScroll:true});target?.scrollIntoView({block:'center'});return;}
      let arrived=false;
      await task(async()=>{await prepare();if(location.hash===from){launching=study.id;study.status='running';location.hash='#run';notice('');arrived=true;}});
      // 5단계에서 '실행 시작'을 누르면 6단계로 넘어가면서 바로 실행한다. 한 번 더 누르게 하지 않는다
      if(arrived&&location.hash==='#run'&&!hasExecution()&&!running)void task(execute).finally(()=>{launching='';if(!study.runs?.act&&study.status==='running')study.status='ready';renderRunControls();renderWorkflowContext();});
      else if(arrived){launching='';if(!study.runs?.act&&study.status==='running')study.status='ready';}
    }finally{panelContinuing=false;renderPanelNavigation();}
  }
  function renderWorkflowContext(){
    const view=location.hash.slice(1),executed=executedLayout(),setup=!executed&&setupViews.includes(view);
    el('recaptureBox').hidden=!(study.workflow?.source.needs_reconnect&&!executed);
    el('stepper').hidden=false; // 실행 전에도 같은 메뉴를 보여 주고, 아직 못 가는 곳은 잠금으로 표시한다
    { const carry=el('carryNote'),revisionNo=study.workflow?.revision||1; carry.hidden=executed||!setupViews.includes(view)||revisionNo<2||Boolean(study.workflow?.source.needs_reconnect); carry.textContent=`R${revisionNo} · 수정 회차`; }
    const state=executionState(study),settings=['product','source-review','proto','panel','personas','scope'];
    for(const a of root.querySelectorAll<HTMLAnchorElement>('#stepper a')){
      const destination=a.hash.slice(1),issue=navigationIssue(destination),badge=a.querySelector<HTMLElement>('[data-stage-status]');
      a.hidden=false;a.setAttribute('aria-disabled',String(Boolean(issue)));if(issue)a.title=issue.message;else a.removeAttribute('title');
      const active=destination==='product'?settings.includes(view):destination===view||destination==='report'&&['overview','compare'].includes(view);
      a.classList.toggle('is-current',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
      if(badge)badge.textContent=destination==='product'?executed?'확인':'':destination==='run'?state.phase==='running'?'진행 중':state.final?'종료':state.partial?'중단':issue?'잠금':'':destination==='report'?state.partial?'부분 기록':issue?'잠금':state.final?'완료':'':issue?'잠금':'';
    }
    root.querySelector<HTMLElement>('.wf-sidebar-settings')!.hidden=true;
    el('newConnectedStudy').hidden=!executed;el<HTMLButtonElement>('newConnectedStudy').disabled=!study.serverId||state.phase==='running'||state.phase==='checking';
    root.querySelector<HTMLElement>('.studio-test-label')!.textContent='현재 테스트';
    for(const a of root.querySelectorAll<HTMLAnchorElement>('#v-report .report-document-actions a[href="#interview"]')){a.setAttribute('aria-disabled',String(!state.canInterview));if(!state.canInterview)a.title='종료 기록이 있는 페르소나가 있어야 인터뷰를 열 수 있어요.';else a.removeAttribute('title');}
    el('workflowProgress').hidden=!setup;
    el('workflowProgress').innerHTML=[['product','화면 연결'],['source-review','화면 확인'],['panel','대상 사용자'],['personas','참여 구성'],['scope','탐색 범위'],['run','실행']].map(([id,label],i,all)=>{const current=all.findIndex(([x])=>x===view||x==='product'&&view==='proto'),done=current>=0&&i<current;return `<a href="#${id}" class="${done?'done':''}" ${i===current?'aria-current="step"':''}><b aria-hidden="true">${done?'✓':i+1}</b><span>${label}</span></a>`;}).join('');
    for(const a of root.querySelectorAll<HTMLAnchorElement>('#workflowProgress a')){const issue=navigationIssue(a.hash.slice(1));a.setAttribute('aria-disabled',String(Boolean(issue)));if(issue)a.title=issue.message;else a.removeAttribute('title');}
    root.querySelectorAll<HTMLAnchorElement>('#v-product [data-step-next],#v-proto [data-step-next]').forEach(a=>{a.href='#source-review';a.setAttribute('aria-disabled',String(Boolean(navigationIssue('source-review'))));a.textContent='다음 · 화면 확인 →';});
    const connectIssue=navigationIssue('source-review'),reviewIssue=navigationIssue('panel');
    el('sourceContinueHint').textContent=executed?'실행 당시 연결한 화면입니다.':connectIssue?.message||'시작 화면이 맞다면 다음 페이지에서 수집한 화면 이미지를 확인하세요.';
    el('sourceReviewContinue').setAttribute('aria-disabled',String(Boolean(reviewIssue)));
    el('sourceReviewContinueHint').textContent=executed?'실행 당시 탐색 자료입니다.':reviewIssue?.message||'확인한 화면과 범위를 검토했다면 대상 사용자를 정하세요.';
    renderPanelNavigation();
    el('v-run').classList.toggle('wf-browser-mode',browserSource(study));
    el('v-run').classList.toggle('wf-no-execution',!study.runs?.act&&!study.results.length);
    el('pauseBtn').hidden=browserSource(study)||!hasActRecords();
  }
  function renderOverview(){el('workflowOverview').innerHTML=overviewMarkup(study,revisions);}
  async function ensureDraft(){
    const owner=sessionEpoch,draft=study.id;requireSession(owner,draft);readInputs();
    if(!study.serverId){const saved=await api.createDraft(study.product.name||'새 테스트');requireSession(owner,draft);study.serverId=saved.id;trackServerDraft(saved.id);persist();
      // 연결만 하고 나가도 앱·웹 소속과 테스트 이름이 서버에 남도록 범위를 먼저 저장한다(연결은 이 범위를 이어받는다)
      if(study.productId||study.testTitle||study.roundNote){try{await api.saveWorkflow(saved.id,{...(study.workflow?.scope||defaultScope()),round_note:study.roundNote??'',product_id:study.productId??'',test_title:study.testTitle??''});}catch{/* 이후 단계 저장 때 다시 저장한다 */}}
    }
    return study.serverId;
  }
  async function hydrateWorkflow(target:Study){
    const owner=sessionEpoch;
    const workflow=await api.getWorkflow(target.serverId!);requireSession(owner);
    if(workflow?.root_study_id)target.workflow=workflow;
    if(target.runs?.act){const evidence=await api.getEvidence(target.runs.act);requireSession(owner);target.evidence=evidence;mergeEvidenceScreens(target);}
  }
  function mergeEvidenceScreens(target:Study){
    const screens=new Map((browserSource(target)&&target.evidence?.length?[]:target.screens).map(s=>[s.id,s]));
    for(const e of target.evidence||[])screens.set(e.screen.id,e.screen);
    target.screens=[...screens.values()];
  }
  async function loadRevisions(){
    if(!study.serverId||!capabilities?.workflow_ready){revisions=[];renderOverview();return;}
    const owner=sessionEpoch,id=study.id;
    try{const list=await api.getRevisions(study.serverId);requireSession(owner,id);revisions=list;renderOverview();}
    catch(error){if(sameSession(owner,id))notice(message(error),true);}
  }
  async function refreshEvidence(){
    if(!study.runs?.act||!capabilities?.workflow_ready)return;
    const owner=sessionEpoch,id=study.id;
    const items=await api.getEvidence(study.runs.act,study.evidence?.at(-1)?.id||0);requireSession(owner,id);
    study.evidence=[...new Map([...(study.evidence||[]),...items].map(e=>[e.id,e])).values()].sort((a,b)=>a.id-b.id);mergeEvidenceScreens(study);renderBrowserEvidence();
  }
  function renderBrowserEvidence(selected?:number){
    liveStage.update(study,selected);
    if(browserSource(study))for(const record of study.evidence||[]){
      const key=`evidence:${study.runs?.act}:${record.id}`;if(seen.has(key))continue;seen.add(key);
      const p=study.personas.find(p=>p.id===record.persona_id);
      addLog(`${p?personaId(p):record.persona_id} · ${record.turn+1}번째 행동`,record.action.reason||record.screen.label);
    }
  }
  function setManualSource(kind:'manual'|'figma'='manual',url?:string){
    sourceCheck={phase:'idle'};sourceScreenId='';
    const old=study.workflow;study.workflow={study_id:study.serverId||0,root_study_id:old?.root_study_id||study.serverId||0,revision:old?.revision||1,source:{kind,url},scope:{...(old?.scope||defaultScope()),goal_url:'',goal_text:'',scenario:''}};
  }
  function syncProductKind(){
    const kind=study.workflow?.scope.product_kind||'web',native=kind!=='web';
    root.querySelectorAll<HTMLInputElement>('[name="productKind"]').forEach(n=>n.checked=n.value===kind);
    root.querySelectorAll<HTMLElement>('[data-source-tab="web"],[data-source-tab="html"]').forEach(n=>n.hidden=false);root.querySelector<HTMLElement>('.wf-device')!.hidden=native;
    if(native)root.querySelector<HTMLDetailsElement>('.wf-more')!.open=true;
    el('productKindNote').textContent=native?`${kind==='ios'?'iOS':'Android'} 앱용 웹 링크·HTML·Figma·시안 이미지를 연결할 수 있어요. 링크와 HTML은 모바일 크기의 브라우저에서 탐색하며, 설치 앱의 OS 동작은 재현하지 않습니다.`:'실제 웹 주소 또는 개발 전 프로토타입을 연결하세요.';
  }
  function switchSource(kind:string){
    for(const key of ['web','html','figma']){el('source'+key[0].toUpperCase()+key.slice(1)).hidden=key!==kind;root.querySelector(`[data-source-tab="${key}"]`)?.setAttribute('aria-pressed',String(key===kind));}
  }
  async function sourcePayload(){
    if(!sourceFiles.length)throw new Error('HTML 파일 묶음이나 ZIP을 선택하세요.');
    const max=8*1024*1024;let size=0;let entries:Record<string,Uint8Array>={};
    if(sourceFiles.length===1&&sourceFiles[0].name.toLowerCase().endsWith('.zip')){
      if(sourceFiles[0].size>max)throw new Error('ZIP 파일은 8MB 이하로 올려주세요.');
      entries=unzipSync(new Uint8Array(await sourceFiles[0].arrayBuffer()),{filter:f=>{if(f.name.endsWith('/'))return false;size+=f.originalSize;if(size>max)throw new Error('압축 해제 후 8MB 이하로 올려주세요.');return true;}});
    }else{for(const file of sourceFiles){size+=file.size;if(size>max)throw new Error('전체 파일은 8MB 이하로 올려주세요.');entries[file.webkitRelativePath||file.name]=new Uint8Array(await file.arrayBuffer());}}
    let names=Object.keys(entries);if(names.length>100)throw new Error('파일은 100개까지 연결할 수 있습니다.');
    const common=names.every(n=>n.includes('/')&&n.split('/')[0]===names[0].split('/')[0])?names[0].split('/')[0]+'/':'';
    const files=names.map(name=>{const path=common?name.slice(common.length):name;if(path.includes('..')||path.startsWith('/')||path.includes('\\')||path.includes(':'))throw new Error('잘못된 파일 경로가 있습니다.');let binary='';for(const byte of entries[name])binary+=String.fromCharCode(byte);return {path,data:btoa(binary)};});
    const entry=files.find(f=>f.path==='index.html')?.path||files.find(f=>/\.html?$/i.test(f.path))?.path;
    if(!entry)throw new Error('시작할 HTML 파일이 없습니다.');return {files,entry};
  }
  async function connectSource(kind:'web'|'html'|'sample'|'recapture'){
    const owner=sessionEpoch,id=study.id;
    if(study.runs?.act||study.runs?.ask)throw new Error('수정 회차를 만든 뒤 연결하세요.');
    sourceCheckKey=study.id;sourceCheck={phase:'loading'};renderSourceRecognition();
    try{
      const productKind=study.workflow?.scope.product_kind||'web';
      let viewport:string;const url=input('sourceUrl').value.trim();viewport=productKind==='web'?(root.querySelector<HTMLInputElement>('[name="sourceViewport"]:checked')?.value||'desktop'):'mobile';
      const payload=kind==='html'?await sourcePayload():kind==='sample'?sampleSitePayload():null;requireSession(owner,id);
      if(kind==='sample')viewport='desktop';
      if(kind==='web'){try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw new Error();}catch{throw new Error('HTTP(S) 웹 주소를 입력하세요.');}}
      const server=await ensureDraft();requireSession(owner,id);notice('시작 화면을 연결하고 있어요. 전체 구조 탐색은 연결 후에도 계속 진행됩니다.');
      const result=kind==='recapture'?await api.recaptureSource(server):kind==='web'?await api.connectWeb(server,url,viewport,productKind):await api.connectHtml(server,payload!.files,payload!.entry,viewport,productKind);
      requireSession(owner,id);study.workflow=result;study.screens=result.screens;study.evidence=[];study.task=result.scope.scenario||'주요 화면을 살펴보세요.';study.goal='__browser_goal__';study.status='draft';
      fillProductFromScreens();if(!study.product.features.length)study.product.features=[study.task];
      sourceCheck={phase:'idle'};sourceScreenId='';recognitionSelection={};persist();syncInputs();lockInputs();notice('시작 화면이 연결됐어요. 다음 페이지에서 구조 탐색 진행과 화면·흐름을 확인하세요.');
    }catch(error){if(sameSession(owner,id)){sourceCheck={phase:'error',error:message(error)};renderSourceRecognition();}throw error;}
  }



  async function restoreSavedPreview(){
    if(!study.serverId)return;const owner=sessionEpoch,id=study.id,initialJob=study.workflow?.source.exploration?.id;
    sourceCheck={phase:'loading'};renderSourceRecognition();
    try{
      const oldUrl=study.workflow?.source.url;let saved=await api.getWorkflow(study.serverId);
      if(!sameSession(owner,id)||!saved?.source?.observed_screen)return;
      if(!hasExecution()&&saved.source.inspection?.capture_ready!==true){
        const fresh=await api.refreshSourceCapture(study.serverId,saved.source.exploration?.id);
        if(fresh?.source?.preview)saved=fresh;
      }
      if(!sameSession(owner,id)||study.workflow?.source.exploration?.id!==initialJob)return;
      study.workflow={...saved,scope:study.workflow?.scope||saved.scope};if(!study.screens.length)study.screens=[saved.source.observed_screen!];
      if(!input('sourceUrl').value||input('sourceUrl').value===oldUrl)input('sourceUrl').value=saved.source.url||'';
      persist();sourceCheck={phase:'idle'};renderSourceRecognition();renderStudioContext();
    }catch(error){if(sameSession(owner,id))notice('저장된 시작 화면을 불러오지 못했어요. 캡처 새로고침으로 다시 확인하세요.',true);}
    finally{if(sameSession(owner,id)&&study.workflow?.source.exploration?.id===initialJob){sourceCheck={phase:'idle'};renderSourceRecognition();renderStudioContext();}}
  }
  async function refreshCapture(){
    if(!study.serverId||hasExecution())return;const owner=sessionEpoch,id=study.id;
    sourceCheck={phase:'loading'};renderSourceRecognition();
    try{const result=await api.refreshSourceCapture(study.serverId,study.workflow?.source.exploration?.id);requireSession(owner,id);
      const scope=study.workflow?.scope||result.scope;study.workflow={...result,scope};study.screens=result.screens;
      sourceCheck={phase:'idle'};persist();renderSourceRecognition();notice('시작 화면을 다시 캡처했어요. 구조 탐색 기록은 유지됩니다.');
    }catch(error){if(sameSession(owner,id)){sourceCheck={phase:'error',error:message(error)};renderSourceRecognition();}throw error;}
  }
  async function reviewExploration(){
    const job=study.workflow?.source.exploration;if(!study.serverId||!job)return;const owner=sessionEpoch,id=study.id;
    const saved=await api.reviewExploration(study.serverId,job.id);requireSession(owner,id);
    study.workflow!.scope.reviewed_exploration_id=saved.scope.reviewed_exploration_id;persist();renderSourceDetails();notice('현재 확인한 탐색 범위를 저장했어요. 다음 단계로 이동할 수 있어요.');
  }

  async function refreshExploration(force=false){
    const job=study.workflow?.source.exploration;
    if(explorationPolling||!user||!study.serverId||sourceCheck.phase==='loading'||!job||(!force&&!['queued','running','pausing'].includes(job.status)))return;
    const owner=sessionEpoch,id=study.id,jobId=job.id,serverId=study.serverId;explorationPolling=true;
    try{
      const update=await api.getExploration(serverId,force?-1:job.version);
      if(!sameSession(owner,id)||study.workflow?.source.exploration?.id!==jobId)return;
      if(!update.job||update.job.id!==jobId){const progress=document.getElementById('explorationJob');if(progress&&!progress.querySelector('.ex-connection-error'))progress.insertAdjacentHTML('beforeend','<p class="ex-connection-error" role="alert">저장된 연결이 이 화면의 자료와 달라요. 주소를 다시 연결해 최신 탐색을 시작해 주세요.</p>');return;}
      if(update.job.version<study.workflow.source.exploration.version)return;
      if(update.source){
        const before=study.workflow.source.preflight?.states.length||0;
        study.workflow.source={...study.workflow.source,...update.source,exploration:update.job};persist();
        const panel=el('sourceDetails'),active=document.activeElement;
        if(!before||!active||!panel.contains(active)){const held=active&&panel.contains(active)&&(active as HTMLElement).dataset.explorationAction;renderSourceDetails();if(held)el('sourceDetails').querySelector<HTMLElement>('[data-exploration-action]')?.focus({preventScroll:true});}
        else{const progress=document.getElementById('explorationJob');if(progress){const held=progress.contains(active),action=(active as HTMLElement).dataset.explorationAction;progress.innerHTML=explorationMarkup(study);if(held)(progress.querySelector<HTMLElement>(action?'[data-exploration-action]':'[data-exploration-show]'))?.focus({preventScroll:true});}}
      }
    }catch(error){if(sameSession(owner,id)){const progress=document.getElementById('explorationJob');if(progress&&!progress.querySelector('.ex-connection-error'))progress.insertAdjacentHTML('beforeend','<p class="ex-connection-error" role="status">진행 상태 연결이 지연되고 있어요. 저장한 결과는 유지하며 다시 확인합니다.</p>');}}
    finally{explorationPolling=false;}
  }
  async function controlExploration(action:'start'|'pause'|'resume'){
    if(explorationBusy||!study.serverId||study.runs?.act||study.runs?.ask)return;
    const owner=sessionEpoch,id=study.id;explorationBusy=true;
    const buttons=root.querySelectorAll<HTMLButtonElement>('[data-exploration-action]');buttons.forEach(b=>b.disabled=true);
    try{
      const update=await api.controlExploration(study.serverId,action,study.workflow?.source.exploration?.id);requireSession(owner,id);
      if(study.workflow&&update.job){if(study.workflow.source.exploration?.id!==update.job.id){delete study.workflow.source.site_map;delete study.workflow.source.preflight;}study.workflow.source={...study.workflow.source,...update.source,exploration:update.job};persist();renderSourceDetails();}
    }finally{explorationBusy=false;if(sameSession(owner,id))renderSourceDetails();}
  }

  async function loadComparison(){
    if(!study.serverId||!capabilities?.workflow_ready){el('comparisonResult').textContent='서버에 저장된 두 회차가 있어야 비교할 수 있습니다.';return;}
    await loadRevisions();
    const options=revisions.filter(r=>r.runs.some(x=>x.mode==='act'&&x.status==='done'));
    if(options.length<2){el('comparisonControls').innerHTML='';el('comparisonResult').textContent='완료된 실행이 있는 두 회차를 선택하면 비교할 수 있습니다.';return;}
    const select=(id:string,index:number)=>`<label>${id==='compareBefore'?'이전 회차':'이후 회차'}<select class="select" id="${id}">${options.map((r,i)=>`<option value="${r.study_id}" ${i===index?'selected':''}>${r.revision}차 · ${escape(r.name)}</option>`).join('')}</select></label>`;
    el('comparisonControls').innerHTML=select('compareBefore',1)+select('compareAfter',0)+'<button type="button" class="btn solid" id="compareRounds">결과 비교</button>';
    await compareRounds();
  }
  async function compareRounds(){
    const owner=sessionEpoch,id=study.id,request=++comparisonRequest;
    const before=Number(input('compareBefore').value),after=Number(input('compareAfter').value);
    if(before===after){el('comparisonResult').textContent='서로 다른 회차를 선택하세요.';return;}
    el('comparisonResult').textContent='각 회차의 기록과 조건을 불러오고 있습니다.';
    const load=async(sid:number)=>{const [detail,report,workflow]=await Promise.all([api.getStudy(sid),api.getReport(sid),api.getWorkflow(sid)]);const s=newStudy();s.serverId=sid;s.workflow=workflow;s.task=detail.task?.description||'';s.screens=detail.prototype?.screens||[];s.personas=detail.personas;s.results=report.results;s.runMeta=report.meta??null;s.runs={act:report.act_run_id||undefined};if(s.runs.act){s.evidence=await api.getEvidence(s.runs.act);mergeEvidenceScreens(s);}return s;};
    try{const [a,b]=await Promise.all([load(before),load(after)]);requireSession(owner,id);if(request===comparisonRequest)el('comparisonResult').innerHTML=comparisonMarkup(a,b);}
    catch(error){if(sameSession(owner,id)&&request===comparisonRequest)el('comparisonResult').textContent=message(error);}
  }
  root.addEventListener('click',event=>{
    const target=(event.target as HTMLElement).closest<HTMLElement>('button');if(!target)return;
    if(target.dataset.recognitionTab){selectRecognitionTab(target.dataset.recognitionTab as RecognitionTab);return;}
    if(target.dataset.recognitionOpen){selectRecognitionTab(target.dataset.recognitionOpen as RecognitionTab,true);return;}
    if(target.hasAttribute('data-capture-refresh')){void task(refreshCapture);return;}
    if(target.hasAttribute('data-exploration-review')){void task(reviewExploration);return;}
    if(target.dataset.explorationAction){void task(()=>controlExploration(target.dataset.explorationAction as 'start'|'pause'|'resume'));return;}
    if(target.hasAttribute('data-exploration-show')){recognitionSelection={tab:'pages'};renderSourceDetails();el('sourceDetails').querySelector<HTMLElement>('#sr-panel')?.focus({preventScroll:true});return;}
    if(target.dataset.recognitionState){recognitionSelection={tab:'pages',stateId:target.dataset.recognitionState};renderSourceDetails();const card=el('sourceDetails').querySelector<HTMLElement>('[data-preflight-state="'+CSS.escape(target.dataset.recognitionState)+'"]');card?.focus({preventScroll:true});card?.scrollIntoView({block:'center',behavior:media.matches?'auto':'smooth'});return;}
    if(target.hasAttribute('data-recognition-page')){recognitionSelection={...recognitionSelection,stateId:undefined,page:Math.max(0,Number(target.dataset.recognitionPage)),tab:'pages'};renderSourceDetails();el('sourceDetails').querySelector<HTMLElement>('#sr-panel')?.focus({preventScroll:true});return;}
    if(target.id==='panelContinue'){void continuePanel();return;}
    if(target.hasAttribute('data-snapshot-url')){const page=study.workflow?.source.site_map?.pages.find(p=>p.url===target.dataset.snapshotUrl);if(page?.image&&/^data:image\/(jpeg|png|webp);base64,/.test(page.image)){const image=el<HTMLImageElement>('sourceCaptureImage');image.src=page.image;image.alt=page.label+' 화면 캡처';el<HTMLDialogElement>('sourceCaptureDialog').showModal();}return;}
    if(target.hasAttribute('data-source-zoom')){const image=el('sourcePreview').querySelector<HTMLImageElement>('.ri-capture img');if(image){el<HTMLImageElement>('sourceCaptureImage').src=image.src;el<HTMLImageElement>('sourceCaptureImage').alt=image.alt;el<HTMLDialogElement>('sourceCaptureDialog').showModal();}return;}
    if(target.id==='closeSourceCapture'){el<HTMLDialogElement>('sourceCaptureDialog').close();el<HTMLImageElement>('sourceCaptureImage').removeAttribute('src');return;}
    if(target.dataset.sourceTab)switchSource(target.dataset.sourceTab);
    if(target.id==='connectSample'){const d=input('pdesc');if(!d.value.trim()){d.value=SAMPLE_SITE.description;readInputs();}void task(()=>connectSource('sample'));}
    if(target.id==='newTestNoteReuse'){const box=input('newTestNote');box.value=target.dataset.note||'';box.focus();return;}
    if(target.id==='recaptureSource')void task(()=>connectSource('recapture'));
    if(target.id==='connectWeb'||target.id==='connectHtml')void task(()=>connectSource(target.id==='connectWeb'?'web':'html'));
    if(target.id==='pickHtmlFolder')input('sourceFolder').click();
    if(target.dataset.browserEvidence)renderBrowserEvidence(Number(target.dataset.browserEvidence));
    if(target.id==='compareRounds')void task(compareRounds);
  });
  root.addEventListener('change',event=>{
    const target=event.target as HTMLInputElement;
    if(target.id==='sourceScreenSelect'){sourceScreenId=target.value;renderSourceRecognition();return;}
    if(target.name==='productKind'){
      if(study.runs?.act||study.runs?.ask){syncProductKind();return;}
      if(!study.workflow)setManualSource();study.workflow!.scope.product_kind=target.value as 'web'|'ios'|'android';
      study.workflow!.scope.viewport=target.value==='web'?'desktop':'mobile';persist();syncWorkflow();renderStudioContext();return;
    }
    if(target.id==='sourceFiles'||target.id==='sourceFolder'){sourceFiles=Array.from(target.files||[]);el('sourceFileStatus').textContent=`${sourceFiles.length}개 파일 선택됨`;}
    if(target.name==='explorationMode'){readScope();el('journeyScopeFields').hidden=siteMode(study);el('siteScopeInfo').hidden=!siteMode(study);persist();renderStudioContext();return;}
    if(target.name==='sourceViewport'&&study.workflow){study.workflow.scope.viewport=target.value==='mobile'?'mobile':'desktop';persist();renderSourceRecognition();renderStudioContext();}
  });

  root.addEventListener('keydown',event=>{const tab=(event.target as HTMLElement).closest<HTMLElement>('[data-recognition-tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs:RecognitionTab[]=['pages','checks','structure'],i=tabs.indexOf(tab.dataset.recognitionTab as RecognitionTab);selectRecognitionTab(tabs[event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3]);});
  el('think').textContent = '실제 실행을 기다립니다.';
  const resizeObserver = new ResizeObserver(() => drawRotor(rotorPosition));
  resizeObserver.observe(el('prototypeStage'));
  media.addEventListener('change', () => { cancelAnimationFrame(rotorFrame); rotorPosition = rotorTarget; drawRotor(rotorPosition); });
  window.addEventListener('hashchange', route);
  const sessionExpired = () => { restoreCounter++; authBusy=false;updateAuthBusy(); setUser(null); authChecked = true; location.hash = '#login'; route(); authError('로그인이 만료되었습니다. 다시 로그인해 주세요.'); };
  const sessionSync = (event: StorageEvent) => { if (event.key === STORAGE_PREFIX + ':auth-sync') void restoreSession();else if(user&&event.key===KEY+':management-sync'&&!busy)void probe(); };
  const focusSession = () => { void restoreSession(); };
  window.addEventListener('personalab:session-expired', sessionExpired);
  window.addEventListener('storage', sessionSync);
  window.addEventListener('focus', focusSession);
  const screenEditor = mountScreenEditor(el('screenEditor'), () => ({screens:study.screens,locked:Boolean(study.runs?.ask || study.runs?.act)}), screens => {
    setManualSource();study.screens = screens; study.results = []; study.status = study.personas.length?'ready':'draft';
    if (!screens.some(s => s.id === study.goal)) study.goal = screens.at(-1)!.id;
    persist(); syncInputs(); lockInputs();
  }, notice);
  const explorationWatcher=setInterval(()=>{void refreshExploration();},2000);
  // 휴지통 비우기: 휴지통의 모든 테스트를 영구 삭제한다(되돌릴 수 없어 확인 문구를 받는다)
  root.addEventListener('click', event => {
    const t = event.target as HTMLElement;
    if (t.closest('[data-ws-ask-more]')) { toggleWorkspaceAskAll(); renderWorkspace(); return; }
    if (t.closest('#emptyTrashBtn')) {
      const n = [...workspaceEntries.values()].filter(e => e.trashed && e.server).length;
      el('emptyTrashLead').textContent = `휴지통에 있는 테스트 ${n}개의 설정, 실행 기록, 인터뷰 대화가 모두 영구 삭제돼요. 되돌릴 수 없어요.`;
      input('emptyTrashInput').value = ''; el('emptyTrashError').textContent = '';
      const dlg = el<HTMLDialogElement>('emptyTrashDialog'); if (!dlg.open) dlg.showModal(); input('emptyTrashInput').focus();
    } else if (t.closest('#emptyTrashCancel')) el<HTMLDialogElement>('emptyTrashDialog').close();
  });
  el<HTMLFormElement>('emptyTrashForm').addEventListener('submit', event => {
    event.preventDefault();
    if (input('emptyTrashInput').value.trim() !== '휴지통 비우기') { el('emptyTrashError').textContent = '확인 문구를 정확히 입력해 주세요.'; return; }
    el<HTMLDialogElement>('emptyTrashDialog').close();
    void task(async () => {
      const owner = sessionEpoch; const result = await api.emptyTrash('휴지통 비우기'); requireSession(owner);
      serverStudies = serverStudies.filter(s => !result.study_ids.includes(s.id)); result.study_ids.forEach(id => serverDetail.delete(id));
      await probe(); renderWorkspace();
      notice(result.skipped ? `${result.deleted}개를 삭제했어요. 실행 중인 ${result.skipped}개는 건너뛰었어요.` : `${result.deleted}개를 영구 삭제했어요.`);
    });
  });
  const storedRunWatcher=setInterval(()=>{if(user&&!busy&&!running&&!runRefreshPaused&&study.runs?.act&&(!study.execution||study.status==='running')&&['run','report','interview'].includes(location.hash.slice(1)))void task(refreshStoredRun);},1800);
  syncInputs(); lockInputs(); route(); void restoreSession();
  return () => { liveStage.dispose();clearInterval(storedRunWatcher);clearInterval(explorationWatcher); audienceBuilder.dispose();workspaceManager.dispose();workspaceSidebar.dispose(); root.removeEventListener('click', closeWorkspaceAccount); document.removeEventListener('keydown', workspaceKeys); reportView?.dispose(); disposePeople(); disposeMarketing(); disposeDemo(); screenEditor.dispose(); restoreCounter++; sessionEpoch++; user = null; clearTimeout(playTimer); visualQueue = []; cancelAnimationFrame(rotorFrame); resizeObserver.disconnect(); window.removeEventListener('hashchange', route); window.removeEventListener('personalab:session-expired', sessionExpired); window.removeEventListener('storage', sessionSync); window.removeEventListener('focus', focusSession); };
}
