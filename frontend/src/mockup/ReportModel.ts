import { DROP_LABELS, personaId } from '../studio/model';
import type { Study, Result, Act } from '../studio/model';

export type ActRecord = Result & { act: Act };
export type Outcome = 'complete' | 'drop' | 'system' | 'pending';
export const RECORD_QUESTIONS = ['왜 이 화면에서 멈췄나요?', '어떤 경로로 이동했나요?', '어느 화면까지 확인했나요?'];
export const reportSource = (s: Study) => s.reportSource === 'local-demo' ? 'local-demo' : s.reportSource === 'ui-mock' ? 'ui-mock' : s.source === 'demo' ? 'saved-ai-demo' : 'server-act-records';
export const sourceTitle = (s: Study) => s.reportSource === 'local-demo' ? '로컬 연결 점검 · 가상 예시' : s.reportSource === 'ui-mock' ? 'UI 목데이터' : s.source === 'demo' ? '저장된 AI 데모' : '저장된 AI 탐색 기록';
export const browserReport = (s: Study) => s.workflow?.source.kind === 'web' || s.workflow?.source.kind === 'html';
export const observationBasis = (s: Study) => browserReport(s) ? (s.workflow?.scope.product_kind&&s.workflow.scope.product_kind!=='web'?'앱용 HTML/웹 프로토타입을 모바일 브라우저에서 탐색한 기록입니다. 설치 앱의 OS·권한·키보드 동작은 검증하지 않습니다.':!s.workflow?.source.site_map?'페이지 목록이 없는 이전 연결의 탐색 기록입니다. 사이트 전체 화면 수와 미방문 영역은 집계하지 않습니다.':'발견한 페이지 목록과 실제 브라우저 탐색 기록을 대조합니다. 구조 확인은 사용성 평가 완료가 아니며, 로그인 뒤 화면과 발견하지 못한 영역은 포함하지 않습니다.') : s.screens.some(screen=>screen.image)?'등록된 화면 시안·설명·버튼 연결에 기반합니다. 설치 앱의 OS 동작·권한 팝업·키보드는 재현하지 않습니다. 방문하지 않은 화면은 평가하지 않습니다.':'등록된 화면 설명과 버튼 연결에 기반합니다. 방문하지 않은 화면은 평가하지 않습니다.';
export const screenTitle = (s: Study, id?: string | null) => s.screens.find(screen => screen.id === id)?.label || id || '화면 정보 없음';
// 규칙 기반 탐색(AI 없음)에서 '더 누를 곳이 없어서' 또는 '이미 본 화면으로 돌아와서' 끝난 것은 사람이 포기한 것이 아니다.
// 사용자 이탈(문제)로 세지 않고 '탐색 마침'으로 따로 둔다.
const ruleBased = (r: Result) => Boolean(r.act?.events.some(e => (e.reason || '').startsWith('규칙 기반 탐색')));
// 같은 화면을 맴돌아 시스템이 끊은 NAVIGATION_LOST(마지막 행동이 포기가 아님)도 사람이 포기한 것이 아니다.
// 페르소나가 직접 '길을 잃었다'며 포기(abandon)한 기록만 사용자 이탈로 센다.
const forcedStop = (r: Result) => r.act?.end.drop_reason === 'NAVIGATION_LOST' && r.act.events.at(-1)?.action !== 'abandon';
export const outcome = (r?: Result): Outcome => !r?.act ? 'pending' : r.act.end.result === 'complete' ? 'complete' : r.act.end.drop_reason === 'MAX_TURNS' || (r.act.end.drop_reason === 'NAVIGATION_LOST' && (ruleBased(r) || forcedStop(r))) ? 'system' : 'drop';
export const outcomeLabel = (r?: Result) => outcome(r) === 'system' && r?.act?.end.drop_reason !== 'MAX_TURNS' ? '탐색 마침' : ({ complete:'목표 도달', drop:'탐색 중단', system:'탐색 한도', pending:'결과 없음' })[outcome(r)];
export const dropLabel = (code?: string | null) => DROP_LABELS[code || ''] || '이유 미기록';
export const checkHypothesis = (code: string) => ({
  PRIVACY:'각 정보가 필요한 이유와 보관 범위를 안내하고, 필수 입력을 줄일 수 있는지 확인하세요.',
  TOO_MANY_STEPS:'첫 이용에 꼭 필요한 절차만 남기거나 나중에 완료할 수 있는지 확인하세요.',
  UNCLEAR_PURPOSE:'이 화면에서 할 일과 다음 단계에서 얻을 것을 문구로 설명해 보세요.',
  TRUST:'불안을 언급한 문장과 연결해 서비스 주체와 처리 과정을 충분히 설명하는지 확인하세요.',
  PRICE:'금액 자체를 평가하기보다, 비용이 발생하는 시점과 조건이 화면에 명확한지 확인하세요.',
  FEATURE_MISSING:'목표에 필요한 기능이 화면에서 발견되는지, 관련 안내와 진입점을 확인하세요.',
  SWITCHING_COST:'기존 이용 방식에서 이어올 수 있는 정보와 전환 절차를 안내하는지 확인하세요.',
  NAVIGATION_LOST:'화면 간 연결과 현재 위치 안내를 확인하세요. 반복 방문 차단으로 끝났을 가능성도 기록과 함께 살펴보세요.',
} as Record<string,string>)[code] || '해당 화면의 문구와 연결을 원문 기록에 대조해 확인하세요.';

export function analyzeReport(study: Study) {
  const records = study.results.filter((r): r is ActRecord => Boolean(r.act));
  const complete = records.filter(r => outcome(r) === 'complete');
  const dropped = records.filter(r => outcome(r) === 'drop');
  const system = records.filter(r => outcome(r) === 'system');
  const ids = new Set([...study.personas.map(p => p.id), ...study.results.map(r => r.id)]);
  const pending = [...ids].filter(id => !records.some(r => r.id === id));
  const visited = new Set(records.flatMap(r => r.act.path));
  const groups = new Map<string,{key:string;screen:string;code:string;records:ActRecord[]}>();
  for (const r of dropped) {
    const screen = r.act.end.screen || '', code = r.act.end.drop_reason || '';
    const key = JSON.stringify([screen,code]);
    if (!groups.has(key)) groups.set(key,{key,screen,code,records:[]});
    groups.get(key)!.records.push(r);
  }
  const findings = [...groups.values()].sort((a,b) => b.records.length-a.records.length);
  const coverage = study.screens.map(screen => ({screen, arrived:records.filter(r=>r.act.path.includes(screen.id)).length,
    stopped:dropped.filter(r=>r.act.end.screen===screen.id).length, system:system.filter(r=>r.act.end.screen===screen.id).length}));
  return {records,complete,dropped,system,pending,total:ids.size,visited,findings,coverage};
}

export function recordAnswer(study: Study, id: number, question: string): string {
  const r = study.results.find(r => r.id === id), p = study.personas.find(p => p.id === id);
  if (!r?.act) return '이 페르소나의 탐색 결과가 아직 없습니다. 방문한 화면이나 중단 이유를 확인할 수 없습니다.';
  const label = (id: string) => `${id} ${screenTitle(study,id)}`;
  const missing = study.screens.filter(s=>!r.act!.path.includes(s.id));
  if (/어느|어디까지|범위|미확인/.test(question) || missing.some(s => question.includes(s.id) || question.includes(s.label))) {
    return `확인한 화면은 ${r.act.path.map(label).join(', ')}입니다.\n${missing.length ? `방문하지 않은 화면: ${missing.map(s=>label(s.id)).join(', ')}. 이 화면의 경험은 기록으로 답할 수 없습니다.` : '등록된 모든 화면을 방문했지만, 모든 요소를 평가했다는 뜻은 아닙니다.'}\n\n근거: 이 페르소나의 저장된 탐색 경로.`;
  }
  if (/경로|들어|이동|눌|클릭/.test(question)) return `${p ? personaId(p) : r.persona_id}의 경로는 ${r.act.path.map(label).join(' → ')}입니다.\n${r.act.events.filter(e=>e.action==='click').map(e=>`${label(e.screen)}에서 “${e.target}” 선택${e.to ? ` → ${label(e.to)}` : ''}.`).join('\n')}\n\n근거: 저장된 이동 기록. 그 외의 행동은 기록에 없습니다.`;
  if (outcome(r)==='system') return '탐색 횟수 한도에 도달해 종료됐습니다. 이를 페르소나의 불편이나 자발적인 이탈로 해석하지 않습니다.\n\n근거: 종료 코드 MAX_TURNS. 기록의 경로와 실행 범위를 다시 확인하세요.';
  if (outcome(r)==='complete') return `이 페르소나는 ${label(r.act.end.screen || study.goal)}에 도달했습니다. 중단 이유는 없습니다.\n\n근거: 저장된 목표 도달 기록. 목표 도달만으로 만족도나 모든 화면의 사용성을 판단하지 않습니다.`;
  const event = [...r.act.events].reverse().find(e=>e.action==='abandon');
  return `${/왜|이유|중단|멈|불편|복잡/.test(question) ? '' : '새 답변은 생성하지 않습니다. 확인할 수 있는 기록을 보여드립니다.\n\n'}${label(r.act.end.screen || '')}에서 남긴 원문입니다.\n${event?.reason ? `“${event.reason}”` : '중단 이유 문장이 기록되지 않았습니다.'}\n\n분류: ${dropLabel(r.act.end.drop_reason)}. 근거: 저장된 중단 기록. 추가 해석이나 수정안의 효과는 확인하지 않았습니다.`;
}