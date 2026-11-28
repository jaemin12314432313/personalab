// 리포트 지표와 분포 차트. 이미 저장된 기록(경로·종료·관찰)을 세기만 한다. 새 AI 호출이나 저장 구조는 쓰지 않는다.
// 체류 시간·시선·감정·만족도는 측정하지 않는다. 비율(%)은 쓰지 않고 명수만 보여 준다(AI 구성의 기록 수이지 실제 고객 비율이 아니다).
import type { Study } from '../studio/model';
import { OBS_DIMENSIONS, personaId } from '../studio/model';
import { displayAttributes, portraitMarkup } from './DisplayPersona';
import { dropLabel, goalFlow, outcome, screenTitle, type analyzeReport } from './ReportModel';
import { journeyMarkup, journeyRows } from './ReportJourney';

type Model = ReturnType<typeof analyzeReport>;
type Kind = 'complete' | 'drop' | 'system' | 'pending';

/** 이 인원 미만의 그룹은 비교 대상이 아니라 참고용이다. */
export const SMALL_GROUP = 5;
const MAX_SCREEN_ROWS = 8;
const MAX_PERSON_ROWS = 12;

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const KIND_LABEL: Record<Kind, string> = { complete: '목표 도달', drop: '탐색 중단', system: '횟수까지 살펴봄', pending: '결과 없음' };
const KINDS: Kind[] = ['complete', 'drop', 'system', 'pending'];

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
const ageBand = (age: unknown) => {
  const n = Number(age);
  return Number.isFinite(n) && n > 0 ? (n >= 60 ? '60대 이상' : n < 20 ? '10대' : `${Math.floor(n / 10) * 10}대`) : '';
};
/** 막대 한 칸. 폭이 0이면 그리지 않는다. 칸 사이 2px 간격은 CSS의 gap이 만든다. */
const seg = (cls: string, count: number, scale: number, title: string) => count > 0 ? `<i class="rc-seg ${cls}" style="width:${(count / scale * 100).toFixed(2)}%" title="${esc(title)}"></i>` : '';

/** 사용자 중단의 이유 코드별 인원. 코드는 8개 분류를 그대로 쓴다. */
function stopReasons(model: Model) {
  const byCode = new Map<string, number>();
  for (const r of model.dropped) byCode.set(r.act.end.drop_reason || '', (byCode.get(r.act.end.drop_reason || '') || 0) + 1);
  return byCode;
}

/** 맨 위 한 문장과 굵은 분할 막대. 결과가 어떻게 나뉘었는지 숫자를 읽기 전에 모양으로 먼저 보여 준다. */
function hero(study: Study, model: Model) {
  const goal = goalFlow(study);
  const line = goal
    ? `${model.total}명 중 <b>${model.complete.length}명</b>이 목표에 도달했고, <b>${model.dropped.length}명</b>이 중간에 멈췄어요.`
    : `<b>${model.records.length}명</b>이 <b>${model.visited.size}개</b> 화면을 살펴봤고, <b>${model.dropped.length}명</b>이 중간에 멈췄어요.`;
  const parts = ([['complete', model.complete.length], ['drop', model.dropped.length], ['system', model.system.length], ['pending', model.pending.length]] as [Kind, number][]).filter(([, n]) => n > 0);
  const scale = Math.max(1, parts.reduce((s, [, n]) => s + n, 0));
  // 칸 안의 글자는 들어갈 때만 쓴다(좁은 칸은 범례와 툴팁이 맡는다).
  const bar = parts.map(([k, n]) => `<i class="rc-tseg is-${k}" style="flex:${n}" title="${KIND_LABEL[k]} ${n}명">${n / scale >= 0.16 ? `<b>${n}</b><span>${KIND_LABEL[k]}</span>` : ''}</i>`).join('');
  const aria = `결과 분배: ${parts.map(([k, n]) => `${KIND_LABEL[k]} ${n}명`).join(', ')}`;
  const legend = parts.map(([k, n]) => `<span><i class="rc-key is-${k}"></i>${KIND_LABEL[k]} ${n}명</span>`).join('');
  // 멈춘 이유가 하나뿐이면 카드를 따로 만들지 않고 여기서 한 줄로 말한다.
  const reasons = stopReasons(model);
  const reason = reasons.size === 1 ? (([[code, n]]) => `<p class="rc-reason"><b>멈춘 이유</b>${esc(dropLabel(code))} · ${n}명</p>`)([...reasons.entries()]) : '';
  return `<div class="rc-hero"><p class="rc-lede">${line}</p><div class="rc-tall" role="img" aria-label="${esc(aria)}">${bar}</div><div class="rc-legend">${legend}</div>${reason}</div>`;
}

// 리포트 맨 위 요약 타일(종료·중단·방문 수)과 겹치지 않는 값만 보여 준다.
function kpiRow(model: Model) {
  const actions = model.records.map(r => r.act.events.filter(e => e.action !== 'abandon').length);
  const sum = (polarity: 'issue' | 'good') => model.evaluation.filter(e => e.polarity === polarity).reduce((s, e) => s + e.people.length, 0);
  const tiles: [string, string, string, string][] = [
    ['행동 수 중앙값', actions.length ? `${median(actions)}<small>회</small>` : '—', '한 명이 누른 횟수의 가운데 값', 'ink'],
    ['가장 길게 간 행동 수', actions.length ? `${Math.max(...actions)}<small>회</small>` : '—', '가장 많이 누른 사람의 횟수', 'flow'],
    ['문제로 기록된 관찰', `${sum('issue')}<small>건</small>`, 'AI가 화면마다 남긴 문제 관찰의 기록 수', 'stop'],
    ['잘 된 점으로 기록된 관찰', `${sum('good')}<small>건</small>`, 'AI가 화면마다 남긴 잘 된 점 관찰의 기록 수', 'go'],
  ];
  return `<dl class="rc-kpis">${tiles.map(([label, value, hint, tone]) => `<div class="is-${tone}" title="${esc(hint)}"><dt>${esc(label)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

function screenRows(study: Study, model: Model) {
  const rows = model.coverage.map(c => ({ label: screenTitle(study, c.screen.id), arrived: c.arrived, stopped: c.stopped, system: c.system }));
  if (!rows.length) return { html: '', rows };
  const shown = rows.length > MAX_SCREEN_ROWS ? [...rows].sort((a, b) => b.arrived - a.arrived).slice(0, MAX_SCREEN_ROWS) : rows;
  const hidden = rows.length - shown.length;
  const scale = Math.max(1, model.records.length);
  const body = shown.map(r => {
    const moved = Math.max(0, r.arrived - r.stopped - r.system);
    const tip = `${r.label}: 도착 ${r.arrived}명 · 멈춤 ${r.stopped}명 · 횟수까지 ${r.system}명`;
    return `<div class="rc-row${r.arrived ? '' : ' is-none'}"><span class="rc-label" title="${esc(r.label)}">${esc(r.label)}</span><span class="rc-bar" role="img" aria-label="${esc(tip)}">${r.arrived ? seg('is-flow', moved, scale, `${r.label}: 이어간 ${moved}명`) + seg('is-stop', r.stopped, scale, `${r.label}: 멈춤 ${r.stopped}명`) + seg('is-sys', r.system, scale, `${r.label}: 횟수까지 ${r.system}명`) : ''}</span><span class="rc-val">${r.arrived ? `도착 ${r.arrived}명${r.stopped ? ` · 멈춤 ${r.stopped}` : ''}` : '<em>방문 없음</em>'}</span></div>`;
  }).join('');
  const legend = '<div class="rc-legend"><span><i class="rc-key is-flow"></i>이어감</span><span><i class="rc-key is-stop"></i>멈춤</span><span><i class="rc-key is-sys"></i>횟수까지 살펴봄</span></div>';
  return { rows, html: `<section class="rc-card"><h3>화면별 도착과 멈춤</h3><p class="rc-sub">그 화면에 도착한 사람 수예요. 방문 없음은 그 화면의 경험을 이번 기록으로 판단할 수 없다는 뜻이에요.</p>${legend}<div class="rc-rows">${body}</div>${hidden ? `<p class="rc-more">그 외 ${hidden}개 화면은 표에서 확인하세요.</p>` : ''}</section>` };
}

function personRows(study: Study, model: Model) {
  const records = model.records;
  if (!records.length) return '';
  const counts = records.map(r => r.act.events.filter(e => e.action !== 'abandon').length);
  const scale = Math.max(1, ...counts);
  const shown = records.slice(0, MAX_PERSON_ROWS);
  const body = shown.map((r, i) => {
    const p = study.personas.find(x => x.id === r.id), a = p ? displayAttributes(p.attributes).profile : null;
    const kind = outcome(r) as Kind;
    const who = a ? `${a.age}세 ${a.job_group || ''}`.trim() : '';
    const pid = p ? personaId(p) : r.persona_id;
    const tip = `${pid}: ${counts[i]}번 누르고 ${KIND_LABEL[kind]}`;
    const face = p ? portraitMarkup(displayAttributes(p.attributes), 'rc-face') : '';
    return `<div class="rc-row"><span class="rc-label rc-who" title="${esc(who)}">${face}<span class="rc-name"><b>${esc(pid)}</b>${who ? `<small>${esc(who)}</small>` : ''}</span></span><span class="rc-bar" role="img" aria-label="${esc(tip)}">${seg(`is-${kind}`, counts[i] || 0.0001, scale, tip)}</span><span class="rc-val">${counts[i]}회 · ${KIND_LABEL[kind]}</span></div>`;
  }).join('');
  return `<section class="rc-card"><h3>사람별 행동 수</h3><p class="rc-sub">누른 횟수와 끝난 모습이에요. 목표 도달 전에 횟수가 끝난 사람은 정한 횟수가 부족했을 수 있어요.</p><div class="rc-rows">${body}</div>${records.length > shown.length ? `<p class="rc-more">외 ${records.length - shown.length}명은 기록 탭에서 확인하세요.</p>` : ''}</section>`;
}

type Group = { key: string; n: number; faces: string[] } & Record<Kind, number>;
function attributeBlocks(study: Study) {
  if (!study.personas.length) return { html: '', groupsByDim: [] as { dim: string; groups: Group[] }[] };
  const dims: [string, (p: Study['personas'][number]) => string][] = [
    ['연령대', p => ageBand(p.attributes.profile?.age)],
    ['직업군', p => String(p.attributes.profile?.job_group || '')],
    ['성별', p => String(displayAttributes(p.attributes).profile.sex || '')],
    ['지역', p => String(displayAttributes(p.attributes).profile.region || '')],
  ];
  const groupsByDim: { dim: string; groups: Group[] }[] = [];
  const same: string[] = [];
  for (const [dim, keyOf] of dims) {
    const map = new Map<string, Group>();
    for (const p of study.personas) {
      const key = keyOf(p);
      if (!key) continue;
      const g = map.get(key) || { key, n: 0, faces: [], complete: 0, drop: 0, system: 0, pending: 0 };
      g.n += 1; g[outcome(study.results.find(r => r.id === p.id)) as Kind] += 1;
      if (g.faces.length < 4) g.faces.push(portraitMarkup(displayAttributes(p.attributes), 'rc-face'));
      map.set(key, g);
    }
    if (map.size === 0) continue;
    if (map.size === 1) { same.push(`${dim}(${[...map.keys()][0]})`); continue; }
    const groups = [...map.values()].sort(dim === '연령대' ? (a, b) => a.key.localeCompare(b.key, 'ko-KR', { numeric: true }) : (a, b) => b.n - a.n || a.key.localeCompare(b.key, 'ko-KR'));
    groupsByDim.push({ dim, groups });
  }
  if (!groupsByDim.length && !same.length) return { html: '', groupsByDim };
  const total = study.personas.length;
  const small = total < SMALL_GROUP * 2;
  const blocks = groupsByDim.map(({ dim, groups }) => {
    const scale = Math.max(1, ...groups.map(g => g.n));
    const rows = groups.map(g => {
      const tip = `${dim} ${g.key} ${g.n}명: ${KINDS.filter(k => g[k]).map(k => `${KIND_LABEL[k]} ${g[k]}`).join(' · ')}`;
      const detail = KINDS.filter(k => g[k]).map(k => `${KIND_LABEL[k]} ${g[k]}`).join(' · ');
      return `<div class="rc-row"><span class="rc-label rc-who"><span class="rc-stack">${g.faces.join('')}</span><span class="rc-name"><b>${esc(g.key)}</b><small>${g.n}명</small></span></span><span class="rc-bar" role="img" aria-label="${esc(tip)}">${KINDS.map(k => seg(`is-${k}`, g[k], scale, `${g.key}: ${KIND_LABEL[k]} ${g[k]}명`)).join('')}</span><span class="rc-val">${esc(detail)}${g.n < SMALL_GROUP ? ' <em class="rc-flag" title="이 그룹은 인원이 적어 비교가 아니라 참고용이에요">표본 부족</em>' : ''}</span></div>`;
    }).join('');
    return `<div class="rc-dim"><h4>${esc(dim)}</h4><div class="rc-rows">${rows}</div></div>`;
  }).join('');
  const legend = '<div class="rc-legend">' + KINDS.filter(k => k !== 'pending' || groupsByDim.some(d => d.groups.some(g => g.pending))).map(k => `<span><i class="rc-key is-${k}"></i>${KIND_LABEL[k]}</span>`).join('') + '</div>';
  const note = `비율(%)은 쓰지 않았어요. ${SMALL_GROUP}명 미만 그룹은 '표본 부족'으로 표시해요.${small ? ` 전체 ${total}명이라 속성별 차이는 참고로만 보세요.` : ''}`;
  return { groupsByDim, html: `<section class="rc-card rc-wide"><h3>페르소나 속성별 결과</h3><p class="rc-sub">같은 화면을 본 AI 구성의 속성별로 나눠 센 값이에요. ${esc(note)}</p>${legend}<div class="rc-dims">${blocks}</div>${same.length ? `<p class="rc-more">모두 같은 값이라 나누지 않은 속성: ${esc(same.join(', '))}</p>` : ''}</section>` };
}

function dropAnalysis(study: Study, model: Model) {
  const records = model.records;
  if (!records.length) return '';
  const dims: [string, (p: Study['personas'][number]) => string][] = [
    ['새 서비스 적응', p => String(displayAttributes(p.attributes).traits.digital || '')],
    ['가격 민감도', p => String(p.attributes.traits.price || p.attributes.traits.price_sensitivity || '')],
    ['개인정보 우려', p => String(displayAttributes(p.attributes).traits.privacy || '')],
    ['성별', p => String(p.attributes.profile.sex || '')],
    ['연령대', p => ageBand(p.attributes.profile.age)],
  ];
  if (study.source === 'demo') {
    const examples: [string, [string, number, number][]][] = [
      ['\ub514\uc9c0\ud138 \uc218\uc6a9\ub3c4', [['\uc911\uac04',1,2],['\ub192\uc74c',1,3]]],
      ['\uac00\uaca9 \ubbfc\uac10\ub3c4', [['\ub0ae\uc74c',1,2],['\uc911\uac04',1,1],['\ub192\uc74c',0,2]]],
      ['\uac1c\uc778\uc815\ubcf4 \uc6b0\ub824', [['\ub0ae\uc74c',1,1],['\ub192\uc74c',0,2],['\ub9e4\uc6b0 \ub192\uc74c',1,2]]],
      ['\uc131\ubcc4', [['\ub0a8',1,3],['\uc5ec',1,2]]],
      ['\uc5f0\ub839\ub300', [['19~21\uc138',2,4],['22~24\uc138',0,1]]],
    ];
    const cards = examples.map(([label, rows]) => `<article class="rc-drop-group"><h4>${label}</h4>${rows.map(([name,n,total]) => { const rate=Math.round(n/total*100); return `<div class="rc-drop-row"><span>${name}</span><div class="rc-drop-bar"><i style="width:${rate}%"></i><b style="left:40%"></b></div><strong>${rate}%<small>${n}/${total}\uba85</small></strong></div>`; }).join('')}<small>\uc804\uccb4 \ud3c9\uade0 40%</small></article>`).join('');
    return `<section class="rc-card rc-wide"><h3>\uc774\ud0c8 \uc6d0\uc778 \ubd84\uc11d</h3><p class="rc-sub">\uc774\ubbf8\uc9c0\uc5d0 \uc81c\uc2dc\ub41c \uc608\uc2dc \uc218\uce58\uc608\uc694. \uc2e4\uc81c \uc2e4\ud589 \uae30\ub85d\uc758 \uc9d1\uacc4\uac00 \uc544\ub2d9\ub2c8\ub2e4.</p><div class="rc-drop-grid">${cards}</div></section>`;
  }
  const average = Math.round(model.dropped.length / records.length * 100);
  const cards = dims.map(([label, keyOf]) => {
    const groups = new Map<string, {total:number; dropped:number}>();
    for (const r of records) {
      const p = study.personas.find(person => person.id === r.id);
      if (!p) continue;
      const key = keyOf(p);
      if (!key || key === '미등록') continue;
      const group = groups.get(key) || {total:0, dropped:0};
      group.total++; if (outcome(r) === 'drop') group.dropped++;
      groups.set(key, group);
    }
    if (!groups.size) return `<article class="rc-drop-group"><h4>${esc(label)}</h4><p class="rc-drop-empty">\uae30\ub85d\ub41c \uc18d\uc131 \uc815\ubcf4\uac00 \uc5c6\uc5b4\uc694.</p></article>`;
    const rows = [...groups].map(([key, g]) => {
      const rate = Math.round(g.dropped / g.total * 100);
      return `<div class="rc-drop-row"><span>${esc(key)}</span><div class="rc-drop-bar"><i style="width:${rate}%"></i><b style="left:${average}%" title="전체 중단률 ${average}%"></b></div><strong>${rate}%<small>${g.dropped}/${g.total}명</small></strong></div>`;
    }).join('');
    return `<article class="rc-drop-group"><h4>${esc(label)}</h4>${rows}<small>전체 중단률 ${average}%</small></article>`;
  }).join('');
  return `<section class="rc-card rc-wide"><h3>이탈 원인 분석</h3><p class="rc-sub">종료 기록이 있는 AI 페르소나의 속성별 중단 비율이에요. 소수 기록의 분포이며 중단 원인이나 실제 사용자의 경향을 입증하지 않아요.</p>${cards ? `<div class="rc-drop-grid">${cards}</div>` : '<p class="rc-sub">비교할 속성 기록이 없어요.</p>'}</section>`;
}

function reasonAndObservation(study: Study, model: Model) {
  const parts: string[] = [];
  const byCode = stopReasons(model);
  if (byCode.size >= 1) {
    const max = Math.max(...byCode.values());
    const rows = [...byCode.entries()].sort((a, b) => b[1] - a[1]).map(([code, n]) => `<div class="rc-row"><span class="rc-label">${esc(dropLabel(code))}</span><span class="rc-bar" role="img" aria-label="${esc(`${dropLabel(code)} ${n}명`)}">${seg('is-flow', n, max, `${dropLabel(code)} ${n}명`)}</span><span class="rc-val">${n}명</span></div>`).join('');
    parts.push(`<section class="rc-card"><h3>멈춘 이유</h3><p class="rc-sub">사용자 중단만 센 값이에요. 이유 분류는 8개 코드를 그대로 써요.</p><div class="rc-rows">${rows}</div></section>`);
  }
  return parts.join('') || `<section class="rc-card"><h3>\uba48\ucd98 \uc774\uc720</h3><p class="rc-sub">\uae30\ub85d\ub41c \uc911\ub2e8 \uc774\uc720\uac00 \uc5c6\uc5b4\uc694.</p></section>`;
}

function usabilityCriteria(study: Study) {
  const rows: [string,number,number,number,string][] = [
    ['\ub2e8\uc21c\ud568',0,48,38,'\ub098\uc068 100%'], ['\uc0c1\ud0dc \ubc0f \ud53c\ub4dc\ubc31',21,27,31,'\ub098\uc068 56%'],
    ['\ud1b5\uc81c',30,18,33,'\ubcf4\ud1b5 63%'], ['\uc774\ud574',42,6,60,'\ubcf4\ud1b5 88%'],
    ['\uc77c\uad00\uc131',41,7,6,'\ubcf4\ud1b5 85%'], ['\uc624\ub958 \uc608\ubc29 \ubc0f \ubcf5\uad6c',0,48,73,'\ub098\uc068 100%'], ['\uc720\uc5f0\uc131 \ubc0f \ub3c4\uc6c0',0,48,60,'\ub098\uc068 100%']
  ];
  if (study.source !== 'demo') return `<section class="rc-card rc-wide"><h3>\uc0ac\uc6a9\uc131 \uae30\uc900</h3><p class="rc-sub">\uc774 \uc2e4\ud589\uc5d0\ub294 7\uac1c \uae30\uc900\uc758 \ub77c\ubca8\uacfc \uc911\uc694\ub3c4 \uae30\ub85d\uc774 \uc5c6\uc5b4\uc694.</p></section>`;
  return `<section class="rc-card rc-wide"><h3>\uc0ac\uc6a9\uc131 \uae30\uc900</h3><p class="rc-sub">\uc774\ubbf8\uc9c0\uc5d0 \uc81c\uc2dc\ub41c 48\uba85\uc758 \uc608\uc2dc \uc218\uce58\uc608\uc694. \ud604\uc7ac \uc2e4\ud589 \uae30\ub85d\uc758 \uc9d1\uacc4\uac00 \uc544\ub2d9\ub2c8\ub2e4.</p><div class="rc-use-scroll"><div class="rc-use-table"><div class="rc-use-row rc-use-head"><span>\uae30\uc900</span><span>\ub77c\ubca8 \ubd84\ud3ec</span><span>\ub300\ud45c \ub77c\ubca8</span><span>\uc911\uc694\ub3c4 \ub192\uc74c</span></div>${rows.map(([name,neutral,bad,importance,label])=>`<div class="rc-use-row"><strong>${name}</strong><div class="rc-use-bar">${neutral?`<i class="neutral" style="width:${neutral/48*100}%">${neutral}</i>`:''}${bad?`<i class="bad" style="width:${bad/48*100}%">${bad}</i>`:''}</div><span>${label}</span><div class="rc-use-importance"><i style="width:${importance}%"></i><span>${importance}%</span></div></div>`).join('')}</div></div></section>`;
}

function tables(screens: ReturnType<typeof screenRows>['rows'], attrs: { dim: string; groups: Group[] }[], paths: (string | number)[][]) {
  const table = (head: string[], rows: (string | number)[][]) => `<table><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table>`;
  const a = screens.length ? `<h4>화면별</h4>${table(['화면', '도착', '멈춤', '횟수까지'], screens.map(r => [r.label, r.arrived, r.stopped, r.system]))}` : '';
  const b = attrs.map(({ dim, groups }) => `<h4>${esc(dim)}</h4>${table(['그룹', '인원', '목표 도달', '탐색 중단', '횟수까지', '결과 없음'], groups.map(g => [g.key, g.n, g.complete, g.drop, g.system, g.pending]))}`).join('');
  const c = paths.length ? `<h4>사람별 경로</h4>${table(['사람', '지나간 화면', '끝난 모습'], paths)}` : '';
  return a || b || c ? `<details class="rc-table"><summary>표로 보기</summary>${a}${c}${b}</details>` : '';
}

/** 리포트 개요에 붙는 지표·분포 영역. 기록이 하나도 없으면 아무것도 그리지 않는다. */
export function chartsMarkup(study: Study, model: Model): string {
  if (!model.records.length) return '';
  const screens = screenRows(study, model);
  const attrs = attributeBlocks(study);
  const j = journeyMarkup(study, model);
  return `<section class="rc-wrap" aria-label="지표와 분포"><header class="rc-head"><span class="rc-eyebrow">METRICS</span><h2>지표와 분포</h2><p>AI 구성의 기록을 센 값이에요. 실제 사용자의 비율이 아니고, 체류 시간·시선·만족도는 측정하지 않아요.</p></header>${hero(study, model)}${kpiRow(model)}${j.flow}${j.tiers}<div class="rc-grid">${screens.html}${personRows(study, model)}</div>${dropAnalysis(study, model)}<div class="rc-grid">${reasonAndObservation(study, model)}</div>${usabilityCriteria(study)}${attrs.html}${tables(screens.rows, attrs.groupsByDim, journeyRows(study, model))}</section>`;
}
