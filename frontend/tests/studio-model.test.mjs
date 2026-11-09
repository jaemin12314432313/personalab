import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO, statistics, reachable, validateScreens } from '../src/studio/model.ts';

test('recorded demo keeps the zero gap and individual disagreement', () => {
  const stats = statistics(DEMO.results);
  assert.equal(stats.average, 2.2);
  assert.equal(stats.gap, 0);
  assert.equal(stats.completed, 0);
  assert.deepEqual(stats.topScreens, [['S02', 5]]);
  assert.deepEqual(stats.reasons, [['PRIVACY', 4], ['TOO_MANY_STEPS', 1]]);
  assert.equal(stats.paired.filter(r => r.ask.concern !== r.act.end.drop_reason).length, 2);
});
test('gap compares paired responses and excludes missing sides', () => {
  const pair = structuredClone(DEMO.results[0]);
  pair.ask.usage_intention = 5;
  const missingAct = structuredClone(DEMO.results[1]);
  missingAct.act = null;
  const missingAsk = structuredClone(DEMO.results[2]);
  missingAsk.ask = null;
  const stats = statistics([pair, missingAct, missingAsk]);
  assert.equal(stats.paired.length, 1);
  assert.equal(stats.gap, 100);
});
test('turn limits stay separate from abandonment reason distributions', () => {
  const item = structuredClone(DEMO.results[0]);
  item.act.end.drop_reason = 'MAX_TURNS';
  const stats = statistics([item]);
  assert.equal(stats.system.length, 1);
  assert.deepEqual(stats.reasons, []);
  assert.deepEqual(stats.topScreens, []);
});
test('prototype validation rejects broken links and ambiguous button labels', () => {
  const screens = structuredClone(DEMO.screens);
  screens[0].elements.push({ text: '없는 화면', to: 'S99' });
  assert.throws(() => validateScreens(screens), /S99/);
  screens[0].elements.pop();
  screens[0].elements.push({ text: screens[0].elements[0].text, to: 'S03' });
  assert.throws(() => validateScreens(screens), /같은 이름/);
});
test('reachable handles loops and goals without a connection', () => {
  assert.equal(reachable(DEMO.screens, 'S05'), true);
  const screens = [{ id: 'S01', label: '시작', description: '', elements: [{ text: '제자리', to: 'S01' }] }, { id: 'S02', label: '목표', description: '', elements: [] }];
  assert.equal(reachable(screens, 'S02'), false);
});
