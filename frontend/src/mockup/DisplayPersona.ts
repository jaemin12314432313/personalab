import {regionName} from './RegionNames';
import type {Persona,Study} from '../studio/model';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function displayAttributes(a:Persona['attributes']):Persona['attributes']{
 const profile=Object.fromEntries(Object.entries(a.profile||{}).filter(([k])=>['age','sex','region','job_group'].includes(k))) as Persona['attributes']['profile'];
 if(profile.region)profile.region=regionName(profile.region);
 const grade=(v:unknown)=>typeof v==='number'?(v>=4?'높음':v>=2?'중간':'낮음'):['높음','중간','낮음'].includes(String(v))?String(v):'미등록';
 const traits={digital:grade(a.traits?.digital),novelty:grade(a.traits?.novelty),privacy:grade(a.traits?.privacy)};
 const source=Object.fromEntries(Object.entries(a.source||{}).filter(([k])=>['persona_id','library_entry_id','library_panel_id','stub'].includes(k))) as Persona['attributes']['source'];
 return {profile,traits,source,card_text:`${profile.age}세 · ${profile.job_group||'사용자'} · ${profile.region||'지역 미등록'}. 디지털 친숙도 ${traits.digital}, 새로운 기능 친숙도 ${traits.novelty}, 개인정보 우려 ${traits.privacy}.`};
}
export function browserSnapshot(value:Study):Study{
 const copy=structuredClone(value);delete copy.execution;copy.personas=copy.personas.map(p=>({...p,attributes:{...displayAttributes(p.attributes),source:{...displayAttributes(p.attributes).source,persona_id:`P${String(p.id).padStart(4,'0')}`}}}));
 if(copy.serverId){
  if(copy.workflow){delete copy.workflow.source.preview;for(const s of copy.workflow.source.preflight?.states||[])s.image=null;for(const p of copy.workflow.source.site_map?.pages||[])delete p.image;}
  for(const s of copy.screens)if(s.image?.startsWith('data:'))delete s.image;
  for(const e of copy.evidence||[])if(e.image.startsWith('data:'))e.image='';
 }
 return copy;
}
export function portraitPath(a:Persona['attributes']){
 const sex=a.profile.sex;if(!['남','여','남성','여성'].includes(sex||''))return '';
 const age=a.profile.age,band=age<28?'young':age<42?'adult':age<58?'mature':'senior';
 return `/personas/portraits/${band}-${sex?.startsWith('여')?'female':'male'}.png`;
}
export function portraitMarkup(a:Persona['attributes'],className='ab-portrait'){
 const src=portraitPath(a);return src?`<img class="${className}" src="${src}" alt="연령대·성별에 맞춘 AI 대표 이미지 · 실제 조사 응답자의 사진이 아닙니다" loading="lazy">`:`<span class="${className} persona-no-photo" aria-label="대표 이미지 없음">AI</span>`;
}
