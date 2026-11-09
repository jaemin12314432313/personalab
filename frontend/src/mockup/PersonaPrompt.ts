import {portraitMarkup} from './DisplayPersona';
import type { Persona } from '../studio/model';
import { personaId } from '../studio/model';
import type { PersonaPromptPreview } from '../api/studio';
import './persona-prompt.css';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function demoPersonaPrompt(persona: Persona) {
  const profile=persona.attributes.profile;
  return [
    '다음 배경의 AI 페르소나로 UI·UX를 탐색하세요.', '',
    '[페르소나 카드]',persona.attributes.card_text,'',
    '[기본 프로필]',`${personaId(persona)} · ${profile.age}세 · ${profile.job_group}`,
    ...(profile.sex ? [`성별: ${profile.sex}`] : []),...(profile.region ? [`지역: ${profile.region}`] : []),'',
    '[탐색 원칙]','현재 화면의 문구와 제공된 버튼을 바탕으로 선택합니다.',
    '화면에서 확인할 수 없는 사실이나 방문하지 않은 화면의 경험을 만들어 내지 않습니다.',
    '선택하거나 멈춘 이유를 화면의 사실과 연결해 설명합니다.','',
    '[출처]','공개 데모 프로필로 구성한 프롬프트 예시입니다. 저장된 실행 당시의 전체 프롬프트는 아닙니다.',
  ].join('\n');
}
export function executionPrompt(preview: PersonaPromptPreview) {
  return ['[System]',preview.system,'',...preview.contents.flatMap(part=>[part,'']),'[Response schema]',JSON.stringify(preview.response_schema,null,2)].join('\n');
}
export function promptPanel(persona: Persona, prompt: string, options: {portrait?:number; demo?:boolean; loading?:boolean; error?:string; screen?:string}={}) {
  const p=persona.attributes.profile;
  if(!options.demo)return `<div class="persona-prompt-panel"><aside class="persona-prompt-profile">${portraitMarkup(persona.attributes,'persona-profile-portrait')}<span class="persona-prompt-id">${esc(personaId(persona))}</span><h3>${p.age}세 ${esc(p.job_group)}</h3><p>${[p.sex,p.region].filter(Boolean).map(esc).join(' · ')}</p><small>AI 대표 이미지 · 실제 응답자 사진 아님</small></aside><div class="persona-prompt-content"><header><div><span>AI 페르소나 · 표시용 프로필</span><h2 tabindex="-1">이런 관점으로<br>화면을 살펴봅니다.</h2></div><button class="btn quiet sm" type="button" data-prompt-close aria-label="페르소나 프로필 닫기">닫기 ×</button></header><p class="persona-prompt-card">${esc(persona.attributes.card_text)}</p>${options.error?`<p role="alert">${esc(options.error)}</p>`:''}<dl class="persona-public-traits">${Object.entries(persona.attributes.traits).map(([k,v])=>`<div><dt>${esc(({digital:'디지털 친숙도',novelty:'새 기능 친숙도',privacy:'개인정보 우려'} as Record<string,string>)[k]||k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><p class="persona-prompt-foot">테스트에 필요한 요약 정보입니다. 원본 데이터와 실행용 내부 프롬프트는 서버에서 관리합니다.</p></div></div>`;
  const portrait=options.portrait === undefined ? `<div class="persona-prompt-placeholder"><svg viewBox="0 0 80 100" aria-hidden="true"><circle cx="40" cy="30" r="17"/><path d="M10 92V78c0-20 14-30 30-30s30 10 30 30v14"/></svg><span>사진 미등록</span></div>` : `<div class="persona-prompt-face" role="img" aria-label="AI로 생성한 가상 인물 초상 예시" style="--position:${options.portrait*25}%"></div>`;
  return `<div class="persona-prompt-panel"><aside class="persona-prompt-profile">${portrait}<span class="persona-prompt-id">${esc(personaId(persona))}</span><h3>${p.age}세 ${esc(p.job_group)}</h3><p>${[p.sex,p.region].filter(Boolean).map(esc).join(' · ')}</p><small>${options.demo ? '공개 데모용 가상 인물 사진' : '이 테스트에 저장된 원본 카드'}</small></aside><div class="persona-prompt-content"><header><div><span>${options.demo ? '공개 데모 · 프롬프트 예시' : '원본 카드 · 실행 프롬프트'}</span><h2 tabindex="-1">이 사람의 시선은<br>이렇게 구성됩니다.</h2></div><button class="btn quiet sm" type="button" data-prompt-close aria-label="페르소나 프롬프트 닫기">닫기 ×</button></header><p class="persona-prompt-card">${esc(persona.attributes.card_text)}</p>${options.demo ? '' : `<details class="persona-prompt-traits"><summary>카드의 특성·원본값 보기</summary><pre>${esc(JSON.stringify(persona.attributes.traits,null,2))}</pre></details>`}${options.loading ? '<p class="persona-prompt-status" role="status">저장된 카드로 실행 프롬프트를 구성하고 있습니다.</p>' : options.error ? `<p class="persona-prompt-status" role="alert">${esc(options.error)}</p>` : `<label class="persona-prompt-label">${options.demo ? '페르소나 프롬프트' : `${esc(options.screen)} 첫 화면의 Act 프롬프트 미리보기`}<textarea class="persona-prompt-text" readonly rows="10" aria-label="페르소나 프롬프트">${esc(prompt)}</textarea></label><div class="persona-prompt-actions"><button class="btn solid sm" type="button" data-prompt-copy>프롬프트 복사 ↗</button><button class="btn sm" type="button" data-prompt-download>TXT 내려받기 ↓</button><span data-prompt-status role="status"></span></div>`}<p class="persona-prompt-foot">${options.demo ? '저장된 공개 프로필로 만든 예시입니다. 실제 패널 400명의 원본 카드와 구분합니다.' : '실행기와 같은 빌더로 구성한 첫 화면의 입력입니다. LLM 호출이나 외부 전송 없이 확인합니다.'}</p></div></div>`;
}
export function landingPersonaCard(persona: Persona, portrait: number, quote: string) {
  const p=persona.attributes.profile;
  const prompt=`당신은 ${p.age}세 ${p.job_group}입니다. 현재 화면의 문구와 버튼을 바탕으로 탐색하세요. 선택하거나 멈춘 이유를 화면에서 본 내용과 연결해 설명하세요.`;
  return `<article class="people-profile-popover"><button class="people-profile-close" type="button" data-prompt-close aria-label="페르소나 소개 닫기"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button><header><div class="persona-prompt-face people-profile-photo" role="img" aria-label="AI로 생성한 가상 인물 초상 예시" style="--position:${portrait*25}%"></div><div><span class="people-profile-id">${esc(personaId(persona))} / AI 페르소나</span><h2 tabindex="-1">${p.age}세 ${esc(p.job_group)}</h2><p>일정메이트의 가입 흐름을 살펴봤어요.</p></div></header><div class="people-profile-body"><section><span class="people-profile-label">페르소나 프롬프트</span><p class="people-profile-prompt">${esc(prompt)}</p></section>${quote ? `<section class="people-profile-record"><span class="people-profile-label">그 화면에서 남긴 말</span><blockquote>“${esc(quote)}”</blockquote></section>` : ''}</div><footer>공개 프로필로 구성한 프롬프트 예시</footer></article>`;
}

export async function copyPrompt(panel: HTMLElement) {
  const area=panel.querySelector<HTMLTextAreaElement>('.persona-prompt-text');
  const status=panel.querySelector<HTMLElement>('[data-prompt-status]');
  if(!area || !status) return;
  try { if(!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(area.value); status.textContent='복사했습니다.'; }
  catch { area.focus();area.select();status.textContent='텍스트를 선택했습니다. Ctrl+C로 복사하세요.'; }
}
export function downloadPrompt(panel: HTMLElement, id: string) {
  const text=panel.querySelector<HTMLTextAreaElement>('.persona-prompt-text')?.value;if(!text)return;
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');
  a.href=url;a.download=`PersonaLab-${id.replace(/[^a-zA-Z0-9_-]/g,'_')}-prompt.txt`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}