import { LANDING_ANCHORS, mountMarketing } from '../mockup/Marketing';
import { mountPeopleHero } from '../mockup/PeopleHero';
import { mountDemo } from '../mockup/DemoExperience';
import '../mockup/mockup.css';
import '../mockup/marketing.css';
import './share.css';

// 공유판은 공개 데이터와 브라우저 내 데모만 사용한다. 인증/API 클라이언트를 로드하지 않는다.
export function mountShareApp(root:HTMLElement) {
  root.innerHTML='<section class="view marketing" id="v-landing" aria-label="PersonaLab 소개"></section><section class="view" id="v-sample" aria-label="공개 샘플 결과"></section><section class="view" id="v-demo" aria-label="공개 데모 체험"></section>';
  const marketing=mountMarketing(root),people=mountPeopleHero(root),demo=mountDemo(root.querySelector<HTMLElement>('#v-demo')!);
  const privateRoutes=new Set(['login','register','workspace','product','proto','panel','run','report']);
  let previous='';
  function links() {
    root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(a=>{
      const hash=a.getAttribute('href')||'';
      if(a.hasAttribute('data-landing-login')){a.hidden=true;a.style.display='none';return;}
      if(a.hasAttribute('data-landing-entry')){a.href='#demo';if(a.textContent!=='데모 체험하기 →')a.textContent='데모 체험하기 →';return;}
      if(hash==='#workspace') {a.href='#sample';a.textContent='샘플 결과 보기 →';return;}
      if(privateRoutes.has(hash.slice(1))){a.href='#demo';a.textContent='데모 체험하기 →';}
    });
    root.querySelectorAll<HTMLButtonElement>('[data-rv-next]').forEach(b=>{if(b.textContent!=='전체 데모 체험하기 →')b.textContent='전체 데모 체험하기 →';});
    root.querySelectorAll<HTMLElement>('.dm-run-roster .dm-method p').forEach(p=>{const text='저장된 기록을 재생하는 체험입니다. 새 AI 호출이나 토큰 사용은 발생하지 않습니다.';if(p.textContent!==text)p.textContent=text;});
  }
  function route() {
    let key=location.hash.slice(1)||'landing';
    if(privateRoutes.has(key)){history.replaceState(null,'','#demo');key='demo';}
    const anchor=LANDING_ANCHORS.includes(key),view=anchor?'landing':['landing','sample','demo'].includes(key)?key:'landing';
    root.querySelectorAll<HTMLElement>('.view').forEach(v=>v.classList.toggle('on',v.id===`v-${view}`));
    document.title=view==='landing'?'PersonaLab — 화면은 같아도, 경험은 다르니까':view==='sample'?'PersonaLab — 샘플 결과':'PersonaLab — 데모 체험';
    if(anchor)root.querySelector<HTMLElement>(`#${CSS.escape(key)}`)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    else if(previous!==view)window.scrollTo(0,0);
    previous=view;links();
  }
  const observer=new MutationObserver(()=>links());observer.observe(root,{childList:true,subtree:true});
  window.addEventListener('hashchange',route);links();route();
  return ()=>{observer.disconnect();window.removeEventListener('hashchange',route);demo();people();marketing();root.innerHTML='';};
}