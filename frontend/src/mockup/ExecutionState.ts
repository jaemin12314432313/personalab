import type {Study} from '../studio/model';

// 최종 리포트는 서버 종료 상태와 저장된 종료 기록을 함께 확인한다.
export function executionState(study:Study){
 const run=study.runs?.act,remote=Boolean(run&&study.serverId),snapshot=study.execution;
 const verified=!remote||snapshot?.run_id===run;
 const status=remote?(verified?snapshot!.status:'unknown'):study.status;
 const ids=new Set(study.personas.map(p=>p.id));
 const records=[...new Set(study.results.filter(r=>r.act?.end&&(!ids.size||ids.has(r.id))).map(r=>r.id))];
 const total=ids.size,finished=records.length,missing=Math.max(0,total-finished);
 const terminal=verified&&['done','failed'].includes(status);
 const final=terminal&&status==='done'&&total>0&&missing===0;
 const evidence=Boolean(finished||study.evidence?.length);
 const partial=terminal&&!final&&evidence;
 const canReport=final||partial,canInterview=canReport&&finished>0;
 const phase=!verified?'checking':status==='running'||status==='pending'?'running':final?'complete':partial?'partial':terminal?'empty':'setup';
 const message=phase==='checking'?'서버의 실행 종료 상태를 확인하고 있어요.':phase==='running'?`탐색 중이에요. ${finished}/${total}명의 종료 기록이 저장됐어요. 모두 종료된 뒤 리포트를 열 수 있어요.`:phase==='partial'?`${finished}/${total}명의 종료 기록만 저장된 부분 실행입니다. 누락된 결과를 완료로 집계하지 않습니다.`:phase==='empty'?'실행은 종료됐지만 확인할 기록이 없습니다. 실행 상태를 확인하거나 수정 회차를 만들어 주세요.':phase==='complete'?`${finished}/${total}명의 탐색이 종료되고 기록이 저장됐어요.`:'설정을 완료한 뒤 실행해 주세요.';
 return {phase,status,verified,total,finished,missing,final,partial,canReport,canInterview,message};
}
