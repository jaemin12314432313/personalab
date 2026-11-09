import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('shared demo navigates from landing through report without backend requests',async()=>{
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/#landing',pretendToBeVisual:true});
  const originals=new Map(),calls=[];let dispose;
  const media={matches:true,addEventListener(){},removeEventListener(){}};
  for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,location:dom.window.location,history:dom.window.history,localStorage:dom.window.localStorage,MutationObserver:dom.window.MutationObserver,matchMedia:()=>media,CSS:{escape:s=>s},fetch:async(url)=>{calls.push(url);throw new Error('No backend in shared demo');}})){
    originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
  }
  dom.window.matchMedia=()=>media;dom.window.scrollTo=()=>{};dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
  const settle=()=>new Promise(r=>setTimeout(r,20));
  try{
    const {mountShareApp}=await server.ssrLoadModule('/src/share/ShareApp.ts');dispose=mountShareApp(dom.window.document.getElementById('root'));await settle();
    const d=dom.window.document;assert.ok(d.getElementById('v-landing').classList.contains('on'));assert.equal(d.querySelectorAll('.people-card').length,5);assert.equal(d.querySelector('[data-landing-entry]').getAttribute('href'),'#demo');assert.equal(d.querySelector('[data-landing-login]').hidden,true);
    assert.equal(d.querySelectorAll('a[href="#register"],a[href="#workspace"]').length,0);
    d.querySelector('[data-concept-person="P938"]').click();assert.equal(d.getElementById('landingPersonaPrompt').hidden,false);
    dom.window.location.hash='#sample';await settle();assert.ok(d.getElementById('v-sample').classList.contains('on'));d.querySelector('[data-report-dataset="mock"]').click();await settle();assert.ok(d.getElementById('sampleReport').textContent.includes('UI 목데이터'));
    d.querySelector('[data-rv-next]').click();await settle();assert.ok(d.getElementById('v-demo').classList.contains('on'));assert.equal(dom.window.location.hash,'#demo');
    const demo=d.getElementById('v-demo');demo.querySelector('[data-dm-step="1"]').click();demo.querySelector('[data-dm-step="2"]').click();demo.querySelector('[data-dm-step="3"]').click();demo.querySelector('[data-dm-finish]').click();await settle();
    demo.querySelector('[data-rv-tab="interview"]').click();demo.querySelector('[data-rv-question="0"]').click();await settle();assert.ok(demo.querySelector('.rv-messages').textContent.includes('기록에서 찾은 답변'));assert.equal(calls.length,0);
    assert.equal(d.querySelectorAll('a[href="#register"],a[href="#workspace"]').length,0);
  }finally{dispose?.();dom.window.close();await server.close();for(const[k,v]of originals){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
});