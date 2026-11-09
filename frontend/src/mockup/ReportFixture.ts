import { DEFAULT_SCREENS } from '../studio/model';
import type { Study, Act } from '../studio/model';

// UI 상태 확인용으로 직접 구성한 예시. 저장된 AI 5명 및 DB의 원본 카드와 독립적이다.
export function mockReportStudy(): Study {
  const path = (ids: string[], end: Act['end'], reason?: string): Act => {
    const events:Act['events']=ids.slice(0,-1).map((screen,i)=>({turn:i+1,screen,action:'click',target:DEFAULT_SCREENS.find(s=>s.id===screen)!.elements.find(e=>e.to===ids[i+1])!.text,to:ids[i+1]}));
    if(reason)events.push({turn:ids.length,screen:ids.at(-1)!,action:'abandon',target:null,reason,drop_reason:end.drop_reason});
    return {path:ids,end,events};
  };
  const data = [
    {age:24,job:'대학생',act:path(['S01','S02','S03','S04','S05'],{result:'complete',screen:'S05'})},
    {age:28,job:'대학원생',act:path(['S01','S02'],{result:'drop',screen:'S02',drop_reason:'PRIVACY'},'일정을 보기 전에 휴대폰 인증까지 필요한 이유를 찾지 못했어요.')},
    {age:22,job:'대학생',act:path(['S01','S02','S03','S04'],{result:'drop',screen:'S04',drop_reason:'TOO_MANY_STEPS'},'관심분야를 다섯 개나 고르기보다 우선 일정을 확인하고 싶어요.')},
    {age:25,job:'대학생',act:path(['S01','S02','S03','S04','S05'],{result:'complete',screen:'S05'})},
    {age:27,job:'대학원생',act:path(['S01','S02','S03'],{result:'drop',screen:'S03',drop_reason:'MAX_TURNS'})},
    {age:23,job:'대학생',act:null},
  ];
  return { id:'ui-report-fixture-v1',name:'일정메이트 · 다양한 결과 예시',created:'2026-11-03T00:00:00Z',source:'demo',reportSource:'ui-mock',status:'failed',
    product:{name:'일정메이트',description:'수업과 과제 일정을 정리하는 서비스의 가입 흐름입니다.',features:['일정 관리'],price:''},
    screens:structuredClone(DEFAULT_SCREENS),task:'회원가입을 완료하고 홈에서 일정을 확인하세요',goal:'S05',conditions:{preset:'univ',age:'22-28',price:[]},count:6,seed:0,
    personas:data.map((p,i)=>({id:101+i,attributes:{profile:{age:p.age,job_group:p.job},card_text:'리포트의 다양한 종료 상태를 확인하기 위해 직접 구성한 가상 프로필입니다. 원본 페르소나 카드가 아닙니다.',traits:{},source:{persona_id:`M0${i+1}`,stub:true}}})),
    results:data.map((p,i)=>({id:101+i,persona_id:`M0${i+1}`,ask:null,act:p.act})),
  };
}