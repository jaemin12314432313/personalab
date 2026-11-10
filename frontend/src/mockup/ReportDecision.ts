// 발견에 대한 사용자의 결정(검토 전 / 수정 예정 / 보류 / 해당 없음).
// 서버 저장 구조는 건드리지 않고 이 브라우저에만 남긴다. 다른 기기나 사람에게는 보이지 않는다.
import type { Study } from '../studio/model';

export const DECISIONS = ['검토 전', '수정 예정', '보류', '해당 없음'] as const;
export type Decision = (typeof DECISIONS)[number];

const storage = () => { try { return window.localStorage; } catch { return null; } };
const keyOf = (study: Study, screen: string, code: string) => `pl-decision:${study.serverId ?? study.id}:${screen}:${code}`;

export function getDecision(study: Study, screen: string, code: string): Decision {
  try {
    const saved = storage()?.getItem(keyOf(study, screen, code));
    return (DECISIONS as readonly string[]).includes(saved || '') ? (saved as Decision) : '검토 전';
  } catch { return '검토 전'; }
}

export function setDecision(study: Study, screen: string, code: string, value: string) {
  if (!(DECISIONS as readonly string[]).includes(value)) return;
  try {
    const store = storage(), key = keyOf(study, screen, code);
    if (!store) return;
    if (value === '검토 전') store.removeItem(key); else store.setItem(key, value);
  } catch { /* 저장소를 못 쓰는 환경에서는 결정이 화면에만 머문다 */ }
}
