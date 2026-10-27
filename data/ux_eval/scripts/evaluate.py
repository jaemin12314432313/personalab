"""페르소나별 UX 흐름 평가.

  프롬프트만 보기 (키 불필요):  python scripts/evaluate.py --flow samples/signup_flow.json --dry-run
  가짜 응답으로 점검:          python scripts/evaluate.py --flow samples/signup_flow.json --mock
  실제 실행 (.env에 키 필요):   python scripts/evaluate.py --flow samples/signup_flow.json --n 20

페르소나는 Persona Engine 결과 CSV(card_text 열)를 읽는다. 기본은 20대 대학생 패널."""
import argparse
import json
import random
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import config as C                                   # noqa: E402
from src.flow import load_flow, render_flow                   # noqa: E402
from src.prompt import SCHEMA, SYSTEM, build_contents, check_eval   # noqa: E402
from src.summary import flatten, summarize                    # noqa: E402

DEFAULT_PANEL = C.PANEL_DIR / "panel_univ_n100_seed42.csv"


def mock_llm(flow: dict, seed: int):
    """LLM 없이 처리 과정을 끝까지 점검하기 위한 가짜 응답 (항상 형식에 맞는 값)."""
    rng = random.Random(seed)
    first = flow["screens"][0]

    def call(system, contents, schema, check=None):
        crit = {k: {"label": rng.choice(C.LABELS),
                    "evidence": f"{first['id']} {first['label']} 화면 기준 (가짜 응답)",
                    "importance": rng.choice(C.IMPORTANCE), "importance_reason": "(가짜 응답)"}
                for k in C.CRITERIA}
        done = rng.random() < 0.6
        out = {"criteria": crit, "complete": "예" if done else "아니오", "complete_reason": "(가짜 응답)",
               "drop_screen": "" if done else rng.choice(flow["screens"])["id"],
               "drop_reason": "" if done else rng.choice(C.DROP_REASONS)}
        problem = check(out) if check else None
        assert problem is None, problem
        return out
    return call


def main():
    ap = argparse.ArgumentParser(description="AI 페르소나가 화면 흐름을 7개 기준으로 평가한다.",
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument("--flow", required=True, help="흐름 JSON (HTML은 scripts/html_to_flow.py로 먼저 변환)")
    ap.add_argument("--panel", default=str(DEFAULT_PANEL), help="Persona Engine 결과 CSV")
    ap.add_argument("--n", type=int, default=C.DEV_N, help=f"평가할 페르소나 수 (기본 {C.DEV_N})")
    ap.add_argument("--dry-run", action="store_true", help="첫 페르소나의 프롬프트만 출력, 호출 안 함")
    ap.add_argument("--mock", action="store_true", help="가짜 응답으로 끝까지 점검 (비용 없음)")
    ap.add_argument("--max-cost", type=float, default=C.MAX_RUN_COST_USD,
                    help=f"이번 실행 비용 상한, 달러 (기본 {C.MAX_RUN_COST_USD}). 넘으면 중단")
    a = ap.parse_args()

    flow = load_flow(a.flow)
    panel_path = Path(a.panel)
    if not panel_path.exists():
        sys.exit(f"페르소나 CSV가 없습니다: {panel_path}\n"
                 "data/persona_engine에서 python scripts/make_panel.py --preset univ 를 먼저 실행하세요.")
    panel = pd.read_csv(panel_path).head(a.n)
    flow_text = render_flow(flow)

    if a.dry_run:
        print("=== system ===\n" + SYSTEM + "\n\n=== contents ===\n" + "\n\n".join(
            build_contents(panel.iloc[0].card_text, flow_text)))
        print(f"\n(페르소나 {len(panel)}명이면 호출 {len(panel)}회)")
        return

    usage = None                                              # 실제 토큰 사용량 (OpenAI만 측정)
    if a.mock:
        call, model = mock_llm(flow, seed=0), "mock"
    else:
        from app.core.config import LLM_DEFAULT_MODEL, settings
        from app.services.llm import LLMError
        if not settings.llm_api_key:
            sys.exit("저장소 루트 .env에 LLM_API_KEY를 넣으세요. (키 없이 점검: --mock 또는 --dry-run)")
        if settings.llm_api_key.startswith("sk-"):            # OpenAI 키
            from src.llm_openai import USAGE as usage, call_llm
            model = settings.llm_model
            if model not in C.PRICE_PER_MTOK:
                sys.exit(f"비용을 계산할 수 없는 모델입니다: {model}. src/config.py PRICE_PER_MTOK에 가격을 넣으세요.")
        else:                                                 # Gemini 키: 백엔드 함수 그대로
            from app.services.llm import call_llm
            model = settings.llm_model or LLM_DEFAULT_MODEL
        call = call_llm

    def cost() -> float:
        if not usage:
            return 0.0
        pin, pout = C.PRICE_PER_MTOK[model]
        return (usage["input"] * pin + usage["output"] * pout) / 1e6

    rows, t0 = [], time.time()
    for i, p in enumerate(panel.itertuples(), start=1):
        row = {k: getattr(p, k) for k in ("persona_id", "age", "sex", "job_group", "ps_grade", "da_grade")}
        try:
            row["eval"] = call(system=SYSTEM, contents=build_contents(p.card_text, flow_text),
                               schema=SCHEMA, check=lambda out: check_eval(out, flow))
            row["status"] = "ok"
        except Exception as e:                                # 한 명 실패해도 나머지는 계속
            if not a.mock and not isinstance(e, LLMError):
                raise
            row["eval"], row["status"] = None, f"fail: {e}"
        rows.append(row)
        print(f"\r{i}/{len(panel)} 명 평가" + (f" · 누적 ${cost():.3f}" if usage else ""), end="", flush=True)
        recent = [r["status"] for r in rows[-C.MAX_CONSECUTIVE_FAILS:]]
        if len(recent) == C.MAX_CONSECUTIVE_FAILS and all(s != "ok" for s in recent):
            print(f"\n연속 {C.MAX_CONSECUTIVE_FAILS}명 실패로 중단합니다 (크레딧 보호). 마지막 오류: {row['status']}")
            break
        if row["status"].startswith("fail") and "잔액" in row["status"]:
            print("\n잔액 부족으로 중단합니다.")
            break
        if cost() > a.max_cost:
            print(f"\n비용 상한 ${a.max_cost:.2f}를 넘어 중단합니다 ({i}명까지 평가).")
            break
    print(f" ({time.time() - t0:.0f}초)")
    if usage:
        print(f"사용량: 호출 {usage['calls']}회 · 입력 {usage['input']:,} · 출력 {usage['output']:,} 토큰"
              + (f" (추론 {usage['reasoning']:,})" if usage["reasoning"] else "")
              + f" · 비용 ${cost():.4f} (1명당 ${cost() / max(len(rows), 1):.4f})")
        if usage["retry_reasons"]:
            from collections import Counter
            print("재시도 원인:", dict(Counter(usage["retry_reasons"])))

    tag = "mock" if a.mock else model
    out_dir = C.OUT / f"{flow['name']}_{panel_path.stem}_n{len(rows)}_{tag}"
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / "results.jsonl", "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False, default=str) + "\n")
    df = flatten(rows)
    df.to_csv(out_dir / "results.csv", index=False, encoding="utf-8-sig")
    meta = {"panel": panel_path.name, "n": len(rows), "model": model,
            "cost": (f"호출 {usage['calls']}회, 입력 {usage['input']:,} · 출력 {usage['output']:,} 토큰, "
                     f"${cost():.4f}") if usage else None}
    (out_dir / "summary.md").write_text(summarize(df, flow, meta), encoding="utf-8")
    fails = int((df.status != "ok").sum())
    print(f"-> {out_dir.relative_to(C.ROOT)}/ (summary.md, results.csv, results.jsonl)"
          + (f" · 실패 {fails}명" if fails else ""))


if __name__ == "__main__":
    main()
