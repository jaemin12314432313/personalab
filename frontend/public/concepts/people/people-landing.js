// frontend/src/studio/model.ts
var e = {
	UNCLEAR_PURPOSE: "목적이 불분명함",
	TOO_MANY_STEPS: "복잡한 절차",
	PRIVACY: "개인정보 요구",
	PRICE: "가격 부담",
	TRUST: "신뢰 부족",
	FEATURE_MISSING: "필요한 기능 없음",
	SWITCHING_COST: "전환 부담",
	NAVIGATION_LOST: "경로를 찾지 못함",
	MAX_TURNS: "탐색 상한 도달"
}, t = [
	{
		id: "S01",
		label: "온보딩",
		description: "흩어진 일정을 자동으로 정리합니다. 오늘 할 일을 한눈에 확인하세요.",
		elements: [{
			text: "시작하기",
			to: "S02"
		}]
	},
	{
		id: "S02",
		label: "회원가입",
		description: "이메일, 비밀번호, 휴대폰 번호 인증을 입력합니다.",
		elements: [{
			text: "다음",
			to: "S03"
		}, {
			text: "뒤로",
			to: "S01"
		}]
	},
	{
		id: "S03",
		label: "학교·학년",
		description: "학교, 학년, 전공을 입력합니다.",
		elements: [{
			text: "다음",
			to: "S04"
		}, {
			text: "건너뛰기",
			to: "S04"
		}]
	},
	{
		id: "S04",
		label: "관심분야",
		description: "관심분야를 5개 이상 선택합니다.",
		elements: [{
			text: "완료",
			to: "S05"
		}, {
			text: "건너뛰기",
			to: "S05"
		}]
	},
	{
		id: "S05",
		label: "홈",
		description: "오늘의 일정과 우선순위를 확인합니다.",
		elements: []
	}
], n = [
	{
		id: "P938",
		age: 32,
		concern: "UNCLEAR_PURPOSE",
		drop: "TOO_MANY_STEPS",
		intention: 3,
		wtp: 3e3,
		ask: "시간에 쫓기는 직장인으로서 일정 관리가 중요하지만, 대학생용이라고 해서 나한테 얼마나 맞을지 조금 애매하네.",
		act: "바빠 죽겠는데 회원가입에 인증 절차가 너무 복잡해서 그냥 안 할래요."
	},
	{
		id: "P069",
		age: 29,
		concern: "PRIVACY",
		drop: "PRIVACY",
		intention: 2,
		wtp: 0,
		ask: "개인 일정을 정리하는 건데 프라이버시가 걱정되기도 하고, 이미 노션을 쓰고 있어서 굳이 바꿀 이유를 모르겠어.",
		act: "회원가입하는데 왜 이렇게 개인정보를 많이 요구하는지 모르겠어서 그냥 그만둘래요."
	},
	{
		id: "P392",
		age: 27,
		concern: "PRIVACY",
		drop: "PRIVACY",
		intention: 2,
		wtp: 0,
		ask: "사생활 기록이 담기는 거라 보안이나 개인정보 보호가 걱정돼서 잘 안 쓰게 될 것 같아.",
		act: "개인정보를 너무 많이 입력하라고 해서 찝찝하니까 그만둘래."
	},
	{
		id: "P563",
		age: 34,
		concern: "PRICE",
		drop: "PRIVACY",
		intention: 2,
		wtp: 0,
		ask: "예산이 넉넉하지 않아서 유료 구독까지 하면서 쓰고 싶진 않고, 지금 쓰는 네이버 캘린더로도 충분하거든요.",
		act: "아니 회원가입하는데 휴대폰 번호 인증까지 해야 되나, 개인정보 털릴 것 같아서 그냥 찜찜하네."
	},
	{
		id: "P374",
		age: 27,
		concern: "PRIVACY",
		drop: "PRIVACY",
		intention: 2,
		wtp: 0,
		ask: "개인 일정을 다른 곳에 모아두는 게 찜찜하고, 네이버 캘린더를 이미 잘 쓰고 있어서 굳이 바꿀 이유를 모르겠어요.",
		act: "회원가입에 휴대폰 번호까지 요구하는 건 개인정보 측면에서 좀 찝찝하네."
	}
], r = {
	id: "recorded-demo-v2",
	name: "일정메이트 온보딩",
	created: "2026-10-13T00:00:00.000Z",
	source: "demo",
	status: "done",
	product: {
		name: "일정메이트",
		description: "대학생의 수업, 과제, 동아리 일정을 한곳에서 정리하고 오늘 할 일의 우선순위를 추천합니다.",
		features: [
			"자동 정리",
			"우선순위 추천",
			"캘린더 연동",
			"친구 공유",
			"알림 설정"
		],
		price: "기본 무료"
	},
	screens: t,
	task: "회원가입을 완료하세요",
	goal: "S05",
	conditions: {
		preset: "30s_office",
		age: "27-34",
		price: []
	},
	count: 5,
	seed: 42,
	personas: n.map((e, t) => ({
		id: t + 1,
		attributes: {
			profile: {
				age: e.age,
				job_group: "직장인"
			},
			card_text: `${e.age}세 직장인. 복구한 데모 리포트에 포함된 페르소나입니다.`,
			traits: {},
			source: { persona_id: e.id }
		}
	})),
	results: n.map((e, t) => ({
		id: t + 1,
		persona_id: e.id,
		ask: {
			usage_intention: e.intention,
			willingness_to_pay: e.wtp,
			concern: e.concern,
			needed_features: [],
			unneeded_features: [],
			reason: e.ask
		},
		act: {
			path: ["S01", "S02"],
			events: [{
				turn: 1,
				screen: "S01",
				action: "click",
				target: "시작하기",
				to: "S02"
			}, {
				turn: 2,
				screen: "S02",
				action: "abandon",
				target: null,
				reason: e.act,
				drop_reason: e.drop
			}],
			end: {
				result: "drop",
				screen: "S02",
				drop_reason: e.drop
			}
		}
	}))
};
function i(e) {
	return e.attributes.source.persona_id || `P${String(e.id).padStart(3, "0")}`;
}
// frontend/src/mockup/ReportModel.ts
var a = [
	"왜 이 화면에서 멈췄나요?",
	"어떤 경로로 이동했나요?",
	"어느 화면까지 확인했나요?"
], o = (e) => e.reportSource === "ui-mock" ? "ui-mock" : e.source === "demo" ? "saved-ai-demo" : "server-act-records", s = (e) => e.reportSource === "ui-mock" ? "UI 목데이터" : e.source === "demo" ? "저장된 AI 데모" : "저장된 AI 탐색 기록", c = (e, t) => e.screens.find((e) => e.id === t)?.label || t || "화면 정보 없음", l = (e) => e?.act ? e.act.end.result === "complete" ? "complete" : e.act.end.drop_reason === "MAX_TURNS" ? "system" : "drop" : "pending", u = (e) => ({
	complete: "목표 도달",
	drop: "탐색 중단",
	system: "탐색 한도",
	pending: "결과 없음"
})[l(e)], d = (t) => e[t || ""] || "이유 미기록", f = (e) => ({
	PRIVACY: "각 정보가 필요한 이유와 보관 범위를 안내하고, 필수 입력을 줄일 수 있는지 확인하세요.",
	TOO_MANY_STEPS: "첫 이용에 꼭 필요한 절차만 남기거나 나중에 완료할 수 있는지 확인하세요.",
	UNCLEAR_PURPOSE: "이 화면에서 할 일과 다음 단계에서 얻을 것을 문구로 설명해 보세요.",
	TRUST: "불안을 언급한 문장과 연결해 서비스 주체와 처리 과정을 충분히 설명하는지 확인하세요.",
	PRICE: "금액 자체를 평가하기보다, 비용이 발생하는 시점과 조건이 화면에 명확한지 확인하세요.",
	FEATURE_MISSING: "목표에 필요한 기능이 화면에서 발견되는지, 관련 안내와 진입점을 확인하세요.",
	SWITCHING_COST: "기존 이용 방식에서 이어올 수 있는 정보와 전환 절차를 안내하는지 확인하세요.",
	NAVIGATION_LOST: "화면 간 연결과 현재 위치 안내를 확인하세요. 반복 방문 차단으로 끝났을 가능성도 기록과 함께 살펴보세요."
})[e] || "해당 화면의 문구와 연결을 원문 기록에 대조해 확인하세요.";
function p(e) {
	let t = e.results.filter((e) => !!e.act), n = t.filter((e) => l(e) === "complete"), r = t.filter((e) => l(e) === "drop"), i = t.filter((e) => l(e) === "system"), a = /* @__PURE__ */ new Set([...e.personas.map((e) => e.id), ...e.results.map((e) => e.id)]), o = [...a].filter((e) => !t.some((t) => t.id === e)), s = new Set(t.flatMap((e) => e.act.path)), c = /* @__PURE__ */ new Map();
	for (let e of r) {
		let t = e.act.end.screen || "", n = e.act.end.drop_reason || "", r = JSON.stringify([t, n]);
		c.has(r) || c.set(r, {
			key: r,
			screen: t,
			code: n,
			records: []
		}), c.get(r).records.push(e);
	}
	let u = [...c.values()].sort((e, t) => t.records.length - e.records.length), d = e.screens.map((e) => ({
		screen: e,
		arrived: t.filter((t) => t.act.path.includes(e.id)).length,
		stopped: r.filter((t) => t.act.end.screen === e.id).length,
		system: i.filter((t) => t.act.end.screen === e.id).length
	}));
	return {
		records: t,
		complete: n,
		dropped: r,
		system: i,
		pending: o,
		total: a.size,
		visited: s,
		findings: u,
		coverage: d
	};
}
function m(e, t, n) {
	let r = e.results.find((e) => e.id === t), a = e.personas.find((e) => e.id === t);
	if (!r?.act) return "이 페르소나의 탐색 결과가 아직 없습니다. 방문한 화면이나 중단 이유를 확인할 수 없습니다.";
	let o = (t) => `${t} ${c(e, t)}`, s = e.screens.filter((e) => !r.act.path.includes(e.id));
	if (/어느|어디까지|범위|미확인/.test(n) || s.some((e) => n.includes(e.id) || n.includes(e.label))) return `확인한 화면은 ${r.act.path.map(o).join(", ")}입니다.\n${s.length ? `방문하지 않은 화면: ${s.map((e) => o(e.id)).join(", ")}. 이 화면의 경험은 기록으로 답할 수 없습니다.` : "등록된 모든 화면을 방문했지만, 모든 요소를 평가했다는 뜻은 아닙니다."}\n\n근거: 이 페르소나의 저장된 탐색 경로.`;
	if (/경로|들어|이동|눌|클릭/.test(n)) return `${a ? i(a) : r.persona_id}의 경로는 ${r.act.path.map(o).join(" → ")}입니다.\n${r.act.events.filter((e) => e.action === "click").map((e) => `${o(e.screen)}에서 “${e.target}” 선택${e.to ? ` → ${o(e.to)}` : ""}.`).join("\n")}\n\n근거: 저장된 이동 기록. 그 외의 행동은 기록에 없습니다.`;
	if (l(r) === "system") return "탐색 횟수 한도에 도달해 종료됐습니다. 이를 페르소나의 불편이나 자발적인 이탈로 해석하지 않습니다.\n\n근거: 종료 코드 MAX_TURNS. 기록의 경로와 실행 범위를 다시 확인하세요.";
	if (l(r) === "complete") return `이 페르소나는 ${o(r.act.end.screen || e.goal)}에 도달했습니다. 중단 이유는 없습니다.\n\n근거: 저장된 목표 도달 기록. 목표 도달만으로 만족도나 모든 화면의 사용성을 판단하지 않습니다.`;
	let u = [...r.act.events].reverse().find((e) => e.action === "abandon");
	return `${/왜|이유|중단|멈|불편|복잡/.test(n) ? "" : "새 답변은 생성하지 않습니다. 확인할 수 있는 기록을 보여드립니다.\n\n"}${o(r.act.end.screen || "")}에서 남긴 원문입니다.\n${u?.reason ? `“${u.reason}”` : "중단 이유 문장이 기록되지 않았습니다."}\n\n분류: ${d(r.act.end.drop_reason)}. 근거: 저장된 중단 기록. 추가 해석이나 수정안의 효과는 확인하지 않았습니다.`;
}
// frontend/src/mockup/ReportExport.ts
function h(e) {
	let t = p(e);
	return {
		format: "personalab-ux-report-v1",
		exported_at: (/* @__PURE__ */ new Date()).toISOString(),
		source: o(e),
		response_label: e.reportSource === "ui-mock" ? "UI Mock Data" : "Synthetic User Response",
		name: e.name,
		product: {
			name: e.product.name,
			description: e.product.description
		},
		task: e.task,
		goal: e.goal,
		screens: e.screens,
		summary: {
			records: t.records.length,
			panel: t.total,
			complete: t.complete.length,
			dropped: t.dropped.length,
			system: t.system.length,
			pending: t.pending.length
		},
		findings: t.findings.map((e) => ({
			screen: e.screen,
			code: e.code,
			persona_ids: e.records.map((e) => e.persona_id),
			count: e.records.length,
			denominator: t.records.length,
			hypothesis: f(e.code)
		})),
		personas: e.personas.map((e) => ({
			id: e.id,
			persona_id: i(e),
			attributes: e.attributes
		})),
		results: e.results.map((e) => ({
			id: e.id,
			persona_id: e.persona_id,
			act: e.act
		})),
		limits: [
			"실제 사용자 조사 결과가 아닙니다.",
			"화면 설명과 버튼 연결 기반입니다. 체류 시간·시선은 측정하지 않습니다.",
			"수정 제안은 검증되지 않은 확인 가설입니다.",
			...e.reportSource === "ui-mock" ? ["직접 구성한 UI 목데이터입니다. 실제 AI 실행 결과가 아닙니다."] : e.source === "demo" ? ["저장된 AI 기록을 재생한 데모이며 새 LLM 실행이 아닙니다."] : []
		]
	};
}
function g(e) {
	let t = p(e);
	return [
		`# ${e.product.name || e.name} · UI·UX 탐색 기록`,
		"",
		`> ${s(e)}${e.source === "demo" ? " · 새 LLM 실행이 아닙니다." : ""}`,
		e.reportSource === "ui-mock" ? "> UI 목데이터 · 실제 실행 결과가 아닙니다." : "> Synthetic User Response · 실제 사용자 결과가 아닙니다.",
		"",
		`- 사용 흐름: ${e.task}`,
		`- 확인한 기록: ${t.records.length}/${t.total}명`,
		`- 목표 도달: ${t.complete.length}/${t.records.length}명`,
		`- 사용자 중단: ${t.dropped.length}명 / 탐색 한도: ${t.system.length}명 / 결과 없음: ${t.pending.length}명`,
		`- 확인한 화면: ${t.coverage.filter((e) => e.arrived).length}/${e.screens.length}개`,
		`- 미확인: ${t.coverage.filter((e) => !e.arrived).map((e) => e.screen.id + " " + e.screen.label).join(", ") || "없음"}`,
		"",
		"## 핵심 발견",
		...t.findings.flatMap((n) => [
			"",
			`### ${n.screen} ${c(e, n.screen)} · ${d(n.code)}`,
			`- 근거: ${n.records.map((e) => e.persona_id).join(", ")} (${n.records.length}/${t.records.length}명)`,
			`- 다음 확인 가설: ${f(n.code)}`
		]),
		"",
		"## 페르소나별 근거",
		...e.personas.flatMap((t) => {
			let n = e.results.find((e) => e.id === t.id);
			return [
				"",
				`### ${i(t)}`,
				`- 종료: ${u(n)}${n?.act?.end.drop_reason ? " · " + d(n.act.end.drop_reason) : ""}`,
				`- 경로: ${n?.act?.path.join(" → ") || "기록 없음"}`,
				...n?.act?.events.filter((e) => e.reason).map((e) => `- ${e.screen}: ${e.reason}`) || []
			];
		}),
		"",
		"## 해석 범위",
		"방문하지 않은 화면은 평가하지 않습니다. 화면 설명과 버튼 연결에 기반하며 체류 시간·시선·만족도는 측정하지 않습니다. 수정 제안의 효과는 별도 테스트로 확인해야 합니다."
	].join("\n");
}
function _(e, t) {
	let n = t === "json" ? JSON.stringify(h(e), null, 2) : g(e), r = new Blob([n], { type: t === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8" }), i = URL.createObjectURL(r), a = document.createElement("a");
	a.href = i, a.download = `PersonaLab-${(e.product.name || "report").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")}.${t}`, document.body.append(a), a.click(), a.remove(), setTimeout(() => URL.revokeObjectURL(i), 1e3);
}
// frontend/src/mockup/ReportView.ts
var v = (e) => String(e ?? "").replace(/[&<>"']/g, (e) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
})[e]), y = 0;
function b(e, t, n = {}) {
	let o = `report-${++y}`, h = t, g = p(h), b = "overview", x = 0, S = g.findings[0]?.records[0]?.id || g.records[0]?.id || h.personas[0]?.id || 0, C = "", w = -1, T = "all", E = n.chats || {}, D = {}, O = () => h.results.find((e) => e.id === S);
	function k() {
		let e = O();
		C = e?.act?.end.screen || e?.act?.path.at(-1) || h.screens[0]?.id || "", w = e?.act ? e.act.events.map((e) => e.screen === C).lastIndexOf(!0) : -1;
	}
	k();
	let A = () => h.reportSource === "ui-mock" ? "화면 구성을 확인하기 위해 직접 만든 데이터입니다. 실제 실행 결과가 아닙니다." : h.source === "demo" ? "저장된 탐색 기록입니다. 새 AI 실행이나 실제 사용자 조사 결과가 아닙니다." : "화면 설명과 버튼 연결을 탐색한 AI 기록입니다. 실제 사용자 응답과 구분하세요.";
	function j(e, t = !1) {
		let n = h.personas.find((t) => t.id === e), a = h.id === r.id ? r.personas.findIndex((t) => t.id === e) : -1;
		return `<span class="rv-avatar ${t ? "large" : ""} ${a >= 0 ? "photo" : ""}" aria-hidden="true" ${a >= 0 ? `style="background-position:${a * 25}% center"` : ""}>${a < 0 ? v((n ? i(n) : "AI").slice(-2)) : ""}</span>`;
	}
	let M = (e) => `<span class="rv-badge ${l(e)}">${u(e)}</span>`;
	function N(e, t = "person") {
		return e.map((e) => {
			let n = h.personas.find((t) => t.id === e);
			return `<button type="button" class="rv-person-chip" data-rv-${t}="${e}" data-rv-focus="${t}-${e}" aria-pressed="${S === e}">${j(e)}<span>${v(n ? i(n) : h.results.find((t) => t.id === e)?.persona_id)}</span></button>`;
		}).join("");
	}
	function P() {
		let e = g.findings[0], t = e ? g.dropped.filter((t) => t.act.end.screen === e.screen).length : 0, r = g.records.length ? e ? `${c(h, e.screen)}에서 ${t}명의 탐색이 멈췄어요.` : g.system.length ? "탐색 한도에 도달한 기록을 확인하세요." : `${g.complete.length}명이 목표 화면에 도달했어요.` : "탐색 결과를 기다리고 있어요.";
		return `<header class="rv-heading"><div><span class="rv-eyebrow">RESULTS / ${v(h.product.name || h.name)}</span><h1>${v(r)}</h1><p>${v(h.task || "등록된 화면의 UI·UX 탐색")}</p></div><div class="rv-toolbar">${n.onReplay ? `<button type="button" class="btn" data-rv-replay ${g.records.length ? "" : "disabled"}>기록 재생 ▷</button>` : ""}<details class="rv-export"><summary class="btn">내보내기 ↓</summary><div><button type="button" data-rv-export="md">리포트 · Markdown</button><button type="button" data-rv-export="json">원본 기록 · JSON</button></div></details></div></header>
    <div class="rv-source"><span>${v(s(h))}</span><p>${A()}</p></div>
    <div class="rv-metrics" aria-label="탐색 결과 요약"><div><span>확인한 기록</span><strong>${g.records.length}<small> / ${g.total}명</small></strong></div><div><span>목표 도달</span><strong>${g.complete.length}<small> / ${g.records.length}명</small></strong></div><div><span>탐색 중단</span><strong>${g.dropped.length}<small>명</small></strong></div><div><span>방문한 화면</span><strong>${g.coverage.filter((e) => e.arrived).length}<small> / ${h.screens.length}개</small></strong></div></div>
    ${g.system.length || g.pending.length ? `<div class="rv-partial" role="status">${g.system.length ? `탐색 한도 종료 <b>${g.system.length}명</b> · ` : ""}${g.pending.length ? `결과 없음 <b>${g.pending.length}명</b> · ` : ""}사용자 이탈과 구분해서 확인하세요.${h.status === "failed" ? " 실행 상태: 확인 필요." : h.status === "running" ? " 실행 중이며 결과가 추가될 수 있습니다." : ""}</div>` : ""}`;
	}
	function F() {
		let e = O(), t = h.personas.find((e) => e.id === S), n = h.screens.find((e) => e.id === C), r = e?.act?.events[w], a = !!e?.act?.path.includes(C);
		return `<section class="rv-evidence" aria-label="선택한 화면과 근거"><header><div><span class="rv-eyebrow">SCREEN & EVIDENCE</span><h2>${v(c(h, C))} <small>${v(C)}</small></h2></div><span class="rv-badge ${a ? "" : "pending"}">${a ? "방문 기록 있음" : "이 페르소나의 방문 기록 없음"}</span></header>
      <div class="rv-evidence-body"><div class="rv-screen"><div class="rv-screen-bar"><span>${v(h.product.name)}</span><span>화면 구조</span></div><div class="rv-screen-content"><span class="rv-screen-id">${v(C)}</span><h3>${v(n?.label || "등록 화면 없음")}</h3><p>${v(n?.description || "등록된 화면 설명이 없습니다.")}</p><div class="rv-screen-buttons">${n?.elements.map((e) => `<div class="${r?.action === "click" && r.target === e.text && r.screen === C ? "selected" : ""}"><span>${v(e.text)}</span><small>${e.to ? `→ ${v(c(h, e.to))}` : "이동 연결 없음"}</small></div>`).join("") || "<div class=\"rv-screen-end\">등록된 이동 버튼 없음</div>"}</div></div><footer>등록된 설명·버튼을 정리한 미리보기<br>실제 스크린샷이나 시각 평가 결과가 아닙니다.</footer></div>
      <div class="rv-quote-panel"><div class="rv-identity">${j(S, !0)}<div><strong>${v(t ? i(t) : e?.persona_id || "기록 없음")}</strong><span>${t ? `${t.attributes.profile.age}세 · ${v(t.attributes.profile.job_group)}` : "프로필 정보 없음"}</span></div></div><span class="rv-eyebrow">${r?.reason && a ? "이 화면에서 남긴 원문" : "이 장면의 기록"}</span><blockquote>${a ? r?.reason ? `“${v(r.reason)}”` : l(e) === "system" && C === e?.act?.end.screen ? "탐색 횟수 한도로 종료됐습니다. 불편을 나타내는 원문은 없습니다." : l(e) === "complete" && C === e?.act?.end.screen ? "목표 화면에 도달했습니다. 이 화면에 대한 별도 발화는 없습니다." : r?.action === "click" ? `“${v(r.target)}” 버튼을 선택했습니다. 선택 이유 문장은 기록되지 않았습니다.` : "이 화면의 추가 발화가 기록되지 않았습니다." : "이 페르소나는 이 화면을 방문하지 않았습니다."}</blockquote><small>${h.reportSource === "ui-mock" ? "직접 구성한 UI 예시 문장" : "Synthetic User Response · 저장된 원문"}</small>${a ? `<button type="button" class="rv-text-link" data-rv-interview="${S}">이 기록에 대해 물어보기 ↗</button>` : ""}</div></div>
      <div class="rv-timeline"><span>탐색 경로</span><div>${e?.act?.path.map((t, n) => `<button type="button" data-rv-screen="${v(t)}" data-rv-focus="screen-${n}" aria-pressed="${C === t}"><small>${v(t)}</small>${v(c(h, t))}${n < e.act.path.length - 1 ? " <i>→</i>" : ""}</button>`).join("") || "<p>아직 경로가 없습니다.</p>"}</div></div>
      ${e?.act?.events.filter((e) => e.screen === C).length > 1 ? `<div class="rv-turns">${e.act.events.map((e, t) => e.screen === C ? `<button type="button" data-rv-event="${t}" aria-pressed="${t === w}">${e.turn}턴 · ${e.action === "click" ? "선택" : "중단"}</button>` : "").join("")}</div>` : ""}</section>`;
	}
	function I() {
		return `<section class="rv-coverage"><div class="rv-section-heading"><div><span class="rv-eyebrow">EXPLORATION COVERAGE</span><h2>어디까지 확인했나요?</h2></div><p>방문하지 않은 화면은 평가하지 않습니다.</p></div><div class="rv-coverage-grid">${g.coverage.map(({ screen: e, arrived: t, stopped: n, system: r }) => `<button type="button" data-rv-coverage="${v(e.id)}" data-rv-focus="coverage-${v(e.id)}" class="${t ? "" : "unvisited"}"><span>${v(e.id)} ${e.id === h.goal ? "<b>목표</b>" : ""}</span><strong>${v(e.label)}</strong><small>${t ? `${t}명 방문` : "미확인"}${n ? ` · ${n}명 중단` : ""}${r ? ` · ${r}명 한도 종료` : ""}</small></button>`).join("")}</div></section>`;
	}
	function L() {
		let e = g.findings[x];
		return `<div class="rv-findings-layout"><section class="rv-findings"><div class="rv-section-heading"><div><span class="rv-eyebrow">KEY FINDINGS</span><h2>먼저 살펴볼 지점 <small>${g.findings.length}</small></h2></div></div><p class="rv-muted">같은 화면·중단 이유로 묶었어요.<br>관련 인원이 많은 순서입니다.</p><div class="rv-issue-list">${g.findings.map((e, t) => `<button type="button" data-rv-finding="${t}" data-rv-focus="finding-${t}" aria-pressed="${t === x}"><span class="rv-issue-top"><span>${String(t + 1).padStart(2, "0")} / ${v(c(h, e.screen))}</span><span>↗</span></span><strong>${v(d(e.code))}</strong><span class="rv-issue-count">${e.records.length}<small> / ${g.records.length}명에서 기록</small></span><span class="rv-mini-bar" aria-hidden="true"><i style="width:${g.records.length ? e.records.length / g.records.length * 100 : 0}%"></i></span></button>`).join("") || "<div class=\"rv-empty-small\">집계할 사용자 중단 기록이 없습니다. 목표 도달과 탐색 한도를 함께 확인하세요.</div>"}</div>
      ${e ? `<div class="rv-related"><span class="rv-eyebrow">관련 페르소나</span><div>${N(e.records.map((e) => e.id))}</div></div><div class="rv-hypothesis"><span>다음 확인 제안</span><p>${v(f(e.code))}</p><small>원문에서 이어지는 검토 가설입니다.<br>수정 효과는 별도 테스트로 확인하세요.</small></div>` : ""}</section>${F()}</div>${I()}`;
	}
	function R() {
		let e = [...h.personas.map((e) => ({
			id: e.id,
			label: i(e),
			profile: `${e.attributes.profile.age}세 · ${e.attributes.profile.job_group}`
		})), ...h.results.filter((e) => !h.personas.some((t) => t.id === e.id)).map((e) => ({
			id: e.id,
			label: e.persona_id,
			profile: "프로필 정보 없음"
		}))], t = e.filter((e) => T === "all" || l(h.results.find((t) => t.id === e.id)) === T);
		return `<section class="rv-records"><div class="rv-section-heading"><div><h2>한 사람의 경로를 따라가 보세요.</h2><p>목표 도달, 탐색 중단, 시스템 종료를 구분했습니다.</p></div><label class="rv-filter">종료 상태 <select data-rv-filter><option value="all">전체 ${e.length}명</option>${[
			"complete",
			"drop",
			"system",
			"pending"
		].map((e) => `<option value="${e}" ${T === e ? "selected" : ""}>${{
			complete: "목표 도달",
			drop: "탐색 중단",
			system: "탐색 한도",
			pending: "결과 없음"
		}[e]}</option>`).join("")}</select></label></div><div class="rv-record-table"><table><thead><tr><th scope="col">페르소나</th><th scope="col">탐색 경로</th><th scope="col">종료 상태</th><th scope="col"><span class="sr-only">기록 선택</span></th></tr></thead><tbody>${t.map((e) => {
			let t = h.results.find((t) => t.id === e.id);
			return `<tr class="${S === e.id ? "selected" : ""}"><td><div class="rv-record-person">${j(e.id)}<div><strong>${v(e.label)}</strong><small>${v(e.profile)}</small></div></div></td><td><div class="rv-table-path">${t?.act?.path.map((e) => `<span title="${v(c(h, e))}">${v(e)}</span>`).join("<i>→</i>") || "경로 없음"}</div><small>${t?.act ? v(c(h, t.act.end.screen)) : "결과를 받지 못했습니다."}</small></td><td>${M(t)}${l(t) === "drop" ? `<small>${v(d(t?.act?.end.drop_reason))}</small>` : ""}</td><td><button type="button" class="rv-text-link" data-rv-record="${e.id}" data-rv-focus="record-${e.id}" aria-label="${v(e.label)} 기록 보기">기록 보기 ↗</button></td></tr>`;
		}).join("") || "<tr><td colspan=\"4\">이 상태의 페르소나가 없습니다.</td></tr>"}</tbody></table></div></section><div class="rv-record-evidence">${F()}</div>`;
	}
	function z() {
		let e = h.personas.find((e) => e.id === S), t = O(), n = E[S] || [];
		return `<section class="rv-interview"><div class="rv-section-heading"><div><span class="rv-eyebrow">FOLLOW-UP</span><h2>그 선택의 이유를 이어서 확인하세요.</h2><p>질문에 맞는 원문과 경로를 찾아 보여줍니다.</p></div><span class="rv-badge">기록 기반 답변 · 새 AI 대화 없음</span></div><div class="rv-interview-layout"><aside class="rv-interview-context"><span class="rv-eyebrow">선택한 페르소나</span><div class="rv-identity">${j(S, !0)}<div><strong>${v(e ? i(e) : t?.persona_id || "기록 없음")}</strong><span>${e ? `${e.attributes.profile.age}세 · ${v(e.attributes.profile.job_group)}` : ""}</span></div></div>${M(t)}<p>${v(t?.act?.path.map((e) => c(h, e)).join(" → ") || "탐색 기록 없음")}</p><button type="button" class="rv-text-link" data-rv-back-evidence>화면과 원문 보기 ↗</button><div class="rv-related"><span class="rv-eyebrow">다른 페르소나</span><div>${N(h.personas.map((e) => e.id), "chat-person")}</div></div>${e ? `<details class="rv-profile"><summary>페르소나 카드</summary><p>${v(e.attributes.card_text)}</p></details>` : ""}</aside><div class="rv-conversation"><div class="rv-chat-intro"><span>대화의 기준</span><p>이 테스트에서 선택한 페르소나가 남긴 기록만 참조합니다. 보지 않은 화면이나 기록에 없는 경험을 만들어 답하지 않습니다.</p></div><div class="rv-messages" aria-live="polite" aria-label="기록 기반 후속 질문">${n.map((n) => `<article class="rv-question"><span>내 질문</span><p>${v(n.question)}</p></article><article class="rv-answer"><span>${v(e ? i(e) : t?.persona_id)} · 기록에서 찾은 답변</span><p>${v(n.answer)}</p></article>`).join("") || "<div class=\"rv-chat-empty\"><strong>기록에서 궁금했던 점이 있나요?</strong><p>아래 질문으로 시작해 보세요.</p></div>"}</div><div class="rv-question-chips">${a.map((e, t) => `<button type="button" data-rv-question="${t}">${v(e)} ↗</button>`).join("")}</div><form data-rv-form><label class="sr-only" for="${o}-question">이 기록에 질문하기</label><textarea id="${o}-question" data-rv-input maxlength="500" rows="2" placeholder="예: 어느 화면까지 확인했나요?" required>${v(D[S] || "")}</textarea><button type="submit" class="btn solid">기록에서 답 찾기 ↑</button></form><p class="rv-chat-foot">새 LLM 호출 없이 기록을 조회합니다. 원본 결과는 바뀌지 않습니다.</p></div></div></section>`;
	}
	function B(t) {
		let r = t || document.activeElement?.dataset?.rvFocus;
		e.innerHTML = `<div class="rv-root">${P()}<nav class="rv-tabs" role="tablist" aria-label="결과 보기 방식">${[
			"overview",
			"records",
			"interview"
		].map((e) => `<button type="button" role="tab" id="${o}-tab-${e}" aria-selected="${b === e}" aria-controls="${o}-panel" tabindex="${b === e ? 0 : -1}" data-rv-tab="${e}" data-rv-focus="tab-${e}">${{
			overview: "핵심 발견",
			records: "페르소나별 기록",
			interview: "후속 질문"
		}[e]}${e === "overview" ? ` <span>${g.findings.length}</span>` : ""}</button>`).join("")}</nav><div id="${o}-panel" role="tabpanel" aria-labelledby="${o}-tab-${b}" tabindex="-1">${b === "overview" ? L() : b === "records" ? R() : z()}</div><footer class="rv-footer"><div><strong>다음 수정은, 확인한 근거에서.</strong><p>${h.reportSource === "ui-mock" ? "이 예시는 UI 목데이터입니다." : "AI 탐색 결과는 실제 사용자 검증을 위한 단서입니다."} 체류 시간·시선·만족도는 측정하지 않았습니다.</p></div>${n.onNext ? `<button type="button" class="btn solid" data-rv-next>${v(n.nextLabel || "수정본 테스트 만들기")} →</button>` : ""}</footer></div>`, r && e.querySelector(`[data-rv-focus="${CSS.escape(r)}"]`)?.focus({ preventScroll: !0 });
	}
	function V(e, t) {
		(h.personas.some((t) => t.id === e) || h.results.some((t) => t.id === e)) && (S = e, x = g.findings.findIndex((t) => t.records.some((t) => t.id === e)), n.onSelectPersona?.(e), t && (b = t), k(), B());
	}
	function H(t) {
		let r = t.trim().slice(0, 500);
		if (!r) return;
		E = {
			...E,
			[S]: [...E[S] || [], {
				question: r,
				answer: m(h, S, r)
			}].slice(-20)
		}, D[S] = "", n.onChats?.(E), B();
		let i = e.querySelector(".rv-messages");
		i && (i.scrollTop = i.scrollHeight), e.querySelector("[data-rv-input]")?.focus({ preventScroll: !0 });
	}
	function U(t) {
		let r = t.target.closest("button");
		r && e.contains(r) && !r.hasAttribute("disabled") && (r.dataset.rvTab ? (b = r.dataset.rvTab, B()) : r.dataset.rvFinding === void 0 ? r.dataset.rvPerson ? V(Number(r.dataset.rvPerson)) : r.dataset.rvRecord ? V(Number(r.dataset.rvRecord), "records") : r.dataset.rvInterview ? V(Number(r.dataset.rvInterview), "interview") : r.dataset.rvChatPerson ? V(Number(r.dataset.rvChatPerson)) : r.dataset.rvScreen || r.dataset.rvCoverage ? (C = r.dataset.rvScreen || r.dataset.rvCoverage, r.dataset.rvCoverage && (x = -1, S = g.records.find((e) => e.act.path.includes(C))?.id || S), w = O()?.act?.events.map((e) => e.screen === C).lastIndexOf(!0) ?? -1, B()) : r.dataset.rvEvent === void 0 ? r.hasAttribute("data-rv-back-evidence") ? (b = "records", B()) : r.dataset.rvQuestion === void 0 ? r.dataset.rvExport ? _(h, r.dataset.rvExport === "json" ? "json" : "md") : r.hasAttribute("data-rv-replay") ? n.onReplay?.() : r.hasAttribute("data-rv-next") && n.onNext?.() : H(a[Number(r.dataset.rvQuestion)]) : (w = Number(r.dataset.rvEvent), B()) : (x = Number(r.dataset.rvFinding), V(g.findings[x].records[0].id)));
	}
	let W = (t) => {
		let n = t.target;
		n.hasAttribute("data-rv-filter") && (T = n.value, B(), e.querySelector("[data-rv-filter]")?.focus({ preventScroll: !0 }));
	}, G = (e) => {
		let t = e.target;
		t.hasAttribute("data-rv-input") && (D[S] = t.value);
	}, K = (e) => {
		e.target.hasAttribute("data-rv-form") && (e.preventDefault(), H(D[S] || ""));
	}, q = (e) => {
		if (!e.target.closest("[data-rv-tab]") || ![
			"ArrowLeft",
			"ArrowRight",
			"Home",
			"End"
		].includes(e.key)) return;
		e.preventDefault();
		let t = [
			"overview",
			"records",
			"interview"
		], n = t.indexOf(b);
		b = t[e.key === "Home" ? 0 : e.key === "End" ? 2 : (n + (e.key === "ArrowRight" ? 1 : 2)) % 3], B(`tab-${b}`);
	};
	return e.addEventListener("click", U), e.addEventListener("change", W), e.addEventListener("input", G), e.addEventListener("submit", K), e.addEventListener("keydown", q), B(), {
		selectPersona: V,
		update(e) {
			let t = h.id !== e.id;
			h = e, g = p(h), x = Math.min(x, Math.max(0, g.findings.length - 1)), t && (E = {}, D = {}, b = "overview", T = "all"), (t || !h.personas.some((e) => e.id === S)) && (S = g.findings[x]?.records[0]?.id || g.records[0]?.id || h.personas[0]?.id || 0, k()), B();
		},
		dispose() {
			e.removeEventListener("click", U), e.removeEventListener("change", W), e.removeEventListener("input", G), e.removeEventListener("submit", K), e.removeEventListener("keydown", q), e.innerHTML = "";
		}
	};
}
// frontend/src/mockup/ReportFixture.ts
function x() {
	let e = (e, n, r) => {
		let i = e.slice(0, -1).map((n, r) => ({
			turn: r + 1,
			screen: n,
			action: "click",
			target: t.find((e) => e.id === n).elements.find((t) => t.to === e[r + 1]).text,
			to: e[r + 1]
		}));
		return r && i.push({
			turn: e.length,
			screen: e.at(-1),
			action: "abandon",
			target: null,
			reason: r,
			drop_reason: n.drop_reason
		}), {
			path: e,
			end: n,
			events: i
		};
	}, n = [
		{
			age: 24,
			job: "대학생",
			act: e([
				"S01",
				"S02",
				"S03",
				"S04",
				"S05"
			], {
				result: "complete",
				screen: "S05"
			})
		},
		{
			age: 28,
			job: "대학원생",
			act: e(["S01", "S02"], {
				result: "drop",
				screen: "S02",
				drop_reason: "PRIVACY"
			}, "일정을 보기 전에 휴대폰 인증까지 필요한 이유를 찾지 못했어요.")
		},
		{
			age: 22,
			job: "대학생",
			act: e([
				"S01",
				"S02",
				"S03",
				"S04"
			], {
				result: "drop",
				screen: "S04",
				drop_reason: "TOO_MANY_STEPS"
			}, "관심분야를 다섯 개나 고르기보다 우선 일정을 확인하고 싶어요.")
		},
		{
			age: 25,
			job: "대학생",
			act: e([
				"S01",
				"S02",
				"S03",
				"S04",
				"S05"
			], {
				result: "complete",
				screen: "S05"
			})
		},
		{
			age: 27,
			job: "대학원생",
			act: e([
				"S01",
				"S02",
				"S03"
			], {
				result: "drop",
				screen: "S03",
				drop_reason: "MAX_TURNS"
			})
		},
		{
			age: 23,
			job: "대학생",
			act: null
		}
	];
	return {
		id: "ui-report-fixture-v1",
		name: "일정메이트 · 다양한 결과 예시",
		created: "2026-11-03T00:00:00Z",
		source: "demo",
		reportSource: "ui-mock",
		status: "failed",
		product: {
			name: "일정메이트",
			description: "수업과 과제 일정을 정리하는 서비스의 가입 흐름입니다.",
			features: ["일정 관리"],
			price: ""
		},
		screens: structuredClone(t),
		task: "회원가입을 완료하고 홈에서 일정을 확인하세요",
		goal: "S05",
		conditions: {
			preset: "univ",
			age: "22-28",
			price: []
		},
		count: 6,
		seed: 0,
		personas: n.map((e, t) => ({
			id: 101 + t,
			attributes: {
				profile: {
					age: e.age,
					job_group: e.job
				},
				card_text: "리포트의 다양한 종료 상태를 확인하기 위해 직접 구성한 가상 프로필입니다. 원본 페르소나 카드가 아닙니다.",
				traits: {},
				source: {
					persona_id: `M0${t + 1}`,
					stub: !0
				}
			}
		})),
		results: n.map((e, t) => ({
			id: 101 + t,
			persona_id: `M0${t + 1}`,
			ask: null,
			act: e.act
		}))
	};
}
// frontend/src/mockup/Brand.ts
var S = "<svg class=\"brand-symbol\" viewBox=\"0 0 32 32\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"M5 3h12c7 0 11 4 11 10S24 23 17 23h-6v6H5V3Zm6 6v8h6c3.3 0 5-1.3 5-4s-1.7-4-5-4h-6Z\"/></svg><span class=\"brand-wordmark\">Persona<span>Lab</span></span>";
// frontend/src/mockup/LandingMotion.ts
function C(e) {
	let t = window.matchMedia?.("(prefers-reduced-motion: reduce)");
	if (t?.matches || !window.IntersectionObserver) return () => {};
	let n = [...e.querySelectorAll(".lp-how > .lp-section-heading, .lp-preview-surround, .lp-outcomes > .lp-section-heading, .lp-findings, .lp-start-copy, .lp-faq-list, .lp-footer")], r;
	try {
		r = new window.IntersectionObserver((e) => {
			for (let t of e) t.isIntersecting && (t.target.classList.add("is-visible"), r.unobserve(t.target));
		}, {
			threshold: .06,
			rootMargin: "0px 0px -24px 0px"
		}), n.forEach((e) => r.observe(e));
	} catch {
		return () => {};
	}
	n.forEach((e) => e.classList.add("lp-reveal")), e.classList.add("lp-motion");
	let i = (e) => {
		let t = e.target.closest(".lp-reveal");
		t && (t.classList.add("is-visible"), r.unobserve(t));
	}, a = () => {
		t?.matches && (n.forEach((e) => e.classList.add("is-visible")), r.disconnect());
	};
	return e.addEventListener("focusin", i), t?.addEventListener("change", a), () => {
		r.disconnect(), e.classList.remove("lp-motion"), n.forEach((e) => e.classList.remove("lp-reveal", "is-visible")), e.removeEventListener("focusin", i), t?.removeEventListener("change", a);
	};
}
// frontend/src/mockup/Marketing.ts
var w = [
	"how",
	"features",
	"results",
	"sources",
	"roadmap",
	"faq"
];
function T(e, t, n = "") {
	let r = e.querySelector("[data-landing-login]"), i = e.querySelector("[data-landing-entry]");
	r && (r.hidden = t, r.style.display = t ? "none" : "", r.href = `${n}#login`), i && (i.textContent = t ? "내 워크스페이스 →" : "회원가입 →", i.href = `${n}#${t ? "workspace" : "register"}`);
}
var E = (e) => String(e ?? "").replace(/[&<>"']/g, (e) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
})[e]), D = "<span aria-hidden=\"true\">→</span>", O = "<span class=\"lp-demo-label\">저장된 AI 데모</span>", k = (e) => r.results.find((t) => t.persona_id === e)?.act?.events.find((e) => e.action === "abandon")?.reason || "", A = (t) => t ? e[t] || t : "—", j = (e) => r.screens.find((t) => t.id === e)?.label || e, M = S, N = (e) => `<span class="lp-underlined">${e}<svg aria-hidden="true" viewBox="0 0 300 18" preserveAspectRatio="none"><path pathLength="1" d="M3 11 Q85 1 153 8 T296 6"/><path pathLength="1" d="M21 16 Q150 8 277 13"/></svg></span>`;
function P(e) {
	return `<ol class="lp-path-list">${(r.results.find((t) => t.persona_id === e)?.act?.events || []).map((e) => `<li class="${e.action === "abandon" ? "stopped" : ""}"><span>${E(e.screen)}</span><div><strong>${E(j(e.screen))}</strong><small>${e.action === "click" ? `${E(e.target)} 선택` : `${E(A(e.drop_reason))} · 중단`}</small></div></li>`).join("")}</ol>`;
}
function F(e) {
	let t = r.results.find((t) => t.persona_id === e), n = r.personas.find((e) => e.id === t.id);
	return `<div class="lp-record-meta"><strong>${E(e)} <span>${n.attributes.profile.age}세 직장인</span></strong><span>한 사람의 탐색을 따라가 보세요</span></div><div class="lp-record-quotes lp-ux-record"><div><span class="lp-small-label">어디를 살펴봤나요?</span>${P(e)}</div><div><span class="lp-method act">그 순간 남긴 이유</span><blockquote>“${E(k(e))}”</blockquote><span class="lp-record-tag">${E(A(t.act?.end.drop_reason))}</span></div></div>`;
}
function I() {
	return r.personas.map((e) => {
		let t = r.results.find((t) => t.id === e.id);
		return `<button class="lp-person-row" type="button" data-public-persona="${E(t.persona_id)}"><span class="lp-person-id">${E(t.persona_id)}</span><span><strong>${e.attributes.profile.age}세 · ${E(e.attributes.profile.job_group)}</strong><small>이 페르소나의 탐색 기록 보기</small></span><span class="lp-row-arrow">${D}</span></button>`;
	}).join("");
}
function L() {
	return `<table class="lp-result-table"><thead><tr><th scope="col">페르소나</th><th scope="col">탐색 경로</th><th scope="col">중단 이유</th></tr></thead><tbody>${r.results.map((e) => `<tr><td><button type="button" data-public-persona="${E(e.persona_id)}">${E(e.persona_id)} ${D}</button></td><td>${(e.act?.path || []).map((e, t) => `${t ? "<i>→</i>" : ""}<span>${E(e)}</span>`).join("")}</td><td>${E(A(e.act?.end.drop_reason))}</td></tr>`).join("")}</tbody></table>`;
}
function R() {
	return `<div class="lp-product-demo"><div class="lp-product-bar"><strong>PersonaLab <span>/ ${E(r.name)}</span></strong>${O}</div>
    <div class="lp-demo-tabs" role="tablist" aria-label="UI·UX 테스트 미리보기"><button type="button" id="lp-tab-intro" role="tab" aria-selected="true" aria-controls="lp-pane-intro" data-landing-tab="intro">01 프로토타입</button><button type="button" id="lp-tab-panel" role="tab" aria-selected="false" aria-controls="lp-pane-panel" tabindex="-1" data-landing-tab="panel">02 페르소나</button><button type="button" id="lp-tab-results" role="tab" aria-selected="false" aria-controls="lp-pane-results" tabindex="-1" data-landing-tab="results">03 탐색 기록</button></div>
    <div id="lp-pane-intro" class="lp-preview-pane lp-preview-editor" role="tabpanel" aria-labelledby="lp-tab-intro"><aside class="lp-preview-nav"><span>테스트 살펴보기</span><div class="selected">화면과 연결</div><div>페르소나 패널</div><div>탐색 기록</div><div>결과 확인</div></aside><div class="lp-preview-main"><span class="lp-small-label">어떤 경험을 살펴볼까요?</span><h3>처음 만나는 일정메이트</h3><p class="lp-preview-sub">처음 진입한 화면부터 가입을 마치는 흐름입니다.</p><div class="lp-screen-inventory">${r.screens.map((e, t) => `<div><span>${E(e.id)}</span><strong>${E(e.label)}</strong><small>${t < 2 ? "데모에서 도달" : "미탐색"}</small></div>`).join("")}</div></div><aside class="lp-preview-guide"><span class="lp-small-label">이 데모가 살펴본 흐름</span><h4>첫 진입부터<br>회원가입까지</h4><p>등록 화면 ${r.screens.length}개 중 AI 패널이 도달한 화면과 멈춘 지점을 확인하세요.</p><div class="lp-guide-rule"></div><p><b>넓게 살펴보고, 깊게 확인하고.</b><br>주요 사용 흐름을 살펴보고, 특히 궁금한 화면과 경험에 집중하세요.</p></aside></div>
    <div id="lp-pane-panel" class="lp-preview-pane lp-preview-panel" role="tabpanel" aria-labelledby="lp-tab-panel" hidden><div class="lp-preview-main"><span class="lp-small-label">같은 화면을 보는 서로 다른 시선</span><h3>누구의 경험을 살펴볼까요?</h3><div class="lp-inline-facts"><span>저장된 패널 <strong>${r.personas.length}명</strong></span><span>프로필 <strong>27–34세 직장인</strong></span></div><div class="lp-preview-persons">${I()}</div></div><aside class="lp-preview-guide"><span class="lp-small-label">페르소나의 배경</span><h4>이용 습관까지,<br>함께 살펴봅니다.</h4><p>엔진은 공개 페르소나와 조사 응답을 연결해 배경과 앱 이용 특성을 카드에 반영합니다.</p><p class="lp-preview-note">현재 미리보기는 저장된 데모 5명입니다. 실제 조사 참여자의 응답과 구분됩니다.</p></aside></div>
    <div id="lp-pane-results" class="lp-preview-pane lp-preview-results" role="tabpanel" aria-labelledby="lp-tab-results" hidden><div class="lp-preview-main"><span class="lp-small-label">탐색 기록에서 발견한 지점</span><h3>회원가입에서 5명이 멈췄습니다.</h3><p class="lp-preview-sub">페르소나를 누르면 탐색 경로와 중단 이유를 볼 수 있어요.</p>${L()}</div><aside class="lp-preview-guide"><span class="lp-small-label">가장 많은 중단 이유</span><h4>개인정보 요구</h4><strong class="lp-count-emphasis">4<span> / 5명</span></strong><p>가입 이후 화면은 이 기록만으로 판단할 수 없습니다. 살펴본 범위를 함께 확인하세요.</p><a class="lp-text-link" href="#sample">전체 기록 살펴보기 ${D}</a></aside></div>
    <div class="lp-demo-foot"><span>화면 설명과 버튼 연결을 바탕으로 한 저장된 탐색 기록입니다.</span><a href="#sample">로그인 없이 결과 보기 ${D}</a></div></div>`;
}
function z() {
	return `<header class="topbar lp-topbar"><a class="logo" href="#landing">${M}</a><nav class="topnav" aria-label="메인 메뉴"><a href="#how">어떻게 살펴보나요</a><a href="#results">결과 미리보기</a></nav><div class="spacer"></div><a class="btn quiet sm" data-landing-login href="#login">로그인</a><a class="btn solid sm" data-landing-entry href="#register">회원가입 ${D}</a></header>
  <main class="lp-editorial lp-ux-landing">
  <section class="hero lp-hero lp-centered-hero" aria-labelledby="lp-hero-title"><div class="lp-hero-copy"><span class="lp-kicker">AI 페르소나와 함께하는 UI·UX 테스트</span><h1 id="lp-hero-title"><span class="lp-title-line">화면은 같아도,</span><br><span class="lp-title-line">${N("경험은 다르니까.")}</span></h1><p class="lede">AI 페르소나가 여러분의 화면을 탐색합니다.<br>막힌 지점과 이유를 살펴보고, 같은 페르소나에게 직접 물어보세요.</p><div class="ctas"><a class="btn solid" href="#register">테스트 시작하기 ${D}</a><a class="btn" href="#sample">샘플 결과 보기 ${D}</a></div></div></section>

  <section class="lp-section lp-how" id="how"><div class="lp-section-heading lp-split-heading"><div><span class="lp-eyebrow">01 / 화면에서 시작하는 테스트</span><h2>살펴볼 화면을 담고,<br>${N("페르소나를 고르세요.")}</h2></div><p id="features">프로토타입에서 페르소나, 탐색 기록까지.<br>아래 탭을 눌러 테스트의 흐름을 살펴보세요.</p></div><div class="lp-preview-surround">${R()}</div></section>

  <section class="lp-results-band" id="results"><div class="lp-section lp-outcomes"><div class="lp-section-heading lp-split-heading"><div><span class="lp-eyebrow">02 / 이유가 보이는 결과</span><h2>어디서 막혔는지,<br>${N("근거와 함께.")}</h2></div><p>탐색 경로와 그 순간의 이유를 나란히.<br>다음에 손볼 화면을 구체적으로 살펴보세요.</p></div><div class="lp-findings"><div class="lp-findings-summary"><span class="lp-small-label">일정메이트 · 저장된 AI 데모 5명</span><h3>다섯 명 모두,<br>회원가입에서 멈췄습니다.</h3><div class="lp-reason-bar" aria-label="개인정보 요구 4명, 복잡한 절차 1명"><span></span><span></span><span></span><span></span><span></span></div><p>개인정보 요구 <b>4명</b><span>복잡한 절차 <b>1명</b></span></p><a class="lp-text-link" href="#sample">전체 결과와 탐색 경로 보기 ${D}</a><small>대학생용 제품을 직장인 패널이 탐색한 사례입니다.<br>실제 사용자 결과나 전환율 예측이 아닙니다.</small><div class="lp-interview-note"><span class="lp-small-label">기록에서 대화로 · 1대1 인터뷰</span><strong>그 선택의 이유를,<br>직접 물어보세요.</strong><p>테스트했던 페르소나에게 같은 화면과 탐색 기록을 바탕으로 질문을 이어가세요.</p></div></div><div class="lp-findings-evidence"><div class="lp-record-tabs" role="group" aria-label="결과를 살펴볼 페르소나">${r.results.map((e) => `<button type="button" data-landing-record="${E(e.persona_id)}" aria-pressed="${e.persona_id === "P563"}">${E(e.persona_id)}</button>`).join("")}</div><div id="landingRecord" aria-live="polite">${F("P563")}</div><div class="lp-record-foot">저장된 AI 응답 · Synthetic User Response</div></div></div></div></section>

  <section class="lp-section lp-faq lp-start" id="faq"><div class="lp-start-copy"><span class="lp-eyebrow">03 / 다음 수정을 위한 첫걸음</span><h2>만드는 사람의 화면에서,<br>${N("쓰는 사람의 경험으로.")}</h2><p>우리 서비스의 UI·UX를 다른 시선으로 살펴보세요.</p><a class="btn solid" href="#register">UI·UX 테스트 시작하기 ${D}</a><a class="lp-start-sample" href="#demo">전체 데모 체험하기 ${D}</a></div><div class="lp-faq-list"><details><summary>어떤 부분을 살펴보나요?</summary><p>화면의 문구를 이해하는지, 주요 기능을 찾는지, 화면을 이동하고 정보를 입력하는 과정에서 어디가 불편한지 살펴봅니다. 특히 확인하고 싶은 부분이 있다면 집중 확인 항목으로 추가하세요.</p></details><details id="sources"><summary>페르소나는 어떤 사용자를 담고 있나요?</summary><p>엔진은 NVIDIA 한국인 페르소나와 한국미디어패널 조사 응답을 연결해 배경과 이용 특성을 반영합니다. 페르소나의 응답은 AI가 생성하며, 실제 사용자 조사와 구분합니다.</p></details><details id="roadmap"><summary>결과를 보고 더 물어볼 수 있나요?</summary><p>결과에서 궁금한 페르소나와 탐색 기록을 선택하고, 그 화면에서 어떤 선택을 했는지 1대1 인터뷰로 더 자세히 살펴보는 흐름입니다. “왜 여기서 멈췄나요?”처럼 구체적인 장면에서 질문을 시작하세요.</p></details></div></section>
  </main><footer class="lp-footer"><div><a class="logo" href="#landing">${M}</a><p>화면 너머, 사용자의 경험을 살펴봅니다.</p></div><nav aria-label="하단 메뉴"><a href="#how">이용 방법</a><a href="#demo">전체 데모</a><a href="#sample">샘플 결과</a><a href="#sources">페르소나의 근거</a><a href="#faq">자주 묻는 질문</a></nav><span>© 2026 PersonaLab</span></footer>`;
}
function B() {
	return `<div class="rv-sample-shell"><header class="topbar"><a class="logo" href="#landing">${M}</a><div class="spacer"></div><a class="btn quiet sm" href="#landing">소개로 돌아가기</a><a class="btn solid sm" href="#register">내 테스트 만들기 ${D}</a></header><main class="rv-sample-body"><div class="rv-sample-nav"><span>워크스페이스 / 샘플 테스트 / 결과</span><div class="rv-dataset-switch" role="group" aria-label="예시 데이터 선택"><button type="button" data-report-dataset="recorded" aria-pressed="true">저장된 AI 기록 · 5명</button><button type="button" data-report-dataset="mock" aria-pressed="false">다양한 결과 예시 · 목데이터</button></div></div><div id="sampleReport"></div></main></div>`;
}
function V(e) {
	e.querySelector("#v-landing").innerHTML = z(), e.querySelector("#v-sample").innerHTML = B();
	let t = C(e.querySelector("#v-landing")), n = b(e.querySelector("#sampleReport"), r, {
		onNext: () => {
			location.hash = "#register";
		},
		nextLabel: "내 화면으로 테스트 만들기"
	});
	function i(t) {
		n.update(t ? x() : r), e.querySelectorAll("[data-report-dataset]").forEach((e) => e.setAttribute("aria-pressed", String(e.dataset.reportDataset === (t ? "mock" : "recorded"))));
	}
	function a(e) {
		let t = r.results.find((t) => t.persona_id === e);
		t && (i(!1), n.selectPersona(t.id, "records"));
	}
	function o(t, n = !1) {
		let r = [...e.querySelectorAll("[data-landing-tab]")];
		r.some((e) => e.dataset.landingTab === t) && (r.forEach((e) => {
			let r = e.dataset.landingTab === t;
			e.setAttribute("aria-selected", String(r)), e.tabIndex = r ? 0 : -1, r && n && e.focus();
		}), e.querySelectorAll(".lp-preview-pane").forEach((e) => {
			e.hidden = e.id !== `lp-pane-${t}`;
		}));
	}
	let s = (t) => {
		let n = t.target.closest("[data-public-persona],[data-landing-tab],[data-landing-record],[data-report-dataset]");
		n && (n.dataset.reportDataset && i(n.dataset.reportDataset === "mock"), n.dataset.publicPersona && (a(n.dataset.publicPersona), location.hash !== "#sample" && (location.hash = "#sample")), n.dataset.landingTab && o(n.dataset.landingTab), n.dataset.landingRecord && r.results.some((e) => e.persona_id === n.dataset.landingRecord) && (e.querySelector("#landingRecord").innerHTML = F(n.dataset.landingRecord), e.querySelectorAll("[data-landing-record]").forEach((e) => e.setAttribute("aria-pressed", String(e === n)))));
	}, c = (e) => {
		let t = e.target.closest("[data-landing-tab]");
		if (!t || ![
			"ArrowLeft",
			"ArrowRight",
			"Home",
			"End"
		].includes(e.key)) return;
		let n = [
			"intro",
			"panel",
			"results"
		], r = n.indexOf(t.dataset.landingTab), i = e.key === "Home" ? 0 : e.key === "End" ? 2 : (r + (e.key === "ArrowRight" ? 1 : -1) + 3) % 3;
		e.preventDefault(), o(n[i], !0);
	}, l = () => {
		let t = location.hash.slice(1);
		(t === "sources" || t === "roadmap") && (e.querySelector(`details#${t}`).open = !0);
	};
	return e.addEventListener("click", s), e.addEventListener("keydown", c), window.addEventListener("hashchange", l), l(), () => {
		n.dispose(), t(), e.removeEventListener("click", s), e.removeEventListener("keydown", c), window.removeEventListener("hashchange", l);
	};
}
// frontend/src/mockup/PersonaPrompt.ts
var H = (e) => String(e ?? "").replace(/[&<>"']/g, (e) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
})[e]);
function U(e, t, n) {
	let r = e.attributes.profile, a = `당신은 ${r.age}세 ${r.job_group}입니다. 현재 화면의 문구와 버튼을 바탕으로 탐색하세요. 선택하거나 멈춘 이유를 화면에서 본 내용과 연결해 설명하세요.`;
	return `<article class="people-profile-popover"><button class="people-profile-close" type="button" data-prompt-close aria-label="페르소나 소개 닫기"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button><header><div class="persona-prompt-face people-profile-photo" role="img" aria-label="AI로 생성한 가상 인물 초상 예시" style="--position:${t * 25}%"></div><div><span class="people-profile-id">${H(i(e))} / AI 페르소나</span><h2 tabindex="-1">${r.age}세 ${H(r.job_group)}</h2><p>일정메이트의 가입 흐름을 살펴봤어요.</p></div></header><div class="people-profile-body"><section><span class="people-profile-label">페르소나 프롬프트</span><p class="people-profile-prompt">${H(a)}</p></section>${n ? `<section class="people-profile-record"><span class="people-profile-label">그 화면에서 남긴 말</span><blockquote>“${H(n)}”</blockquote></section>` : ""}</div><footer>공개 프로필로 구성한 프롬프트 예시</footer></article>`;
}
// frontend/src/mockup/PeopleHero.ts
var W = [
	{
		turn: -7,
		lift: 32
	},
	{
		turn: -3.5,
		lift: 8
	},
	{
		turn: 0,
		lift: -8
	},
	{
		turn: 3.5,
		lift: 8
	},
	{
		turn: 7,
		lift: 32
	}
];
function G(e) {
	let t = e.querySelector("#v-landing");
	t.classList.add("people-variant"), t.querySelector(".lp-centered-hero").insertAdjacentHTML("beforeend", `<div class="people-strip"><svg class="people-connection" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true"><path d="M-90 230 C140 280 160 70 370 125 S670 300 830 170 S1080 30 1290 130"/><path d="M-80 253 C140 300 160 93 370 148 S670 323 830 193 S1080 53 1290 153"/></svg><div class="people-portraits" role="group" aria-label="탐색 기록을 살펴볼 AI 페르소나">${r.personas.map((e, t) => {
		let n = r.results.find((t) => t.id === e.id).persona_id;
		return `<button class="people-card" type="button" data-concept-person="${n}" aria-pressed="false" aria-expanded="false" aria-controls="landingPersonaPrompt" style="--turn:${W[t].turn}deg;--lift:${W[t].lift}px;--position:${t * 25}%;--delay:${t * 100}ms"><span class="people-card-float"><span class="people-photo" role="img" aria-label="AI로 생성한 가상 인물 초상"></span><span class="people-card-info"><strong>${e.attributes.profile.age}세 직장인</strong><span>${n}<i aria-hidden="true">↗</i></span></span></span></button>`;
	}).join("")}</div><div class="people-strip-caption"><span>서로 다른 시선, 서로 다른 선택.</span><span>AI 페르소나 예시 <button type="button" id="people-motion" aria-label="인물 카드 움직임 일시정지" aria-pressed="false"><span aria-hidden="true">Ⅱ</span></button></span></div></div>`), t.querySelector(".people-strip").insertAdjacentHTML("beforeend", "<section id=\"landingPersonaPrompt\" class=\"persona-prompt-detail people-prompt-popover\" role=\"dialog\" aria-label=\"선택한 페르소나 프롬프트\" hidden></section>");
	let n = t.querySelector("#landingPersonaPrompt"), i = "";
	function a(e, a = !0) {
		let o = r.personas.findIndex((t) => t.attributes.source.persona_id === e);
		if (o < 0) return;
		let s = r.personas[o];
		i = e, n.hidden = !1;
		let c = r.results.find((e) => e.id === s.id)?.act?.events.find((e) => e.action === "abandon")?.reason || "";
		n.innerHTML = U(s, o, c), t.querySelectorAll("[data-concept-person]").forEach((t) => t.setAttribute("aria-expanded", String(t.dataset.conceptPerson === e))), d(), a && n.querySelector("h2")?.focus({ preventScroll: !0 });
	}
	let o = t.querySelector("#faq");
	o.classList.add("people-wide-faq"), o.insertAdjacentHTML("afterbegin", "<div class=\"people-faq-heading\"><span class=\"lp-eyebrow\">자주 묻는 질문</span><h2>궁금한 점을 먼저 살펴보세요.</h2></div>"), o.append(o.querySelector(".lp-start-copy"));
	let s = t.querySelector(".people-strip"), c = t.querySelector(".people-portraits"), l = [...t.querySelectorAll("[data-concept-person]")], u = t.querySelector("#people-motion");
	function d() {
		if (n.hidden) return;
		let e = l.find((e) => e.dataset.conceptPerson === i);
		if (!e) return;
		let t = s.getBoundingClientRect(), r = e.getBoundingClientRect(), a = t.width || window.innerWidth, o = n.getBoundingClientRect().width || Math.min(360, a - 24), c = Math.max(12, Math.min(r.left - t.left + r.width / 2 - o / 2, a - o - 12));
		n.style.left = `${c}px`;
	}
	function f(e = !1) {
		n.hidden = !0, l.forEach((e) => e.setAttribute("aria-expanded", "false")), e && l.find((e) => e.dataset.conceptPerson === i)?.focus({ preventScroll: !0 });
	}
	function p(e) {
		let t = e.target;
		n.hidden || n.contains(t) || l.some((e) => e.contains(t)) || f();
	}
	function m(e) {
		e.key === "Escape" && !n.hidden && (e.preventDefault(), f(!0));
	}
	function h(e) {
		l.forEach((t) => {
			let n = t.dataset.conceptPerson === e;
			t.classList.toggle("is-active", n), t.setAttribute("aria-pressed", String(n));
		});
	}
	function g(e) {
		let r = e.target.closest("[data-concept-person],[data-landing-record],#people-motion,[data-prompt-close]");
		if (r && t.contains(r)) {
			if (r.hasAttribute("data-prompt-close")) f(!0);
			else if (r.dataset.conceptPerson) {
				if (!n.hidden && i === r.dataset.conceptPerson) {
					f(!0);
					return;
				}
				h(r.dataset.conceptPerson), t.querySelector(`[data-landing-record="${r.dataset.conceptPerson}"]`)?.click(), a(r.dataset.conceptPerson);
			} else if (r.dataset.landingRecord) h(r.dataset.landingRecord), n.hidden || a(r.dataset.landingRecord, !1);
			else {
				let e = s.classList.toggle("is-paused");
				u.setAttribute("aria-pressed", String(e)), u.setAttribute("aria-label", e ? "인물 카드 움직임 재생" : "인물 카드 움직임 일시정지"), u.firstElementChild.textContent = e ? "▷" : "Ⅱ";
			}
		}
	}
	function _() {
		if (window.innerWidth > 700) return;
		let e = l.find((e) => e.classList.contains("is-active"));
		c.scrollLeft = e.offsetLeft - (c.clientWidth - e.offsetWidth) / 2;
	}
	return e.addEventListener("click", g), document.addEventListener("pointerdown", p), document.addEventListener("keydown", m), window.addEventListener("resize", d), c.addEventListener("scroll", d, { passive: !0 }), window.addEventListener("load", _, { once: !0 }), t.querySelector("[data-landing-record=\"P392\"]").click(), document.readyState === "complete" && _(), () => {
		e.removeEventListener("click", g), document.removeEventListener("pointerdown", p), document.removeEventListener("keydown", m), window.removeEventListener("resize", d), c.removeEventListener("scroll", d), window.removeEventListener("load", _);
	};
}
// frontend/src/api/studio.ts
var K = class extends Error {
	status;
	constructor(e, t) {
		super(e), this.status = t, this.name = "ApiError";
	}
};
async function q(e, t, n) {
	let r = AbortSignal.timeout(e.endsWith("/panel/generate") ? 18e4 : 2e4), i;
	try {
		i = await fetch(`/api${e}`, {
			method: t === void 0 ? "GET" : "POST",
			credentials: "same-origin",
			headers: t === void 0 ? void 0 : {
				"Content-Type": "application/json",
				"X-Requested-With": "PersonaLab"
			},
			body: t === void 0 ? void 0 : JSON.stringify(t),
			signal: n ? AbortSignal.any([n, r]) : r
		});
	} catch (e) {
		throw n?.aborted ? e : Error("실행 서버에 연결할 수 없습니다. 연결 상태를 확인해 주세요.");
	}
	let a = await i.text(), o;
	try {
		o = JSON.parse(a);
	} catch {
		throw Error("실행 서버가 올바른 응답을 보내지 않았습니다.");
	}
	if (!i.ok) {
		let t = o.detail, n = typeof t == "string" ? t : Array.isArray(t) ? t.map((e) => e.msg || "입력값을 확인해 주세요.").join(" ") : "요청을 처리하지 못했습니다.";
		throw i.status === 401 && !e.startsWith("/auth/") && typeof window < "u" && window.dispatchEvent(new window.CustomEvent("personalab:session-expired")), new K(n, i.status);
	}
	return o;
}
var J = () => q("/auth/me");
// frontend/src/concepts/PeopleLanding.ts
function Y(e) {
	e.innerHTML = "<section class=\"view marketing\" id=\"v-landing\" aria-label=\"PersonaLab 인물 랜딩\"></section><section class=\"view\" id=\"v-sample\" aria-label=\"공개 AI 데모 결과\"></section>";
	let t = V(e), n = G(e), r = !1, i = 0;
	async function a() {
		let t = ++i, n = !1;
		try {
			let e = await J();
			n = Number.isInteger(e.id) && !!e.email;
		} catch {}
		!r && t === i && T(e, n, "/");
	}
	a(), window.addEventListener("focus", a), window.addEventListener("storage", a), e.querySelectorAll("a[href=\"#register\"],a[href=\"#login\"],a[href=\"#demo\"],a[href=\"#workspace\"]").forEach((e) => {
		e.href = `/${e.getAttribute("href")}`;
	});
	let o = e.querySelector("#v-landing"), s = e.querySelector("#v-sample"), c = window.matchMedia?.("(prefers-reduced-motion: reduce)");
	function l() {
		let e = location.hash.slice(1) || "landing";
		o.classList.toggle("on", e !== "sample"), s.classList.toggle("on", e === "sample"), w.includes(e) ? o.querySelector(`#${e}`)?.scrollIntoView({
			behavior: c?.matches ? "auto" : "smooth",
			block: "start"
		}) : window.scrollTo(0, 0);
	}
	return window.addEventListener("hashchange", l), l(), () => {
		r = !0, window.removeEventListener("focus", a), window.removeEventListener("storage", a), n(), t(), window.removeEventListener("hashchange", l);
	};
}
var X = document.querySelector("[data-people-concept]");
X && Y(X);
export { Y as mountPeopleLanding };
