// 체험용 샘플 사이트(모아북)로 돌린 실행은 규칙 기반이라 대부분 "한도 종료"로 끝나 리포트가 비어 보인다.
// 그래서 샘플 사이트에 한해, 화면 구성을 확인할 수 있게 직접 만든 예시 결과를 입혀 보여 준다.
// 실제 실행 결과가 아니며 리포트에는 "직접 만든 데이터" 표시(reportSource='ui-mock')가 붙는다.
import type { Act, Result, Study } from '../studio/model';
import { SAMPLE_SITE } from './sampleSite';
import { outcome } from './ReportModel';

type Step = { match: RegExp; click: string; reason: string };
// 경로: 홈 → … → 마지막 화면. kind가 drop이면 마지막 화면에서 멈추고, goal이면 가입 완료 화면에 도착한다.
const ROUTES: { steps: Step[]; end: { match: RegExp; kind: 'drop' | 'goal'; code?: string; reason?: string } }[] = [
  { steps: [{ match: /홈|읽은 책/, click: '무료로 시작하기', reason: '무료라고 해서 바로 눌렀어요.' }],
    end: { match: /시작하기/, kind: 'drop', code: 'PRIVACY', reason: '이메일이랑 닉네임까지 왜 받는지 설명이 없어서 멈췄어요.' } },
  { steps: [{ match: /홈|읽은 책/, click: '책 둘러보기', reason: '먼저 어떤 책이 있는지 보고 싶었어요.' }, { match: /둘러보기/, click: '자세히 보기', reason: '제목이 눈에 들어와서 눌렀어요.' }, { match: /느리게|작은 습관/, click: '요금 안내 보기', reason: '무료로 어디까지 되는지 궁금했어요.' }],
    end: { match: /요금/, kind: 'drop', code: 'PRICE', reason: '월 3,900원이 책 기록하는 데 쓸 값인지 모르겠어요.' } },
  { steps: [{ match: /홈|읽은 책/, click: '무료로 시작하기', reason: '무료라고 해서 눌렀어요.' }, { match: /시작하기/, click: '가입 완료하기', reason: '이메일과 닉네임만 적으면 돼서 쉬웠어요.' }],
    end: { match: /환영/, kind: 'goal' } },
  { steps: [{ match: /홈|읽은 책/, click: '책 둘러보기', reason: '책부터 둘러보려고 했어요.' }],
    end: { match: /둘러보기/, kind: 'drop', code: 'UNCLEAR_PURPOSE', reason: '어떤 서비스인지 첫 화면만으로는 알기 어려워서 더 보기 싫었어요.' } },
  { steps: [{ match: /홈|읽은 책/, click: '무료로 시작하기', reason: '일단 시작해 보려고 했어요.' }, { match: /시작하기/, click: '가입 완료하기', reason: '쓰기 쉬웠어요.' }],
    end: { match: /환영/, kind: 'goal' } },
];

export const isSampleStudy = (study: Pick<Study, 'product'>) => study.product?.name === SAMPLE_SITE.name;

export function sampleMockResults(results: Result[], screens: Study['screens']): Result[] {
  const find = (re: RegExp) => screens.find(s => re.test(s.label))?.id;
  let n = 0;
  return results.map(r => {
    if (!r.act) return r;
    const route = ROUTES[n++ % ROUTES.length];
    const path: string[] = [], events: Act['events'] = [];
    route.steps.forEach((step, i) => { const id = find(step.match); if (!id) return; path.push(id); events.push({ turn: i + 1, screen: id, action: 'click', target: step.click, reason: step.reason }); });
    const last = find(route.end.match);
    if (!path.length || !last) return r;
    path.push(last);
    if (route.end.kind === 'drop') {
      events.push({ turn: events.length + 1, screen: last, action: 'abandon', target: null, reason: route.end.reason, drop_reason: route.end.code });
      return { ...r, act: { path, events, end: { result: 'drop', screen: last, drop_reason: route.end.code } } };
    }
    return { ...r, act: { path, events, end: { result: 'complete', screen: last } } };
  });
}

/** 샘플 사이트 실행이고 사용자 중단 기록이 하나도 없을 때만 예시 결과를 입힌다. */
export function withSampleMock(study: Study, results: Result[]): { results: Result[]; mocked: boolean } {
  if (!isSampleStudy(study) || results.some(r => r.act && outcome(r) === 'drop')) return { results, mocked: false };
  const mocked = sampleMockResults(results, study.screens);
  return { results: mocked, mocked: mocked.some((r, i) => r !== results[i]) };
}
