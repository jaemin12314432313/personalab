import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
const {browserSnapshot,displayAttributes,portraitPath}=await server.ssrLoadModule('/src/mockup/DisplayPersona.ts');
const {explorationBlock,explorationProgress}=await server.ssrLoadModule('/src/mockup/SourceRecognition.ts');
const {newStudy}=await server.ssrLoadModule('/src/studio/model.ts');
test.after(()=>server.close());
function fixture(){const s=newStudy();s.serverId=81;s.workflow={source:{kind:'web',preview:'data:image/png;base64,'+'x'.repeat(100000),preflight:{states:[{image:'data:image/png;base64,'+'x'.repeat(100000)}]},exploration:{id:'job',status:'running',phase:'screens',states:10,attempts:20,pending_actions:80,pages_found:12,pages_checked:9,pages_failed:1}},scope:{}};return s;}

test('progress uses discovered work and never reports global completion while still running',()=>{
 const s=fixture();assert.equal(explorationProgress(s).percent,20);assert.ok(explorationBlock(s));
 s.workflow.source.exploration.pending_actions=180;assert.equal(explorationProgress(s).percent,10);
 s.workflow.source.exploration.phase='pages';assert.equal(explorationProgress(s).percent,83);
 s.workflow.source.exploration.status='paused';assert.ok(explorationBlock(s));s.workflow.scope.reviewed_exploration_id='job';assert.equal(explorationBlock(s),'');
 s.workflow.source.exploration.status='running';assert.ok(explorationBlock(s));
 s.workflow.source.exploration.status='done';assert.equal(explorationProgress(s).percent,100);assert.equal(explorationBlock(s),'');
 s.workflow.source.inspection={capture_ready:false};assert.ok(explorationBlock(s));
});

test('cached drafts preserve editable values but omit server images and old internal persona data',()=>{
 const s=fixture();s.product.description='Unsaved product notes';s.personas=[{id:1,attributes:{profile:{age:35,sex:'여',job_group:'사무·관리',region:'서울',income:'PRIVATE'},card_text:'PRIVATE_RAW_CARD',traits:{digital:'높음',raw_score:'PRIVATE'},source:{persona_id:'P1',donor_pid:'PRIVATE',nvidia_uuid:'PRIVATE',library_entry_id:2}}}];
 const copy=browserSnapshot(s),json=JSON.stringify(copy);assert.equal(copy.product.description,'Unsaved product notes');assert.ok(!json.includes('PRIVATE'));assert.ok(!json.includes('data:image'));assert.ok(json.length<3000);assert.ok(s.workflow.source.preview.startsWith('data:'));
});

test('representative portraits map by explicit age and sex, with project assets for every mapping',()=>{
 for(const age of [24,35,49,67])for(const sex of ['남','여']){const path=portraitPath({profile:{age,sex}});assert.ok(existsSync('public'+path));}
 assert.equal(portraitPath({profile:{age:40}}),'');
});
