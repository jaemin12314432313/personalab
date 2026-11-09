import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('site coverage keeps structure checks separate from real persona visits and survives export',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
 try{
  const {siteCoverage,siteCoverageMarkup}=await server.ssrLoadModule('/src/mockup/SiteCoverage.ts');
  const {scopeMarkup}=await server.ssrLoadModule('/src/mockup/WorkflowView.ts');
  const {reportPayload,reportMarkdown}=await server.ssrLoadModule('/src/mockup/ReportExport.ts');
  const {printableReport}=await server.ssrLoadModule('/src/mockup/ReportPrint.ts');
  const study={id:'fixture',name:'fixture',product:{name:'fixture'},personas:[],screens:[],results:[],task:'전반 탐색',workflow:{source:{kind:'web',site_map:{pages:[{url:'https://example.com/',label:'Home',state:'loaded',issues:[]},{url:'https://example.com/detail',label:'Detail',state:'loaded',issues:[{code:'TITLE_MISSING',label:'제목 확인',count:1}]},{url:'https://example.com/missing',label:'Missing',state:'error',issues:[]},{url:'https://example.com/later',label:'Later',state:'pending',issues:[]}],edges:[],limit_reached:true,max_pages:20,excluded_count:1}},scope:{exploration:'site',goal_url:'',goal_text:'',priorities:[],focus:'',viewport:'desktop'}},evidence:[{persona_id:1,screen:{url:'https://example.com/#footer'}},{persona_id:1,screen:{url:'https://example.com/'}},{persona_id:2,screen:{url:'https://example.com/'}}]};
  const c=siteCoverage(study);assert.equal(c.checked,2);assert.equal(c.visited,1);assert.equal(c.unvisited,3);assert.equal(c.pages[0].visitors.length,2);
  const dom=new JSDOM(scopeMarkup(study));const d=dom.window.document;
  assert.equal(d.querySelector('[name=explorationMode]:checked').value,'site');assert.equal(d.getElementById('journeyScopeFields').hidden,true);dom.window.close();
  const markup=siteCoverageMarkup(study,true);assert.ok(markup.includes('페르소나 미방문'));assert.ok(markup.includes('구조 미확인'));assert.ok(markup.includes('제목 확인'));
  assert.equal(reportPayload(study).site_coverage.visited,1);assert.ok(reportMarkdown(study).includes('페르소나 미방문'));assert.ok(printableReport(study).includes('발견한 페이지와 확인 범위'));
 }finally{await server.close();}
});
