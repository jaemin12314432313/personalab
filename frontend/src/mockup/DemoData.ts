import { DEMO, DROP_LABELS, personaId } from '../studio/model';
import type { Study } from '../studio/model';

export const DEMO_STEPS = ['제품 맥락', '화면 연결', '페르소나', '탐색 재생', '결과·인터뷰'];
export const DEMO_STORAGE = 'personalab-public-demo-v1';
export const DEMO_QUESTIONS = ['왜 이 화면에서 멈췄나요?', '어떤 경로로 들어왔나요?', '어느 화면까지 확인했나요?'];
export interface DemoMessage { question: string; answer: string }
export interface DemoState { step: number; selected: number[]; complete: boolean; screen: string; person: number; chats: Record<string, DemoMessage[]> }
export function initialDemo(): DemoState { return { step: 0, selected: DEMO.personas.map(p => p.id), complete: false, screen: DEMO.screens[0].id, person: DEMO.personas[0].id, chats: {} }; }
export function restoreDemo(raw: string | null): DemoState {
  const base = initialDemo();
  try {
    const value = JSON.parse(raw || 'null'); if (!value || !Array.isArray(value.selected)) return base;
    const selected = DEMO.personas.filter(p => value.selected.includes(p.id)).map(p => p.id);
    const complete = value.complete === true && selected.length > 0;
    const chats: DemoState['chats'] = {};
    for (const p of DEMO.personas) {
      const thread = value.chats?.[p.id];
      if (Array.isArray(thread)) chats[p.id] = thread.filter((m: DemoMessage) => typeof m?.question === 'string' && typeof m?.answer === 'string').slice(-20).map((m: DemoMessage) => ({question:m.question.slice(0,500), answer: interviewAnswer(p.id, m.question)}));
    }
    return { step: Number.isInteger(value.step) ? Math.max(0, Math.min(complete ? 4 : selected.length ? 3 : 2, value.step)) : 0, selected, complete,
      screen: DEMO.screens.some(s => s.id === value.screen) ? value.screen : base.screen,
      person: selected.includes(value.person) ? value.person : selected[0] || base.person, chats };
  } catch { return base; }
}
export function demoStudy(selected: number[]): Study {
  const study = structuredClone(DEMO); study.personas = study.personas.filter(p => selected.includes(p.id));
  study.results = study.results.filter(r => selected.includes(r.id)).map(r => ({ ...r, ask: null }));
  study.count = study.personas.length; return study;
}
export function interviewAnswer(id: number, question: string): string {
  const p = DEMO.personas.find(p => p.id === id), r = DEMO.results.find(r => r.id === id);
  if (!p || !r?.act) return '선택한 페르소나의 탐색 기록이 없습니다.';
  const labels = (screen: string) => `${screen} ${DEMO.screens.find(s => s.id === screen)?.label || ''}`;
  if (/경로|들어|이동|눌|클릭/.test(question)) return `${personaId(p)}의 저장된 경로는 ${r.act.path.map(labels).join(' → ')}입니다. ${r.act.events.filter(e => e.action === 'click').map(e => `${labels(e.screen)}에서 “${e.target}”를 선택했습니다.`).join(' ')}\n\n근거: 저장된 Act 이동 기록. 그 외의 행동은 기록에 없습니다.`;
  if (/어느|어디까지|범위|미확인|홈|관심|학교/.test(question)) return `확인한 화면은 ${r.act.path.map(labels).join(', ')}입니다. ${DEMO.screens.filter(s => !r.act!.path.includes(s.id)).map(s => `${s.id} ${s.label}`).join(', ')} 화면은 방문하지 않았습니다.\n\n근거: 저장된 Act 경로. 방문하지 않은 화면의 경험은 이 기록으로 답할 수 없습니다.`;
  const last = r.act.events.find(e => e.action === 'abandon');
  const quote = last?.reason || '중단 이유 문장이 없습니다.';
  const prefix = /왜|이유|중단|멈|가입|개인정보|인증|불편|복잡/.test(question) ? '' : '이 질문에 대한 새 답변은 생성하지 않습니다. 관련해 확인할 수 있는 원본 기록을 보여드립니다.\n\n';
  return `${prefix}${labels(r.act.end.screen || '')}에서 남긴 원문입니다.\n“${quote}”\n\n분류: ${DROP_LABELS[r.act.end.drop_reason || ''] || '미분류'}. 근거: 저장된 Act 중단 기록. 수정안의 효과나 추가 경험은 확인하지 않았습니다.`;
}