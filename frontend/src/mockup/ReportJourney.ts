// 이동 경로 중심 시각화: 사람별 화면 흐름(리본), 사람 × 화면 히트맵, 화면 분류.
// Maze의 경로 분석·Sankey, 세션 재생기의 이벤트 마커에서 읽는 법을 빌렸다. 점수는 만들지 않고 기록에서 나온 사실만 쓴다.
import type { Study } from '../studio/model';
import { personaId } from '../studio/model';
import { displayAttributes, portraitMarkup } from './DisplayPersona';
import { outcome, screenTitle, type analyzeReport } from './ReportModel';

type Model = ReturnType<typeof analyzeReport>;
type Kind = 'complete' | 'drop' | 'system' | 'pending';

const KIND_LABEL: Record<Kind, string> = { complete: '목표 도달', drop: '탐색 중단', system: '횟수까지 살펴봄', pending: '결과 없음' };
const OUT_COLOR: Record<Kind, string> = { complete: '#2f8f5b', drop: '#d4503f', system: '#b9b09f', pending: '#d9d4c8' };
const OUT_RANK: Record<Kind, number> = { complete: 0, system: 1, drop: 2, pending: 3 };
const OUT_GLYPH: Record<Kind, string> = { complete: '✓', drop: '✕', system: '…', pending: '' };
const FLOW_MAX_STEPS = 8;
const HEATMAP_MAX_COLS = 12;
const HEATMAP_MAX_ROWS = 12;

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const shorten = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
export const pidOf = (study: Study, r: { id: number; persona_id: string }) => {
  const p = study.personas.find(x => x.id === r.id);
  return p ? personaId(p) : r.persona_id;
};

/** 사람 한 명이 리본 한 줄이다. 어느 화면을 지나 어떻게 끝났는지를 색으로 보여 준다. */
function flowChart(study: Study, model: Model) {
  const recs = [...model.records].sort((a, b) => OUT_RANK[outcome(a) as Kind] - OUT_RANK[outcome(b) as Kind] || a.id - b.id);
  const steps = Math.min(FLOW_MAX_STEPS, Math.max(0, ...recs.map(r => r.act.path.length)));
  if (recs.length < 2 || steps < 2) return '';
  const seqs = recs.map(r => r.act.path.slice(0, steps));
  type Node = { col: number; screen: string; people: number[]; y: number; h: number };
  const nodes = new Map<string, Node>();
  seqs.forEach((seq, pi) => seq.forEach((screen, col) => {
    const key = `${col}|${screen}`, node = nodes.get(key) || { col, screen, people: [], y: 0, h: 0 };
    node.people.push(pi);
    nodes.set(key, node);
  }));
  const maxCount = Math.max(...[...nodes.values()].map(n => n.people.length));
  const unit = Math.max(3, Math.min(18, Math.floor(220 / maxCount)));
  const GAP = 28, TOP = 38, NODE_W = 12, COL_W = 170, LEFT = 24;
  const cols: Node[][] = Array.from({ length: steps }, () => []);
  for (const n of nodes.values()) cols[n.col].push(n);
  let height = 0;
  for (const col of cols) {
    col.sort((a, b) => Math.min(...a.people) - Math.min(...b.people));
    let y = TOP;
    for (const n of col) { n.h = n.people.length * unit; n.y = y; y += n.h + GAP; }
    height = Math.max(height, y);
  }
  const width = LEFT * 2 + (steps - 1) * COL_W + NODE_W + 56;
  const slot = (col: number, screen: string, pi: number) => {
    const n = nodes.get(`${col}|${screen}`)!;
    return n.y + n.people.indexOf(pi) * unit + unit / 2;
  };
  const ribbons: string[] = [], marks: string[] = [];
  seqs.forEach((seq, pi) => {
    const kind = outcome(recs[pi]) as Kind, color = OUT_COLOR[kind], pid = pidOf(study, recs[pi]);
    const title = `${pid}: ${seq.map(s => screenTitle(study, s)).join(' → ')} · ${KIND_LABEL[kind]}`;
    for (let col = 0; col < seq.length - 1; col++) {
      const x0 = LEFT + col * COL_W + NODE_W, x1 = LEFT + (col + 1) * COL_W, xm = (x0 + x1) / 2;
      const y0 = slot(col, seq[col], pi), y1 = slot(col + 1, seq[col + 1], pi);
      ribbons.push(`<path d="M${x0} ${y0} C${xm} ${y0},${xm} ${y1},${x1} ${y1}" fill="none" stroke="${color}" stroke-opacity=".52" stroke-width="${Math.max(2, unit - 2)}"><title>${esc(title)}</title></path>`);
    }
    const last = seq.length - 1, mx = LEFT + last * COL_W + NODE_W + 13, my = slot(last, seq[last], pi);
    const glyph = OUT_GLYPH[kind] ? `<text x="${mx}" y="${my + 3.4}" text-anchor="middle" font-size="9" font-weight="800" fill="${kind === 'system' ? '#2c2820' : '#fff'}">${OUT_GLYPH[kind]}</text>` : '';
    marks.push(`<g><title>${esc(title)}</title><circle cx="${mx}" cy="${my}" r="${unit >= 10 ? 7 : 6}" fill="${color}" stroke="#fff" stroke-width="2"/>${glyph}</g>`);
  });
  const rects: string[] = [], labels: string[] = [];
  for (const n of nodes.values()) {
    const x = LEFT + n.col * COL_W;
    rects.push(`<rect x="${x}" y="${n.y}" width="${NODE_W}" height="${n.h}" rx="3" fill="#2b2a27"><title>${esc(`${screenTitle(study, n.screen)}: ${n.people.length}명`)}</title></rect>`);
    labels.push(`<text x="${x}" y="${n.y - 8}" font-size="11.5" font-weight="650" fill="#3b362d">${esc(shorten(screenTitle(study, n.screen), 11))}<tspan fill="#9a8f7a" font-weight="500"> · ${n.people.length}명</tspan></text>`);
  }
  const heads = cols.map((_, col) => `<text x="${LEFT + col * COL_W}" y="16" font-size="10" letter-spacing="1.2" font-weight="700" fill="#a59a84">${col + 1}번째 화면</text>`).join('');
  const present = (['complete', 'drop', 'system'] as Kind[]).filter(k => recs.some(r => outcome(r) === k));
  const legend = `<div class="rc-legend">${present.map(k => `<span><i class="rc-key is-${k}"></i>${KIND_LABEL[k]}</span>`).join('')}<span class="rc-hint">리본 한 줄 = 한 사람 · 사각형 높이 = 그 화면에 있던 사람 수</span></div>`;
  const aria = `사람별 화면 이동 흐름. ${recs.length}명이 최대 ${steps}번째 화면까지 이동했습니다.`;
  return `<section class="rc-card rc-wide"><h3>사람별 화면 흐름</h3><p class="rc-sub">누가 어떤 화면을 지나 어디서 끝났는지 한 장으로 보여요. 같은 색 리본이 몰리는 곳이 공통 경로예요. 가로로 밀어서 볼 수 있어요.</p>${legend}<div class="rc-flow-scroll"><svg class="rc-flow" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(aria)}">${heads}${ribbons.join('')}${rects.join('')}${marks.join('')}${labels.join('')}</svg></div></section>`;
}

/** 사람 × 화면. 칸 안의 숫자는 그 화면을 몇 번째로 봤는지다. 빗금은 가지 않은 화면이다. */
function heatmap(study: Study, model: Model) {
  const recs = model.records.slice(0, HEATMAP_MAX_ROWS);
  if (!recs.length || !study.screens.length) return '';
  const order: string[] = [];
  for (const r of model.records) for (const id of r.act.path) if (!order.includes(id)) order.push(id);
  const unseen = study.screens.map(s => s.id).filter(id => !order.includes(id));
  const ids = [...order, ...unseen].slice(0, HEATMAP_MAX_COLS);
  const skipped = order.length + unseen.length - ids.length;
  const head = ids.map(id => `<span class="rc-hm-col" title="${esc(screenTitle(study, id))}"><span>${esc(shorten(screenTitle(study, id), 9))}</span></span>`).join('');
  const rows = recs.map(r => {
    const p = study.personas.find(x => x.id === r.id), kind = outcome(r) as Kind, pid = pidOf(study, r);
    const face = p ? portraitMarkup(displayAttributes(p.attributes), 'rc-face') : '';
    const cells = ids.map(id => {
      const at = r.act.path.indexOf(id), title = `${pid} · ${screenTitle(study, id)}`;
      if (at < 0) return `<span class="rc-hm-cell is-none" title="${esc(`${title}: 방문하지 않음`)}"></span>`;
      const isEnd = r.act.end.screen === id && at === r.act.path.length - 1;
      const tone = isEnd ? (kind === 'complete' ? 'go' : kind === 'drop' ? 'stop' : 'sys') : 'pass';
      return `<span class="rc-hm-cell is-${tone}" title="${esc(`${title}: ${at + 1}번째${isEnd ? ` · ${KIND_LABEL[kind]}` : ''}`)}">${at + 1}</span>`;
    }).join('');
    return `<div class="rc-hm-row"><span class="rc-label rc-who">${face}<span class="rc-name"><b>${esc(pid)}</b><small>${KIND_LABEL[kind]}</small></span></span>${cells}</div>`;
  }).join('');
  const legend = '<div class="rc-legend"><span><i class="rc-key is-flow"></i>지나감</span><span><i class="rc-key is-complete"></i>목표 도달</span><span><i class="rc-key is-drop"></i>멈춤</span><span><i class="rc-key is-system"></i>횟수까지</span><span><i class="rc-key is-none"></i>방문 없음</span></div>';
  const more = `${skipped > 0 ? `<p class="rc-more">그 외 ${skipped}개 화면은 표에서 확인하세요.</p>` : ''}${model.records.length > recs.length ? `<p class="rc-more">외 ${model.records.length - recs.length}명은 기록 탭에서 확인하세요.</p>` : ''}`;
  return `<section class="rc-card rc-wide"><h3>사람 × 화면</h3><p class="rc-sub">칸의 숫자는 그 화면을 몇 번째로 봤는지예요. 빗금 칸은 그 사람이 가지 않은 화면이에요.</p>${legend}<div class="rc-hm-scroll"><div class="rc-hm" style="--cols:${ids.length}"><div class="rc-hm-head"><span></span>${head}</div>${rows}</div></div>${more}</section>`;
}

/** 점수를 매기지 않고 기록에서 나온 사실로만 화면을 묶는다. */
function screenTiers(study: Study, model: Model) {
  if (!study.screens.length) return '';
  // 화면별 문제 관찰: 몇 명이 적었는지, 가장 무거운 심각도가 무엇인지. 가벼운 관찰 한 건만으로는 '다시 볼 화면'으로 올리지 않는다.
  const SEV: Record<string, number> = { minor: 1, moderate: 2, blocking: 3 };
  const issues = new Map<string, { people: Set<number>; worst: number }>();
  for (const e of model.evaluation) {
    if (e.polarity !== 'issue') continue;
    const row = issues.get(e.screen) || { people: new Set<number>(), worst: 0 };
    for (const p of e.people) row.people.add(p.record.id);
    row.worst = Math.max(row.worst, SEV[e.severity || ''] || 1);
    issues.set(e.screen, row);
  }
  const tiers: { cls: string; title: string; note: string; items: string[] }[] = [
    { cls: 't-stop', title: '다시 볼 화면', note: '멈춘 사람이 있거나, 보통 이상의 문제 또는 2명 이상의 문제 관찰이 있어요', items: [] },
    { cls: 't-sys', title: '확인이 필요한 화면', note: '횟수까지 끝났거나, 못 본 화면이거나, 한 명이 가벼운 문제를 적었어요', items: [] },
    { cls: 't-go', title: '무난했던 화면', note: '멈춤이나 문제 관찰이 없었어요', items: [] },
  ];
  for (const c of model.coverage) {
    const name = screenTitle(study, c.screen.id), meta = c.arrived ? `도착 ${c.arrived}${c.stopped ? ` · 멈춤 ${c.stopped}` : ''}` : '방문 없음';
    const chip = `<li title="${esc(`${name}: ${meta}`)}"><b>${esc(shorten(name, 14))}</b><small>${esc(meta)}</small></li>`;
    const issue = issues.get(c.screen.id);
    const rework = c.stopped > 0 || (issue !== undefined && (issue.worst >= 2 || issue.people.size >= 2));
    const check = c.system > 0 || !c.arrived || issue !== undefined;
    const tier = rework ? tiers[0] : check ? tiers[1] : tiers[2];
    tier.items.push(chip);
  }
  const cols = tiers.map(t => `<div class="rc-tier ${t.cls}"><header><h4>${t.title}<em>${t.items.length}</em></h4><p>${t.note}</p></header>${t.items.length ? `<ul>${t.items.join('')}</ul>` : '<p class="rc-none">해당하는 화면이 없어요</p>'}</div>`).join('');
  return `<section class="rc-card rc-wide"><h3>화면 분류</h3><p class="rc-sub">점수가 아니라 기록에서 나온 분류예요. 먼저 볼 화면부터 확인하세요.</p><div class="rc-tiers">${cols}</div></section>`;
}

/** 표로 보기에 들어갈 사람별 경로. */
export function journeyRows(study: Study, model: Model): (string | number)[][] {
  return model.records.map(r => [pidOf(study, r), r.act.path.map(s => screenTitle(study, s)).join(' → '), KIND_LABEL[outcome(r) as Kind]]);
}

export function journeyMarkup(study: Study, model: Model) {
  return { flow: flowChart(study, model), tiers: screenTiers(study, model), heatmap: heatmap(study, model) };
}
