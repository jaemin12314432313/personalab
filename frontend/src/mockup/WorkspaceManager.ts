import type { ManagementAction } from '../api/studio';
import type { WorkspaceEntry } from './WorkspaceView';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
interface Options { entry:(key:string)=>WorkspaceEntry|undefined; session:()=>number; apply:(entry:WorkspaceEntry,action:ManagementAction,fields:{name?:string;confirmation?:string})=>Promise<void> }
export function mountWorkspaceManager(root:HTMLElement,options:Options){
  const dialog=root.querySelector<HTMLDialogElement>('#workspaceManageDialog')!;
  const toast=root.querySelector<HTMLElement>('#workspaceToast')!;
  let selected:WorkspaceEntry|undefined, action:ManagementAction='rename',pending=false,generation=0,focus:HTMLElement|null=null;
  const labels:Record<ManagementAction,string>={rename:'이름 변경',duplicate:'테스트 복제',archive:'테스트 보관',unarchive:'보관 해제',trash:'휴지통으로 이동',restore:'테스트 복원',delete:'영구 삭제'};
  function close(){if(pending)return;if(dialog.open&&typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');dialog.replaceChildren();selected=undefined;(focus?.isConnected?focus:root.querySelector<HTMLElement>('#workspaceSearch'))?.focus();}
  function open(entry:WorkspaceEntry,next:ManagementAction){
    if(pending)return;selected=entry;action=next;focus=document.activeElement as HTMLElement;
    root.querySelectorAll<HTMLDetailsElement>('.wm-menu[open]').forEach(d=>d.open=false);
    const description=next==='rename'?'목록과 작업공간에 표시되는 이름을 바꿉니다. 이전 실행 입력과 원문은 보존합니다.':next==='duplicate'?'현재 회차의 화면·설정·페르소나를 새 테스트에 복사합니다. 실행 결과와 인터뷰는 포함하지 않습니다.':next==='trash'?`이 테스트의 모든 ${entry.rounds||1}개 회차와 결과·인터뷰를 함께 옮깁니다. 휴지통에서 복원할 수 있어요.`:next==='delete'?`이 테스트의 모든 회차, 실행 결과, 캡처와 인터뷰를 영구 삭제합니다. 삭제 후 복원할 수 없습니다. 공용 페르소나 보관함은 유지됩니다.`:next==='archive'?'목록에서 잠시 정리합니다. 보관한 테스트에서 언제든 다시 열거나 보관을 해제할 수 있어요.':next==='restore'?'모든 회차와 기록을 내 테스트로 복원합니다.':'내 테스트 목록으로 다시 가져옵니다.';
    dialog.innerHTML=`<form id="workspaceManageForm"><span class="wm-eyebrow">TEST MANAGEMENT</span><h2 id="workspaceManageTitle">${labels[next]}</h2><p class="wm-target">${esc(entry.name)}</p><p id="workspaceManageDescription">${description}</p>${!entry.server?'<p class="wm-local-note">이 브라우저에 저장된 초안에 적용됩니다.</p>':''}${next==='rename'?`<label for="workspaceManageInput">새 이름</label><input class="input" id="workspaceManageInput" name="name" value="${esc(entry.name)}" maxlength="200" required autocomplete="off">`:next==='delete'?`<label for="workspaceManageInput">확인을 위해 아래 이름을 입력하세요.<strong>${esc(entry.name)}</strong></label><input class="input" id="workspaceManageInput" name="confirmation" maxlength="200" required autocomplete="off" placeholder="테스트 이름 입력">`:''}<p class="wm-error" id="workspaceManageError" role="alert" hidden></p><div class="wm-dialog-actions"><button class="btn" type="button" data-wm-close>취소</button><button class="btn ${next==='delete'?'wm-destructive':'solid'}" type="submit" id="workspaceManageSubmit">${labels[next]}</button></div></form>`;
    if(next==='restore'||next==='unarchive'){void submit(new Event('submit',{cancelable:true}));return;}
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    const input=dialog.querySelector<HTMLInputElement>('input');if(input){input.focus();if(next==='rename')input.select();}else dialog.querySelector<HTMLElement>('[data-wm-close]')?.focus();
  }
  async function submit(event:Event){
    event.preventDefault();if(!selected||pending)return;
    const entry=selected,op=action,owner=options.session(),request=++generation,value=dialog.querySelector<HTMLInputElement>('input')?.value.trim()||'';
    const error=dialog.querySelector<HTMLElement>('#workspaceManageError')!;
    if(op==='rename'&&!value){error.textContent='이름을 입력하세요.';error.hidden=false;return;}
    if(op==='delete'&&value!==entry.name){error.textContent='테스트 이름을 정확히 입력하세요.';error.hidden=false;return;}
    pending=true;error.hidden=true;dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);dialog.setAttribute('aria-busy','true');dialog.querySelector('#workspaceManageSubmit')!.textContent='처리 중…';
    try{
      await options.apply(entry,op,op==='rename'?{name:value}:op==='delete'?{confirmation:value}:{});
      if(request!==generation||owner!==options.session())return;
      pending=false;close();
      const undo=op==='trash'?'restore':op==='archive'?'unarchive':null;
      toast.innerHTML=`<span>${esc(op==='rename'?value:entry.name)} · ${labels[op]} 완료</span>${undo?`<button type="button" data-wm-action="${undo}" data-wm-key="${esc(entry.key)}">되돌리기</button>`:''}<button type="button" data-wm-dismiss aria-label="알림 닫기">×</button>`;toast.hidden=false;
    }catch(e){if(request!==generation||owner!==options.session())return;error.textContent=e instanceof Error?e.message:'요청을 처리하지 못했습니다.';error.hidden=false;if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}}
    finally{if(request===generation&&owner===options.session()){pending=false;dialog.removeAttribute('aria-busy');dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=false);const button=dialog.querySelector('#workspaceManageSubmit');if(button)button.textContent=labels[op];}}
  }
  function click(event:Event){const target=(event.target as HTMLElement).closest<HTMLElement>('button');if(target?.hasAttribute('data-wm-close'))close();if(target?.hasAttribute('data-wm-dismiss'))toast.hidden=true;
    if(target?.dataset.wmAction&&target.dataset.wmKey){const entry=options.entry(target.dataset.wmKey);if(entry)open(entry,target.dataset.wmAction as ManagementAction);}
    if(!(event.target as HTMLElement).closest('.wm-menu'))root.querySelectorAll<HTMLDetailsElement>('.wm-menu[open]').forEach(d=>d.open=false);
    if(event.target===dialog)close();
  }
  function keys(event:KeyboardEvent){if(event.key==='Escape'){root.querySelectorAll<HTMLDetailsElement>('.wm-menu[open]').forEach(d=>{d.open=false;d.querySelector<HTMLElement>('summary')?.focus();});}}
  function cancel(event:Event){event.preventDefault();close();}
  function reset(){generation++;pending=false;close();toast.hidden=true;toast.replaceChildren();}
  root.addEventListener('click',click);root.addEventListener('keydown',keys);dialog.addEventListener('submit',submit);dialog.addEventListener('cancel',cancel);
  return {reset,dispose(){reset();root.removeEventListener('click',click);root.removeEventListener('keydown',keys);dialog.removeEventListener('submit',submit);dialog.removeEventListener('cancel',cancel);}};
}
