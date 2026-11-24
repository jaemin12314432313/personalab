import { DEMO } from '../studio/model';
import type { Screen, Study } from '../studio/model';
import { demoStudy } from './DemoData';
import { sampleMockResults } from './SampleMock';
import { SAMPLE_SITE } from './sampleSite';
import { defaultScope } from './WorkflowView';
import capture from './web-sample-capture.json';

/** 데스크톱 웹 결과 화면을 둘러보는 읽기 전용 UI 예시. */
export function webSampleStudy(): Study {
  const study = demoStudy(DEMO.personas.map(person => person.id));
  const screens: Screen[] = [
    { id:'home', label:'홈', description:'독서 기록 서비스 소개와 시작하기, 책 둘러보기 링크가 있는 웹 메인 화면', elements:[{text:'무료로 시작하기',to:'signup'},{text:'책 둘러보기',to:'books'}] },
    { id:'books', label:'책 둘러보기', description:'인기 책 목록을 살펴보는 웹 화면', elements:[{text:'자세히 보기',to:'book'}] },
    { id:'book', label:'느리게 읽는 하루', description:'선택한 책 소개와 이용 안내를 확인하는 화면', elements:[{text:'요금 안내 보기',to:'plans'}] },
    { id:'plans', label:'요금 안내', description:'무료와 유료 기능을 비교하는 화면', elements:[{text:'가입 화면으로 이동',to:'signup'}] },
    { id:'signup', label:'시작하기', description:'이메일과 닉네임을 입력하는 가입 화면', elements:[{text:'가입 완료하기',to:'welcome'}] },
    { id:'welcome', label:'환영', description:'가입 완료 후 다음 행동을 안내하는 화면', elements:[] },
  ];
  study.id='web-ui-sample'; study.name='모아북 · 웹 UI 예시'; study.product={name:SAMPLE_SITE.name,description:SAMPLE_SITE.description,features:['독서 기록','책 탐색','요금 안내'],price:''};
  study.screens=screens; study.task='책을 둘러보고 가입 흐름을 확인하세요'; study.goal='welcome';
  study.results=sampleMockResults(study.results,screens); study.reportSource='ui-mock';
  study.workflow={study_id:0,root_study_id:0,revision:1,source:{kind:'html',title:'모아북 · 데스크톱 웹 예시',preview:capture},scope:{...defaultScope(),viewport:'desktop',product_kind:'web'}};
  study.evidence=study.results.map((result,index)=>{const first=result.act?.events[0];return {id:index+1,persona_id:result.id,turn:1,screen:{...screens[0],viewport:{width:1200,height:750},elements:screens[0].elements.map((element,i)=>({...element,id:`link-${i}`}))},image:capture,action:{action:'click',target:first?.target==='책 둘러보기'?'link-1':'link-0',reason:first?.reason||'예시 화면에서 선택했습니다.'}};});
  return study;
}
