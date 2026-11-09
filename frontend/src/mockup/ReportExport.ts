import {executionState} from './ExecutionState';
import { siteCoverage, siteMode } from './SiteCoverage';
import { productKindLabel } from './WorkflowView';
import { studyTitle } from '../studio/model';
import { personaId } from '../studio/model';
import type { Study } from '../studio/model';
import { analyzeReport, browserReport, observationBasis, checkHypothesis, dropLabel, outcomeLabel, reportSource, screenTitle, sourceTitle } from './ReportModel';

export function reportPayload(study: Study) {
  const model=analyzeReport(study);
  return {
    completion:executionState(study),site_coverage:siteCoverage(study),format:'personalab-ux-report-v1',exported_at:new Date().toISOString(),source:reportSource(study),
    response_label:study.reportSource==='local-demo'?'Local Connection Check':study.reportSource==='ui-mock'?'UI Mock Data':'Synthetic User Response',
    name:study.name,product:{name:study.product.name,description:study.product.description},task:study.task,goal:study.goal,screens:study.screens,
    workflow:study.workflow?{revision:study.workflow.revision,root_study_id:study.workflow.root_study_id,source_kind:study.workflow.source.kind,scope:study.workflow.scope}:undefined,
    evidence:study.evidence?.map(e=>({id:e.id,persona_id:e.persona_id,turn:e.turn,screen:e.screen,action:e.action,image:e.image,image_access:'로그인한 소유 계정에서만 조회 가능'})),
    summary:{records:model.records.length,panel:model.total,complete:model.complete.length,dropped:model.dropped.length,system:model.system.length,pending:model.pending.length},
    findings:model.findings.map(f=>({screen:f.screen,code:f.code,persona_ids:f.records.map(r=>r.persona_id),count:f.records.length,denominator:model.records.length,hypothesis:checkHypothesis(f.code)})),
    personas:study.personas.map(p=>({id:p.id,persona_id:personaId(p),attributes:p.attributes})),
    results:study.results.map(r=>({id:r.id,persona_id:r.persona_id,act:r.act})),
    limits:['실제 사용자 조사 결과가 아닙니다.',observationBasis(study),'체류 시간·시선은 측정하지 않습니다.','수정 제안은 검증되지 않은 확인 가설입니다.',...(study.reportSource==='local-demo'?['DB 연결 점검용으로 직접 만든 가상 예시입니다. 실제 AI 실행이나 원본 카드 결과가 아닙니다.']:study.reportSource==='ui-mock'?['직접 구성한 UI 목데이터입니다. 실제 AI 실행 결과가 아닙니다.']:study.source==='demo'?['저장된 AI 기록을 재생한 데모이며 새 LLM 실행이 아닙니다.']:[])],
  };
}
export function reportMarkdown(study: Study) {
  const model=analyzeReport(study);
  return [`# ${studyTitle(study)} · ${executionState(study).partial?'부분 실행 기록':'UI·UX 탐색 리포트'}`,'',`> ${sourceTitle(study)}${study.source==='demo'?' · 새 LLM 실행이 아닙니다.':''}`,
    study.reportSource==='local-demo'?'> 로컬 연결 점검용 가상 예시 · 실제 AI 추론이 아닙니다.':study.reportSource==='ui-mock'?'> UI 목데이터 · 실제 실행 결과가 아닙니다.':'> Synthetic User Response · 실제 사용자 결과가 아닙니다.','',
    `- 실행 상태: ${executionState(study).final?'전체 종료 기록 확인':executionState(study).partial?'부분 실행 기록':'완료 상태 미확인'}`,`- 종료 기록: ${executionState(study).finished}/${executionState(study).total}명`,`- 제품 유형: ${productKindLabel(study)}`,`- 대상 사용자: ${study.workflow?.scope.audience?.description||"별도 설명 없음"}`,`- 사용 상황: ${study.workflow?.scope.audience?.context||"별도 지정 없음"}`,`- 사용 흐름: ${study.task}`,`- 확인한 기록: ${model.records.length}/${model.total}명`,siteMode(study)&&browserReport(study)?'- 탐색 방식: 사이트 전반 탐색':`- 목표 도달: ${model.complete.length}/${model.records.length}명`,
    `- 사용자 중단: ${model.dropped.length}명 / 탐색 한도: ${model.system.length}명 / 결과 없음: ${model.pending.length}명`,
    browserReport(study)?`- 관찰된 화면 상태: ${model.coverage.filter(c=>c.arrived).length}개 (전체 사이트 대비 비율 아님)`:`- 확인한 화면: ${model.coverage.filter(c=>c.arrived).length}/${study.screens.length}개`,
    browserReport(study)?(siteCoverage(study)?`- 발견 ${siteCoverage(study)!.pages.length}개 · 구조 확인 ${siteCoverage(study)!.checked}개 · 페르소나 방문 ${siteCoverage(study)!.visited}개 · 미방문 ${siteCoverage(study)!.unvisited}개 (발견 목록 기준)`:'- 페이지 목록 없음: 이전 연결 자료로, 전체 범위는 집계할 수 없습니다.'): `- 미확인: ${model.coverage.filter(c=>!c.arrived).map(c=>c.screen.id+' '+c.screen.label).join(', ')||'없음'}`,'',
    ...(siteCoverage(study)?['## 사이트 확인 범위',...siteCoverage(study)!.pages.map(p=>`- ${p.label} (${p.url}): ${p.state==='loaded'?'구조 확인':p.state==='error'?'접근 실패':'구조 미확인'} / ${p.visitors.length?`${p.visitors.length}명 방문`:'페르소나 미방문'}${p.issues.length?' / 자동 확인 항목: '+p.issues.map(i=>i.label).join(', '):''}`),'']:[]),
    '## 핵심 발견',...model.findings.flatMap(f=>['',`### ${f.screen} ${screenTitle(study,f.screen)} · ${dropLabel(f.code)}`,`- 근거: ${f.records.map(r=>r.persona_id).join(', ')} (${f.records.length}/${model.records.length}명)`,`- 다음 확인 가설: ${checkHypothesis(f.code)}`]),'',
    '## 페르소나별 근거',...study.personas.flatMap(p=>{const r=study.results.find(r=>r.id===p.id);return ['',`### ${personaId(p)}`,`- 종료: ${outcomeLabel(r)}${r?.act?.end.drop_reason?' · '+dropLabel(r.act.end.drop_reason):''}`,`- 경로: ${r?.act?.path.join(' → ')||'기록 없음'}`,...(r?.act?.events.filter(e=>e.reason).map(e=>`- ${e.screen}: ${e.reason}`)||[])];}),'',
    '## 해석 범위',observationBasis(study)+' 체류 시간·시선·만족도는 측정하지 않습니다. 수정 제안의 효과는 별도 테스트로 확인해야 합니다.',
  ].join('\n');
}
export function downloadReport(study: Study, format: 'json' | 'md') {
  const content = format === 'json' ? JSON.stringify(reportPayload(study), null, 2) : reportMarkdown(study);
  const blob = new Blob([content], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8' });
  const href = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = href; link.download = `PersonaLab-${(study.product.name || 'report').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')}.${format}`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
}