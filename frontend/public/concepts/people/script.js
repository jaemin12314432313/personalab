(() => {
  const records = [
    {id:'P938',age:32,reason:'복잡한 절차',quote:'바빠 죽겠는데 회원가입에 인증 절차가 너무 복잡해서 그냥 안 할래요.'},
    {id:'P069',age:29,reason:'개인정보 요구',quote:'회원가입하는데 왜 이렇게 개인정보를 많이 요구하는지 모르겠어서 그냥 그만둘래요.'},
    {id:'P392',age:27,reason:'개인정보 요구',quote:'개인정보를 너무 많이 입력하라고 해서 찝찝하니까 그만둘래.'},
    {id:'P563',age:34,reason:'개인정보 요구',quote:'아니 회원가입하는데 휴대폰 번호 인증까지 해야 되나, 개인정보 털릴 것 같아서 그냥 찜찜하네.'},
    {id:'P374',age:27,reason:'개인정보 요구',quote:'회원가입에 휴대폰 번호까지 요구하는 건 개인정보 측면에서 좀 찝찝하네.'},
  ];
  const cards = [...document.querySelectorAll('[data-person]')];
  const row = document.querySelector('.people-row');
  const stage = document.querySelector('.people-stage');
  const profile = document.querySelector('.profile');
  const quoteArea = document.querySelector('.quote-area');
  const motion = document.getElementById('motion-toggle');
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  function select(index) {
    const record = records[index];
    if (!record) return;
    cards.forEach((card,i) => {card.classList.toggle('is-active',i===index);card.setAttribute('aria-pressed',String(i===index));});
    document.querySelector('.profile-photo').style.setProperty('--position',`${index*25}%`);
    document.getElementById('profile-name').textContent=record.id;
    document.getElementById('profile-age').textContent=`${record.age}세 직장인`;
    document.getElementById('stop-reason').textContent=`${record.reason} · 중단`;
    document.getElementById('persona-quote').textContent=`“${record.quote}”`;
    document.getElementById('interview-persona').textContent=`${record.id} · ${record.age}세 직장인`;
    document.getElementById('interview-record').textContent=`“${record.quote}”`;
    document.querySelector('.interview-avatar').style.setProperty('--position',`${index*25}%`);
    profile.classList.remove('is-changing');quoteArea.classList.remove('is-changing');
    // 새로 선택한 기록만 짧게 나타내고, 결과나 숫자를 자동으로 만들어 바꾸지 않는다.
    void quoteArea.offsetWidth;
    profile.classList.add('is-changing');quoteArea.classList.add('is-changing');
  }
  cards.forEach((card,index) => card.addEventListener('click',()=>select(index)));
  const questions = [
    '이 화면에서 다음으로 넘어가지 않은 이유를 더 이야기해 줄 수 있나요?',
    '계속 진행하려면 이 화면에서 어떤 안내를 먼저 확인하고 싶었나요?',
    '이 지점에서 그만두는 대신 다른 행동을 한다면 무엇을 찾아봤을까요?',
  ];
  const questionButtons=[...document.querySelectorAll('[data-question]')];
  questionButtons.forEach((button,index)=>button.addEventListener('click',()=>{
    questionButtons.forEach((candidate,i)=>candidate.setAttribute('aria-pressed',String(i===index)));
    document.getElementById('interview-question').textContent=questions[index];
  }));
  motion.addEventListener('click',()=>{
    const paused=stage.classList.toggle('is-paused');
    motion.setAttribute('aria-pressed',String(paused));
    motion.setAttribute('aria-label',paused?'인물 카드 움직임 재생':'인물 카드 움직임 일시정지');
    motion.firstElementChild.textContent=paused?'▷':'Ⅱ';
  });
  function centerMobileCard() {
    if(window.innerWidth>700)return;
    const active=cards.find(card=>card.classList.contains('is-active'));
    row.scrollLeft=active.offsetLeft-(row.clientWidth-active.offsetWidth)/2;
  }
  window.addEventListener('load',centerMobileCard,{once:true});
  if(document.readyState==='complete')centerMobileCard();
  if(reduced?.matches)stage.classList.add('is-paused');
})();
