"""페르소나 패널 만들기.

  프리셋으로:   python scripts/make_panel.py --preset univ
  조건 직접:    python scripts/make_panel.py --age 20-39 --sex 여 --region 수도권 --job 사무·관리,전문·기술 --n 50
  둘 다:        python scripts/make_panel.py --preset univ --sex 여        (프리셋에 조건을 더한다)

여러 값은 쉼표로 잇는다. 결과는 outputs/panel_<이름>_n<인원>_seed<seed>.* 로 저장된다."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import config as C                                   # noqa: E402
from src.cards import add_cards                               # noqa: E402
from src.checks import run_checks                             # noqa: E402
from src.donor import derive_donor, load_donor                # noqa: E402
from src.engine import build_panel                            # noqa: E402
from src.nvidia import derive_nvidia, fetch_text, load_nvidia_struct   # noqa: E402
from src.api import LIST_OPTS, PRESETS, parse_conditions     # noqa: E402  조건 해석은 백엔드와 같은 함수


def main():
    ap = argparse.ArgumentParser(description="타깃 조건으로 AI 페르소나 패널을 만든다.",
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument("--preset", choices=PRESETS, help="미리 정한 타깃: " + ", ".join(PRESETS))
    ap.add_argument("--age", help="연령 범위. 예: 20-39, 60- (만 19세 이상)")
    ap.add_argument("--sex", choices=["남", "여"])
    ap.add_argument("--job", help="직업군: " + ", ".join(C.JOB_GROUPS))
    ap.add_argument("--school", help="학력: " + ", ".join(C.SCHOOLS))
    ap.add_argument("--region", help="권역: " + ", ".join(C.REGIONS))
    ap.add_argument("--marital", help="혼인: " + ", ".join(C.MARITALS))
    ap.add_argument("--price", help="가격 민감도 등급: " + ", ".join(C.GRADE_LABELS))
    ap.add_argument("--n", type=int, default=100, help="인원 (기본 100)")
    ap.add_argument("--seed", type=int, default=42, help="같은 seed = 같은 결과 (기본 42)")
    ap.add_argument("--name", help="결과 파일 이름 (기본: 프리셋 이름 또는 custom)")
    a = ap.parse_args()

    custom = any(getattr(a, k) for k in ["age", "sex", *LIST_OPTS])
    preset = a.preset or (None if custom else "univ")         # 아무것도 안 주면 기본 프리셋
    label = a.name or ((preset or "custom") + ("_custom" if preset and custom else ""))
    cond = {k: getattr(a, k) for k in ["age", "sex", *LIST_OPTS] if getattr(a, k)}
    try:
        target = parse_conditions({**cond, **({"preset": preset} if preset else {})})
    except ValueError as e:
        sys.exit(f"--{e}")
    print("타깃:", target or "전체 (19세 이상)")

    donor = derive_donor(load_donor())
    nv = derive_nvidia(load_nvidia_struct())
    try:
        panel, rep = build_panel(target, a.n, a.seed, donor=donor, nv=nv)
    except ValueError as e:
        sys.exit(f"만들 수 없습니다: {e}")
    panel = add_cards(fetch_text(panel))
    ck = run_checks(panel, rep)

    C.OUT.mkdir(parents=True, exist_ok=True)
    name = f"panel_{label}_n{a.n}_seed{a.seed}"
    panel.to_parquet(C.OUT / f"{name}.parquet")
    panel.to_csv(C.OUT / f"{name}.csv", index=False, encoding="utf-8-sig")
    (C.OUT / f"{name}_report.json").write_text(
        json.dumps({"report": rep, "checks": ck}, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8")
    ok = all(v["ok"] for v in ck.values() if isinstance(v, dict) and "ok" in v)
    print(f"{name} | {len(panel)}명 (요청 {a.n}) | 실제 응답자 {rep['donor_n']}명 기반"
          f" | 매칭 수준 {rep['match_level_counts']} | 자동 점검 {'통과' if ok else '확인 필요'}")
    if rep["shortfall"]:
        print("  ! 후보가 모자란 칸:", rep["shortfall"])
    if rep.get("grade_warnings"):
        print("  ! 등급 경고:", ", ".join(rep["grade_warnings"]))
    print(f"  -> outputs/{name}.csv")


if __name__ == "__main__":
    main()
