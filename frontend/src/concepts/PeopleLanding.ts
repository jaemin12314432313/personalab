import '../mockup/mockup.css';
import '../mockup/marketing.css';
import { LANDING_ANCHORS, mountMarketing, updateMarketingAuth } from '../mockup/Marketing';
import { mountPeopleHero } from '../mockup/PeopleHero';
import { currentUser } from '../api/studio';

export function mountPeopleLanding(root: HTMLElement) {
  root.innerHTML = '<section class="view marketing" id="v-landing" aria-label="PersonaLab 인물 랜딩"></section><section class="view" id="v-sample" aria-label="공개 AI 데모 결과"></section>';
  const disposeMarketing = mountMarketing(root);
  const disposePeople = mountPeopleHero(root);
  let disposed = false, authRequest = 0;
  async function refreshAuth() {
    const request = ++authRequest;
    let signedIn = false;
    try { const account = await currentUser(); signedIn = Number.isInteger(account.id) && Boolean(account.email); } catch { /* 공개 페이지는 로그인 없이 볼 수 있다. */ }
    if (!disposed && request === authRequest) updateMarketingAuth(root,signedIn,'/');
  }
  void refreshAuth();
  window.addEventListener('focus',refreshAuth);
  window.addEventListener('storage',refreshAuth);
  root.querySelectorAll<HTMLAnchorElement>('a[href="#register"],a[href="#login"],a[href="#demo"],a[href="#workspace"]').forEach(link=>{link.href=`/${link.getAttribute('href')}`;});
  const landing=root.querySelector<HTMLElement>('#v-landing')!;
  const sample=root.querySelector<HTMLElement>('#v-sample')!;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  function route() {
    const key=location.hash.slice(1)||'landing';
    landing.classList.toggle('on',key!=='sample'); sample.classList.toggle('on',key==='sample');
    if(LANDING_ANCHORS.includes(key)) landing.querySelector<HTMLElement>(`#${key}`)?.scrollIntoView({behavior:reduced?.matches?'auto':'smooth',block:'start'});
    else window.scrollTo(0,0);
  }
  window.addEventListener('hashchange',route); route();
  return ()=>{
    disposed=true; window.removeEventListener('focus',refreshAuth); window.removeEventListener('storage',refreshAuth);
    disposePeople(); disposeMarketing(); window.removeEventListener('hashchange',route);
  };
}
const root=document.querySelector<HTMLElement>('[data-people-concept]');
if(root) mountPeopleLanding(root);
