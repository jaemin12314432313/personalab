import { validateScreens } from '../studio/model';
import type { Screen } from '../studio/model';
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function mountScreenEditor(host: HTMLElement, get: () => { screens: Screen[]; locked: boolean }, commit: (screens: Screen[]) => void, notify: (message: string, error?: boolean) => void) {
  let selected = '';
  function render() {
    const {screens, locked} = get(); if (!screens.some(s => s.id === selected)) selected = screens[0]?.id || '';
    const screen = screens.find(s => s.id === selected);
    host.innerHTML = `<h2 style="margin:0 0 18px;font-size:20px">화면 편집</h2><div class="screen-editor-grid"><div class="screen-editor-list">${screens.map(s => `<button class="btn sm" type="button" data-edit-screen="${esc(s.id)}" aria-pressed="${s.id === selected}">${esc(s.id)} · ${esc(s.label)}${s.id === screens[0]?.id ? ' (시작)' : ''}</button>`).join('')}<button class="btn sm" type="button" data-editor-action="add" ${locked ? 'disabled' : ''}>+ 화면 추가</button></div><div>${screen ? `<div class="screen-editor-fields"><span class="hint">${esc(screen.id)}${locked ? ' · 실행 이력이 있어 편집할 수 없습니다.' : ' · 변경 후 화면 저장을 눌러주세요.'}</span><label class="label">화면 이름<input id="editScreenLabel" class="input" maxlength="120" value="${esc(screen.label)}" ${locked ? 'disabled' : ''}></label><label class="label">화면에서 보이는 내용<textarea id="editScreenDescription" class="textarea" rows="3" maxlength="6000" ${locked ? 'disabled' : ''}>${esc(screen.description)}</textarea></label><div class="screen-image-editor">${screen.image?`<img src="${esc(screen.image)}" alt="${esc(screen.label)} 등록 시안"><button class="btn quiet sm" type="button" data-editor-action="remove-image" ${locked?'disabled':''}>이미지 제거</button>`:''}<label class="label">${screen.image?'시안 교체':'화면 이미지 추가'}<input type="file" id="editScreenImage" accept="image/png,image/jpeg,image/webp" ${locked?'disabled':''}></label><p class="hint">PNG · JPG · WebP, 1MB 이하. 버튼 이름과 이동할 화면은 아래에서 연결하세요.</p></div><span class="label">버튼 이름과 이동할 화면</span><div id="editScreenLinks">${screen.elements.map(e => linkRow(e.text,e.to,screens,locked)).join('')}</div><div class="screen-editor-actions"><button class="btn sm" type="button" data-editor-action="link" ${locked ? 'disabled' : ''}>+ 버튼 추가</button><button class="btn sm" type="button" data-editor-action="start" ${locked || screen.id === screens[0]?.id ? 'disabled' : ''}>시작 화면으로</button><button class="btn quiet sm" type="button" data-editor-action="delete" ${locked || screens.length < 2 ? 'disabled' : ''}>화면 삭제</button><button class="btn solid sm" type="button" data-editor-action="save" ${locked ? 'disabled' : ''}>화면 저장</button></div></div>` : '<p class="hint">화면을 추가해 주세요.</p>'}</div></div>`;
  }
  function linkRow(text: string, to: string | null, screens: Screen[], locked: boolean) {
    return `<div class="screen-link-editor" style="margin-bottom:10px"><input class="input" data-edit-link-text aria-label="버튼 이름" maxlength="200" value="${esc(text)}" ${locked ? 'disabled' : ''}><select class="select" data-edit-link-to aria-label="이동할 화면" ${locked ? 'disabled' : ''}><option value="">현재 화면 유지</option>${screens.map(s => `<option value="${esc(s.id)}" ${s.id === to ? 'selected' : ''}>${esc(s.id)} ${esc(s.label)}</option>`).join('')}</select><button type="button" class="btn quiet sm" data-editor-action="remove-link" aria-label="버튼 삭제" ${locked ? 'disabled' : ''}>×</button></div>`;
  }
  function draft() {
    const screens = structuredClone(get().screens), screen = screens.find(s => s.id === selected);
    if (!screen) throw new Error('편집할 화면이 없습니다.');
    screen.label = host.querySelector<HTMLInputElement>('#editScreenLabel')!.value.trim();
    screen.description = host.querySelector<HTMLTextAreaElement>('#editScreenDescription')!.value.trim();
    screen.elements = [...host.querySelectorAll<HTMLElement>('.screen-link-editor')].map(row => ({text:row.querySelector<HTMLInputElement>('[data-edit-link-text]')!.value.trim(),to:row.querySelector<HTMLSelectElement>('[data-edit-link-to]')!.value || null}));
    validateScreens(screens); return screens;
  }
  const click = (event: MouseEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
    if (button.dataset.editScreen) { selected = button.dataset.editScreen; render(); return; }
    const action = button.dataset.editorAction; if (!action || get().locked) return;
    event.stopPropagation();
    try {
      if (action === 'link') { host.querySelector('#editScreenLinks')!.insertAdjacentHTML('beforeend',linkRow('',null,get().screens,false)); host.querySelector<HTMLInputElement>('.screen-link-editor:last-child input')?.focus(); return; }
      if (action === 'remove-link') { button.closest('.screen-link-editor')!.remove(); return; }
      let screens = get().screens.length ? draft() : [];
      if (action === 'add') { let n=1; while(screens.some(s => s.id === `S${String(n).padStart(2,'0')}`)) n++; selected = `S${String(n).padStart(2,'0')}`; screens.push({id:selected,label:'새 화면',description:'',elements:[]}); }
      if (action === 'delete') { if (screens.length < 2) return; screens = screens.filter(s => s.id !== selected).map(s => ({...s,elements:s.elements.map(e => ({...e,to:e.to === selected ? null : e.to}))})); selected = screens[0].id; }
      if (action === 'remove-image'){const current=screens.find(s=>s.id===selected);if(current)delete current.image;}
      if (action === 'start') screens = [...screens.filter(s => s.id === selected),...screens.filter(s => s.id !== selected)];
      commit(screens); render(); notify(action === 'delete' ? '화면을 삭제했습니다. 삭제된 화면을 향하던 버튼은 현재 화면 유지로 바꿨습니다.' : '화면과 버튼 연결을 저장했습니다.');
    } catch(error) { notify(error instanceof Error ? error.message : '입력값을 확인해 주세요.',true); }
  };
  const imageChange=async(event:Event)=>{
    const input=event.target as HTMLInputElement;if(input.id!=='editScreenImage'||get().locked)return;
    const file=input.files?.[0];if(!file)return;const origin=get().screens,id=selected;
    try{
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1024*1024)throw new Error('PNG/JPG/WebP 이미지를 1MB 이하로 올려주세요.');
      const image=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('이미지를 읽지 못했습니다.'));reader.readAsDataURL(file);});
      if(get().screens!==origin||get().locked||selected!==id)return;
      const screens=draft(),screen=screens.find(s=>s.id===id)!;screen.image=image;
      if(screens.reduce((sum,s)=>sum+(s.image?.length||0),0)>5600000)throw new Error('전체 화면 이미지는 4MB 이하로 등록하세요.');
      commit(screens);render();notify('화면 이미지를 저장했어요. 버튼과 이동 연결을 확인하세요.');
    }catch(error){notify(error instanceof Error?error.message:'이미지를 등록하지 못했어요.',true);}
  };
  host.addEventListener('change',imageChange);
  host.addEventListener('click',click);
  return { render, dispose:()=>{host.removeEventListener('click',click);host.removeEventListener('change',imageChange);} };
}