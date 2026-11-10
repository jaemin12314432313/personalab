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
    const charts=await server.ssrLoadModule("/src/mockup/ReportCharts.ts");
    const {DEMO}=await server.ssrLoadModule('/src/studio/model.ts');
    await callback({dom,charts,fixture:mockReportStudy,model,DEMO,mount:(id,study,options)=>{const view=mountReport(dom.window.document.getElementById(id),study,options);views.push(view);return view;}});
  } finally {views.forEach(v=>v.dispose());dom.window.close();await server.close();for(const[k,v]of originals){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
}
test('charts count records without percentages and flag small persona groups',async()=>withReport(async({fixture,model,charts})=>{
  const s=fixture(),a=model.analyzeReport(s),html=charts.chartsMarkup(s,a);
  assert.ok(html.includes('지표와 분포'));
  assert.ok(!/\d\s*%/.test(html.replace(/style="[^"]*"/g,'')),'비율(%)을 쓰면 안 된다');           // 폭 계산용 style은 제외
  assert.ok(html.includes('중간에 멈췄어요')&&html.includes('행동 수 중앙값')&&html.includes('멈춘 이유'));
  // 직업군은 대학생 4명 / 대학원생 2명으로 나뉘고 둘 다 표본 부족
  assert.ok(html.includes('페르소나 속성별 결과')&&html.includes('대학생')&&html.includes('대학원생'));
  assert.equal((html.match(/표본 부족/g)||[]).length>=2,true);
  // 연령은 모두 20대라 비교하지 않고 이유를 알려 준다
  assert.ok(html.includes('모두 같은 값이라 나누지 않은 속성')&&html.includes('연령대(20대)'));
  // 횟수 한도는 문제가 아니라 별도 칸이고, 끝까지 간 화면 수치가 표에 있다
  assert.ok(html.includes('횟수까지 살펴봄')&&html.includes('표로 보기'));
}));
test('charts stay empty without records and never fabricate groups',async()=>withReport(async({fixture,model,charts})=>{
  const s=fixture();s.results=s.results.map(r=>({...r,act:null}));
  assert.equal(charts.chartsMarkup(s,model.analyzeReport(s)),'');
}));
test('report overview mounts the chart section',async()=>withReport(async({fixture,mount,dom})=>{
  mount('a',fixture(),{compact:true});
  assert.ok(dom.window.document.querySelector('#a .rc-wrap'),'개요에 지표 영역이 있어야 한다');
  assert.ok(dom.window.document.querySelectorAll('#a .rc-row').length>=6);
}));
