import { DEMO } from '../studio/model';
import { landingPersonaCard } from './PersonaPrompt';
import '../concepts/people-landing.css';

const positions = [
  { turn:-7, lift:32 }, { turn:-3.5, lift:8 }, { turn:0, lift:-8 },
  { turn:3.5, lift:8 }, { turn:7, lift:32 },
];

// 선택한 인물 랜딩을 메인과 보관한 시안에서 함께 사용한다.
export function mountPeopleHero(root: HTMLElement) {
  const landing = root.querySelector<HTMLElement>('#v-landing')!;
  landing.classList.add('people-variant');
  const hero = landing.querySelector<HTMLElement>('.lp-centered-hero')!;
  hero.insertAdjacentHTML('beforeend', `<div class="people-strip"><svg class="people-connection" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true"><path d="M-90 230 C140 280 160 70 370 125 S670 300 830 170 S1080 30 1290 130"/><path d="M-80 253 C140 300 160 93 370 148 S670 323 830 193 S1080 53 1290 153"/></svg><div class="people-portraits" role="group" aria-label="탐색 기록을 살펴볼 AI 페르소나">${DEMO.personas.map((p,i) => {
    const id = DEMO.results.find(r => r.id === p.id)!.persona_id;
    return `<button class="people-card" type="button" data-concept-person="${id}" aria-pressed="false" aria-expanded="false" aria-controls="landingPersonaPrompt" style="--turn:${positions[i].turn}deg;--lift:${positions[i].lift}px;--position:${i*25}%;--delay:${i*100}ms"><span class="people-card-float"><span class="people-photo" role="img" aria-label="AI로 생성한 가상 인물 초상"></span><span class="people-card-info"><strong>${p.attributes.profile.age}세 직장인</strong><span>${id}<i aria-hidden="true">↗</i></span></span></span></button>`;
  }).join('')}</div><div class="people-strip-caption"><span>서로 다른 시선, 서로 다른 선택.</span><span>AI 페르소나 예시 <button type="button" id="people-motion" aria-label="인물 카드 움직임 일시정지" aria-pressed="false"><span aria-hidden="true">Ⅱ</span></button></span></div></div>`);

  landing.querySelector('.people-strip')!.insertAdjacentHTML('beforeend','<section id="landingPersonaPrompt" class="persona-prompt-detail people-prompt-popover" role="dialog" aria-label="선택한 페르소나 프롬프트" hidden></section>');
  const promptDetail=landing.querySelector<HTMLElement>('#landingPersonaPrompt')!;
  let promptId='';
  function showPrompt(id:string, focus=true) {
    const index=DEMO.personas.findIndex(p=>p.attributes.source.persona_id===id); if(index<0)return;
    const persona=DEMO.personas[index]; promptId=id;
    promptDetail.hidden=false;
    const quote=DEMO.results.find(r=>r.id===persona.id)?.act?.events.find(e=>e.action==='abandon')?.reason || '';
    promptDetail.innerHTML=landingPersonaCard(persona,index,quote);
    landing.querySelectorAll<HTMLElement>('[data-concept-person]').forEach(card=>card.setAttribute('aria-expanded',String(card.dataset.conceptPerson===id)));
    placePrompt();
    if(focus)promptDetail.querySelector<HTMLElement>('h2')?.focus({preventScroll:true});
  }

  // 기존 FAQ의 문구와 details/+ 동작을 그대로 두고 넓은 한 열로 배치한다.
  const faq = landing.querySelector<HTMLElement>('#faq')!;
  faq.classList.add('people-wide-faq');
  faq.insertAdjacentHTML('afterbegin','<div class="people-faq-heading"><span class="lp-eyebrow">자주 묻는 질문</span><h2>궁금한 점을 먼저 살펴보세요.</h2></div>');
  faq.append(faq.querySelector<HTMLElement>('.lp-start-copy')!);

  const strip = landing.querySelector<HTMLElement>('.people-strip')!;
  const row = landing.querySelector<HTMLElement>('.people-portraits')!;
  const cards = [...landing.querySelectorAll<HTMLButtonElement>('[data-concept-person]')];
  const motion = landing.querySelector<HTMLButtonElement>('#people-motion')!;
  function placePrompt() {
    if(promptDetail.hidden)return;
    const card=cards.find(card=>card.dataset.conceptPerson===promptId);if(!card)return;
    const bounds=strip.getBoundingClientRect(),anchor=card.getBoundingClientRect();
    const available=bounds.width||window.innerWidth;
    const width=promptDetail.getBoundingClientRect().width||Math.min(360,available-24);
    const left=Math.max(12,Math.min(anchor.left-bounds.left+anchor.width/2-width/2,available-width-12));
    promptDetail.style.left=`${left}px`;
  }
  function closePrompt(focus=false) {
    promptDetail.hidden=true;cards.forEach(card=>card.setAttribute('aria-expanded','false'));
    if(focus)cards.find(card=>card.dataset.conceptPerson===promptId)?.focus({preventScroll:true});
  }
  function outside(event:PointerEvent) {
    const target=event.target as Node;
    if(!promptDetail.hidden&&!promptDetail.contains(target)&&!cards.some(card=>card.contains(target)))closePrompt();
  }
  function keydown(event:KeyboardEvent) {
    if(event.key==='Escape'&&!promptDetail.hidden){event.preventDefault();closePrompt(true);}
  }

  function selectPhoto(id: string) {
    cards.forEach(card => {
      const selected = card.dataset.conceptPerson === id;
      card.classList.toggle('is-active',selected);
      card.setAttribute('aria-pressed',String(selected));
    });
  }
  function click(event: MouseEvent) {
    const target = (event.target as Element).closest<HTMLElement>('[data-concept-person],[data-landing-record],#people-motion,[data-prompt-close]');
    if (!target || !landing.contains(target)) return;
    if(target.hasAttribute('data-prompt-close')){closePrompt(true);return;}
    if (target.dataset.conceptPerson) {
      if(!promptDetail.hidden&&promptId===target.dataset.conceptPerson){closePrompt(true);return;}
      selectPhoto(target.dataset.conceptPerson);
      landing.querySelector<HTMLButtonElement>(`[data-landing-record="${target.dataset.conceptPerson}"]`)?.click();
      showPrompt(target.dataset.conceptPerson);
    } else if (target.dataset.landingRecord) {selectPhoto(target.dataset.landingRecord);if(!promptDetail.hidden)showPrompt(target.dataset.landingRecord,false);}
    else {
      const paused = strip.classList.toggle('is-paused');
      motion.setAttribute('aria-pressed',String(paused));
      motion.setAttribute('aria-label',paused?'인물 카드 움직임 재생':'인물 카드 움직임 일시정지');
      motion.firstElementChild!.textContent=paused?'▷':'Ⅱ';
    }
  }
  function centerMobileCard() {
    if (window.innerWidth > 700) return;
    const active = cards.find(card => card.classList.contains('is-active'))!;
    row.scrollLeft = active.offsetLeft - (row.clientWidth-active.offsetWidth)/2;
  }
  root.addEventListener('click',click);
  document.addEventListener('pointerdown',outside);
  document.addEventListener('keydown',keydown);
  window.addEventListener('resize',placePrompt);
  row.addEventListener('scroll',placePrompt,{passive:true});
  window.addEventListener('load',centerMobileCard,{once:true});
  landing.querySelector<HTMLButtonElement>('[data-landing-record="P392"]')!.click();
  if (document.readyState === 'complete') centerMobileCard();
  return () => {
    root.removeEventListener('click',click);
    document.removeEventListener('pointerdown',outside);
    document.removeEventListener('keydown',keydown);
    window.removeEventListener('resize',placePrompt);
    row.removeEventListener('scroll',placePrompt);
    window.removeEventListener('load',centerMobileCard);
  };
}
