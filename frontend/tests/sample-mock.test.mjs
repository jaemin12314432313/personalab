import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';

async function load(callback){
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  try{
    const mock=await server.ssrLoadModule('/src/mockup/SampleMock.ts');
    const fixture=await server.ssrLoadModule('/src/mockup/ReportFixture.ts');
    const model=await server.ssrLoadModule('/src/mockup/ReportModel.ts');
    await callback({mock,fixture:fixture.mockReportStudy,model});
  }finally{await server.close();}
}
const limitOnly=(r)=>r.act?{...r,act:{...r.act,end:{result:'drop',screen:r.act.path.at(-1)||null,drop_reason:'MAX_TURNS'}}}:r;
const sampleStudy=(fixture)=>{
  const s=fixture();s.product.name='모아북 (샘플)';
  const labels=['읽은 책을 모아 두는 곳','책 둘러보기 — 모아북','느리게 읽는 하루 — 모아북','요금 안내 — 모아북','시작하기 — 모아북','환영해요 — 모아북'];
  s.screens=labels.map((label,i)=>({id:`S0${i+1}`,label,description:'',elements:[]}));
  s.results=s.results.map(limitOnly);
  return s;
};

test('sample site runs that ended only by limit get labeled example drops and goals',()=>load(({mock,fixture,model})=>{
  const s=sampleStudy(fixture),before=s.results.filter(r=>r.act).length;
  assert.ok(before>=3);
  const {results,mocked}=mock.withSampleMock(s,s.results);
  assert.equal(mocked,true);
  const outcomes=results.filter(r=>r.act).map(r=>model.outcome(r));
  assert.ok(outcomes.includes('drop'));assert.ok(outcomes.includes('complete'));
  assert.ok(results.filter(r=>r.act&&model.outcome(r)==='drop').every(r=>r.act.events.at(-1).reason&&r.act.end.drop_reason));
  assert.equal(results.filter(r=>!r.act).length,s.results.filter(r=>!r.act).length);
}));

test('other products and runs that already have real drops are never replaced',()=>load(({mock,fixture,model})=>{
  const other=sampleStudy(fixture);other.product.name='일정메이트';
  assert.equal(mock.withSampleMock(other,other.results).mocked,false);
  const real=sampleStudy(fixture);
  const first=real.results.find(r=>r.act);first.act={...first.act,end:{result:'drop',screen:first.act.path.at(-1)||null,drop_reason:'PRIVACY'}};
  assert.equal(model.outcome(first),'drop');
  const out=mock.withSampleMock(real,real.results);
  assert.equal(out.mocked,false);assert.equal(out.results,real.results);
}));
