import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('all studio routes render with recorded and empty states', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: App } = await server.ssrLoadModule('/src/studio/StudioApp.tsx');
    const { newStudy } = await server.ssrLoadModule('/src/studio/model.ts');
    const draft = newStudy();
    draft.id = 'draft-test';
    draft.product.name = '경로 테스트';
    globalThis.localStorage = { getItem: () => JSON.stringify([draft]) };
    globalThis.sessionStorage = { getItem: () => '1' };
    for (const [route, expected] of [
      ['landing', '직접 써보게 합니다.'], ['studies', '테스트'], ['connection', '실행 연결 상태'],
      ['study/draft-test/1', '어떤 제품을 살펴볼까요?'], ['study/draft-test/2', '어디에서 시작하고, 끝낼까요?'],
      ['study/draft-test/3', '누구의 시선으로 볼까요?'], ['study/draft-test/4', '첫 번째 실행 기록을 기다립니다.'],
      ['study/draft-test/5', '아직 실행 결과가 없습니다.'], ['study/recorded-demo-v2/5', 'P938'],
    ]) {
      globalThis.window = { location: { hash: '#/' + route } };
      const html = renderToStaticMarkup(React.createElement(App));
      assert.ok(html.includes(expected), `${route} should contain ${expected}`);
      assert.ok(!html.includes('NaN'), `${route} should not render NaN`);
    }
  } finally { await server.close(); }
});

test('API preparation and polling use the existing backend contracts', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const realFetch = globalThis.fetch;
  const calls = [];
  try {
    const api = await server.ssrLoadModule('/src/api/studio.ts');
    const { DEMO } = await server.ssrLoadModule('/src/studio/model.ts');
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, body: options.body ? JSON.parse(options.body) : undefined });
      const data = url.endsWith('/status') ? { id: 12, mode: 'ask', status: 'done', progress: 1 } : url === '/api/studies' ? { id: 42 } : {};
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    let created;
    const id = await api.prepareStudy({ ...DEMO, serverId: undefined }, value => { created = value; });
    assert.equal(id, 42);
    assert.equal(created, 42);
    assert.deepEqual(calls.map(c => c.url), ['/api/studies', '/api/studies/42/name', '/api/studies/42/product', '/api/studies/42/prototype/manual', '/api/studies/42/task']);
    assert.ok(!calls.some(c => c.url.endsWith('/questions'))); // 새 UI·UX 흐름에는 기획·가격 문항을 전송하지 않는다.
    let progress;
    await api.watchRun(12, run => { progress = run.progress; }, new AbortController().signal);
    assert.equal(progress, 1);
    assert.equal(calls.at(-1).url, '/api/runs/12/status');
  } finally { globalThis.fetch = realFetch; await server.close(); }
});
