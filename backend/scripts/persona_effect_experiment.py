"""페르소나가 탐색 결과를 실제로 바꾸는지 보는 실험 (S = B − P).

같은 사이트·같은 과제에서 세 가지를 비교한다.
  A. 서로 다른 극단 페르소나 6명(마찰이 큰 3명, 작은 3명)이 각각 2번씩 탐색
  C. 카드를 뺀 같은 조건 6번
지표 (방문 화면 집합의 자카드 유사도 평균)
  B = 같은 페르소나를 반복했을 때의 유사도 (모델 자체의 흔들림)
  P = 서로 다른 페르소나끼리의 유사도
  N = 카드가 없을 때 6번끼리의 유사도
  S = B − P   (0에 가까우면 페르소나가 경로를 바꾸지 못한 것)

사용법 (backend 폴더에서)
  S = B − P   (0에 가까우면 페르소나가 경로를 바꾸지 못한 것)
  python scripts/persona_effect_experiment.py --max-calls 150    # 실제 AI 호출. 비용 발생
"""

import argparse
import asyncio
import base64
import itertools
import json
import random
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import settings  # noqa: E402
from app.services import browser, rule_agent  # noqa: E402
from app.services.llm import LLMError, start_usage  # noqa: E402

SITE = ROOT / "data" / "ux_eval" / "samples" / "signup_html"
PANELS = ROOT / "data" / "persona_engine" / "outputs"
TASK = "Plani에 회원가입을 완료해 보세요."
NEUTRAL_CARD = "일반적인 한국 성인 사용자다."
SEED = 42
GROUP_SIZE = 3
REPEATS = 2
NO_CARD_RUNS = 6
CONTROL_RUNS = 6
# 양성 대조: 카드에 아주 명시적인 포기 지시를 넣었을 때도 포기가 안 나오면 에이전트·프롬프트가 병목이다
POSITIVE_RULE = "회원가입에서 이유 없이 휴대폰 번호와 주소를 요구하면 그 자리에서 가입을 포기한다."
MAX_TURNS = 6
PRIVACY_HIGH = 5
PRIVACY_LOW_MAX = 3


def site_bundle() -> dict:
    files = sorted(SITE.glob("S*.html"))
    return {
        "kind": "html",
        "entry": "S01.html",
        "files": [
            {"path": f.name, "data": base64.b64encode(f.read_bytes()).decode()} for f in files
        ],
    }


def pick_personas() -> list[dict]:
    frames = [
        pd.read_csv(f, encoding="utf-8-sig") for f in sorted(PANELS.glob("panel_*_seed42.csv"))
    ]
    df = pd.concat(frames, ignore_index=True)
    df["pc"] = df.privacy_concern.round().astype(int)
    high = df[(df.le_grade == "낮음") & (df.pc >= PRIVACY_HIGH)]
    low = df[(df.le_grade == "높음") & (df.pc <= PRIVACY_LOW_MAX) & (df.ds_level == "충분")]
    if len(high) < GROUP_SIZE or len(low) < GROUP_SIZE:
        raise SystemExit("대조할 페르소나가 부족합니다.")
    rng = random.Random(SEED)
    chosen = [("마찰 큼", r) for r in rng.sample(high.to_dict("records"), GROUP_SIZE)] + [
        ("마찰 작음", r) for r in rng.sample(low.to_dict("records"), GROUP_SIZE)
    ]
    return [
        {
            "group": g,
            "persona_id": r["persona_id"],
            "age": int(r["age"]),
            "traits": {k: r[k] for k in ("le_grade", "ot_grade", "ic_grade", "ds_level", "pc")},
            "card_text": r["card_text"],
        }
        for g, r in chosen
    ]


async def run_once(persona: dict, card: str, decide, tolerate: bool) -> dict:
    visited: list[str] = []
    issues = 0
    notes: list[str] = []
    last = {}

    async def save(turn, screen, image, action, row):
        nonlocal issues, last
        visited.append(screen.get("url") or screen.get("label") or str(turn))
        for o in action.get("observations") or []:
            if o.get("polarity") == "issue":
                issues += 1
                notes.append(f"[{o.get('dimension')}/{o.get('severity')}] {o.get('note')}")
        if row is not None:
            last = row

    async def cancelled():
        return False

    await browser.explore(
        site_bundle(),
        {"viewport": "desktop", "goal_url": "/S05.html"},
        {"card_text": card},
        TASK,
        MAX_TURNS,
        save,
        cancelled,
        decide=decide,
        tolerate_blocked=tolerate,
        allow_revisit=not tolerate,
    )
    return {
        "pages": visited,
        "end": last.get("action"),
        "drop_reason": last.get("drop_reason"),
        "issues": issues,
        "notes": notes[:6],
    }


def jaccard(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    return len(sa & sb) / len(sa | sb) if (sa | sb) else 1.0


def mean(xs: list[float]) -> float | None:
    return round(sum(xs) / len(xs), 3) if xs else None


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="AI 호출 없이 규칙 엔진으로 점검")
    parser.add_argument(
        "--positive-control", action="store_true", help="명시적 포기 지시 카드로 6회만 돌린다"
    )
    parser.add_argument("--max-calls", type=int, default=150, help="이 호출 수를 넘으면 중단")
    parser.add_argument("--out", default=str(ROOT / ".localtools" / "persona_effect"))
    args = parser.parse_args()

    if args.dry_run:
        settings.rule_step_delay_ms = 0  # 점검용이라 체험용 지연을 끈다
    decide = rule_agent.decide_browser if args.dry_run else browser.decide_browser
    sink = start_usage()
    if args.positive_control:
        card = NEUTRAL_CARD + chr(10) + POSITIVE_RULE
        control: list[dict] = []
        async with browser.shared_browser():
            for i in range(CONTROL_RUNS):
                if not args.dry_run and sink.snapshot()["calls"] >= args.max_calls:
                    raise SystemExit("호출 한도에 도달해 중단했습니다.")
                result = await run_once({}, card, decide, args.dry_run)
                control.append({"cond": "P", "rep": i, **result})
                print("P", i, result["pages"], result["end"], result["drop_reason"], flush=True)
        dropped = [r for r in control if r["end"] == "abandon"]
        summary = {
            "mode": "positive-control",
            "card": card,
            "runs": len(control),
            "abandoned": len(dropped),
            "drop_reasons": [r["drop_reason"] for r in dropped],
            "ends": [r["end"] for r in control],
            "usage": None if args.dry_run else sink.snapshot(),
        }
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        (out / "result_control.json").write_text(
            json.dumps({"summary": summary, "runs": control}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return
    personas = pick_personas()
    runs: list[dict] = []

    async with browser.shared_browser():
        for p in personas:
            for rep in range(REPEATS):
                if not args.dry_run and sink.snapshot()["calls"] >= args.max_calls:
                    raise SystemExit("호출 한도에 도달해 중단했습니다.")
                result = await run_once(p, p["card_text"], decide, args.dry_run)
                runs.append({"cond": "A", "persona": p["persona_id"], "rep": rep, **result})
                print(
                    "A",
                    p["persona_id"],
                    p["group"],
                    rep,
                    result["pages"],
                    result["end"],
                    flush=True,
                )
        for i in range(NO_CARD_RUNS):
            if not args.dry_run and sink.snapshot()["calls"] >= args.max_calls:
                raise SystemExit("호출 한도에 도달해 중단했습니다.")
            result = await run_once({}, NEUTRAL_CARD, decide, args.dry_run)
            runs.append({"cond": "C", "persona": "-", "rep": i, **result})
            print("C", i, result["pages"], result["end"], flush=True)

    a = [r for r in runs if r["cond"] == "A"]
    c = [r for r in runs if r["cond"] == "C"]
    same = [
        jaccard(x["pages"], y["pages"])
        for x, y in itertools.combinations(a, 2)
        if x["persona"] == y["persona"]
    ]
    diff = [
        jaccard(x["pages"], y["pages"])
        for x, y in itertools.combinations(a, 2)
        if x["persona"] != y["persona"]
    ]
    nocard = [jaccard(x["pages"], y["pages"]) for x, y in itertools.combinations(c, 2)]
    b, pp, n = mean(same), mean(diff), mean(nocard)
    summary = {
        "mode": "dry-run(규칙 엔진)" if args.dry_run else f"LLM({settings.llm_model})",
        "B_same_persona": b,
        "P_between_personas": pp,
        "N_no_card": n,
        "S_B_minus_P": round(b - pp, 3) if b is not None and pp is not None else None,
        "usage": None if args.dry_run else sink.snapshot(),
        "outcomes": {
            r["persona"] + f"#{r['rep']}": [r["end"], r["drop_reason"], r["issues"]] for r in runs
        },
    }
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    tag = "dry" if args.dry_run else "llm"
    (out / f"result_{tag}.json").write_text(
        json.dumps(
            {"summary": summary, "personas": personas, "runs": runs}, ensure_ascii=False, indent=2
        ),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except LLMError as error:
        raise SystemExit(f"AI 호출 오류: {error}") from error
