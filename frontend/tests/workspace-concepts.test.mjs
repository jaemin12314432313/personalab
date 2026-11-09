import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

async function environment(variant,callback){
  const dom=new JSDOM('<main id="root"></main>',{url:`http://localhost/concepts/workspaces-v2/workspace.html?view=${variant}`,pretendToBeVisual:true});
  const originals=new Map(),calls=[];let dispose;
  for(const[k,v]of Object.entries({document:dom.window.document,window:dom.window,location:dom.window.location,fetch:async(url)=>{calls.push(url);throw new Error('No API in design concepts');}})){originals.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});}
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7','PRIVATE');
  try{
    const {mountWorkspaceConcept}=await import(pathToFileURL(resolve('public/concepts/workspaces-v2/workspace.js')).href+'?variant='+variant);
    const root=dom.window.document.getElementById('root');dispose=mountWorkspaceConcept(root);await callback({dom,root,calls});assert.equal(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7'),'PRIVATE');assert.equal(calls.length,0);
  }finally{dispose?.();dom.window.close();for(const[k,v]of originals){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
}
for(const variant of ['studio','focus','people'])test(`${variant}: search, filtering, empty state, adding and details work independently`,async()=>environment(variant,async({dom,root})=>{
  const count=()=>root.querySelectorAll(variant==='focus'?'.test-row':'.test-card').length;
  assert.equal(count(),4);
  root.querySelector('[data-filter="done"]').click();assert.equal(count(),1);assert.ok(root.querySelector('.test-collection').textContent.includes('일정메이트'));
  root.querySelector('[data-filter="all"]').click();const input=root.querySelector('#test-search');input.focus();input.value='모먼트';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(count(),1);assert.equal(dom.window.document.activeElement.id,'test-search');
  if(variant==='focus')assert.ok(root.querySelector('.selection-peek').textContent.includes('모먼트'));
  input.value='';root.querySelector('#test-search').value='';root.querySelector('#test-search').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  root.querySelector('[data-detail="mate"]').click();assert.equal(root.querySelector('#concept-dialog').open,true);root.querySelector('[data-detail-tab="records"]').click();assert.equal(root.querySelectorAll('.record-quotes article').length,5);root.querySelector('[data-close]').click();
  root.querySelector('[data-state="empty"]').click();assert.ok(root.querySelector('.empty-state'));assert.equal(count(),0);
  root.querySelector('.empty-state [data-create]').click();root.querySelector('#new-name').value='<img src=x onerror=alert(1)> 새 테스트';root.querySelector('#new-flow').value='가입';root.querySelector('#new-test-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(count(),1);assert.equal(root.querySelectorAll('img').length,0);assert.ok(root.textContent.includes('<img src=x onerror=alert(1)> 새 테스트'));
  root.querySelector('[data-state="empty"]').click();root.querySelector('[data-load-examples]').click();assert.equal(count(),4);
  root.querySelector('[data-page="personas"]').click();assert.equal(root.querySelectorAll('.persona-cards>button').length,5);root.querySelector('[data-person-modal="P938"]').click();assert.ok(root.querySelector('.modal-answer').textContent.includes('인증 절차가 너무 복잡'));root.querySelector('[data-close]').click();
  root.querySelector('[data-references]').click();assert.equal(root.querySelectorAll('.reference-list>a').length,7);root.querySelector('[data-close]').click();
  if(variant==='people'){root.querySelector('[data-page="tests"]').click();root.querySelector('[data-select="mate"]').click();root.querySelector('[data-person="P069"]').click();assert.ok(root.querySelector('.person-intro').textContent.includes('29세'));assert.ok(root.querySelector('.person-quote').textContent.includes('왜 이렇게 개인정보를 많이'));}
}));