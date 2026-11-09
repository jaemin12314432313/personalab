import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';

test('demo restore validates selected records and rebuilds saved answers from source evidence',async()=>{
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  try {
    const {restoreDemo,interviewAnswer}=await server.ssrLoadModule('/src/mockup/DemoData.ts');
    const restored=restoreDemo(JSON.stringify({step:99,selected:[2,2,999],person:999,complete:true,chats:{2:[{question:'왜 멈췄나요?',answer:'임의로 조작한 답변'}],999:[{question:'숨김',answer:'숨김'}]}}));
    assert.deepEqual(restored.selected,[2]);assert.equal(restored.person,2);assert.equal(restored.step,4);
    assert.ok(!restored.chats[2][0].answer.includes('조작한'));
    assert.equal(restored.chats[999],undefined);
    assert.equal(restoreDemo('{invalid').step,0);
    assert.equal(restoreDemo(JSON.stringify({step:4,selected:[],complete:true})).complete,false);
    assert.equal(restoreDemo(JSON.stringify({step:4,selected:[],complete:true})).step,2);
    assert.ok(interviewAnswer(2,'앞으로 성공할까요?').includes('새 답변은 생성하지 않습니다'));
  }finally{await server.close();}
});

test('exports contain only selected Act records and explicit source limitations',async()=>{
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  try {
    const {demoStudy}=await server.ssrLoadModule('/src/mockup/DemoData.ts');
    const {reportPayload,reportMarkdown}=await server.ssrLoadModule('/src/mockup/ReportExport.ts');
    const selected=demoStudy([2,3]);const payload=reportPayload(selected);const markdown=reportMarkdown(selected);
    assert.equal(payload.source,'saved-ai-demo');assert.equal(payload.results.length,2);
    assert.ok(payload.results.every(r=>r.act&&!('ask' in r)));
    assert.deepEqual(payload.personas.map(p=>p.persona_id),['P069','P392']);
    assert.ok(markdown.includes('0/2명'));assert.ok(markdown.includes('새 LLM 실행이 아닙니다'));
    assert.ok(markdown.includes('S03 학교·학년'));assert.ok(!markdown.includes('P938'));
    assert.ok(!JSON.stringify(payload).includes('willingness_to_pay'));
  }finally{await server.close();}
});