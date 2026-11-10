import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';

async function withReport(callback){
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  const dom=new JSDOM('<main id="a"></main><main id="b"></main>',{url:'http://localhost/#sample',pretendToBeVisual:true});
  const originals=new Map();
  for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,CSS:{escape:s=>s}})){originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
  let views=[];
  try {
    const {mockReportStudy}=await server.ssrLoadModule('/src/mockup/ReportFixture.ts');
    const {mountReport}=await server.ssrLoadModule('/src/mockup/ReportView.ts');
    const model=await server.ssrLoadModule('/src/mockup/ReportModel.ts');
    const journey=await server.ssrLoadModule("/src/mockup/ReportJourney.ts");
    const {DEMO}=await server.ssrLoadModule('/src/studio/model.ts');
    await callback({dom,journey,fixture:mockReportStudy,model,DEMO,mount:(id,study,options)=>{const view=mountReport(dom.window.document.getElementById(id),study,options);views.push(view);return view;}});
  } finally {views.forEach(v=>v.dispose());dom.window.close();await server.close();for(const[k,v]of originals){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
}
test('journey charts draw one ribbon per person, a full heatmap grid and three screen tiers',async()=>withReport(async({fixture,model,journey})=>{
  const s=fixture(),a=model.analyzeReport(s),j=journey.journeyMarkup(s,a);
  // 흐름도: 기록이 있는 사람마다 리본이 있고, 끝 표식(✓ ✕ …)이 있다
  assert.ok(j.flow.includes('class="rc-flow"')&&j.flow.includes('사람별 화면 흐름'));
  const ribbons=(j.flow.match(/<path /g)||[]).length;
  assert.ok(ribbons>=a.records.length,`리본 ${ribbons}개`);
  assert.ok(j.flow.includes('✓')&&j.flow.includes('✕'));
  // 히트맵: 사람 수 × 화면 수만큼 칸이 있고, 안 간 화면은 방문 없음으로 표시된다
  const rows=(j.heatmap.match(/class="rc-hm-row"/g)||[]).length,cols=Number(/--cols:(\d+)/.exec(j.heatmap)[1]);
  assert.equal(rows,a.records.length);
  assert.equal((j.heatmap.match(/class="rc-hm-cell /g)||[]).length,rows*cols);
  assert.ok(j.heatmap.includes('is-none'));
  // 화면 분류: 세 칸이고, 점수는 만들지 않는다
  assert.equal((j.tiers.match(/class="rc-tier /g)||[]).length,3);
  assert.ok(j.tiers.includes('점수가 아니라'));
  // 같은 사람은 어느 차트에서나 같은 ID로 나온다
  const id=journey.pidOf(s,a.records[0]);
  assert.ok(j.heatmap.includes(id)&&j.flow.includes(id));
}));
test('one person alone gets no flow diagram and never throws',async()=>withReport(async({fixture,model,journey})=>{
  const s=fixture();s.results=s.results.map((r,i)=>i===0?r:({...r,act:null}));
  const a=model.analyzeReport(s),j=journey.journeyMarkup(s,a);
  assert.equal(j.flow,'');                 // 두 명 미만이면 흐름도를 그리지 않는다
  assert.ok(j.heatmap.includes('rc-hm-row'));
}));
test('a decision on a finding is saved, shown in the list, and restored on the next mount',async()=>withReport(async({fixture,mount,dom})=>{
  const doc=dom.window.document,study=fixture();
  mount('a',study,{compact:true});
  const btn=doc.querySelector('#a [data-rv-decide="수정 예정"]');
  assert.ok(btn,'결정 버튼이 있어야 한다');
  assert.equal(btn.getAttribute('aria-checked'),'false');
  btn.click();
  assert.equal(doc.querySelector('#a [data-rv-decide="수정 예정"]').getAttribute('aria-checked'),'true');
  assert.ok(doc.querySelector('#a .rp-row .rp-dec')?.textContent.includes('수정 예정'));
  mount('b',study,{compact:true});         // 새로 열어도 남아 있다
  assert.equal(doc.querySelector('#b [data-rv-decide="수정 예정"]').getAttribute('aria-checked'),'true');
  doc.querySelector('#b [data-rv-decide="검토 전"]').click();   // 되돌리면 표시가 사라진다
  assert.equal(doc.querySelector('#b .rp-row .rp-dec'),null);
}));
