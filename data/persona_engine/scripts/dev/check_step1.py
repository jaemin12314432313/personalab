"""Step 1: donor 전처리·점수 검증. 사용: python scripts/dev/check_step1.py
1) 코드북 대조: 우리가 읽은 값의 가중 비율이 코드북의 2024 가중 %와 같은가 (읽기·가중치 검증)
2) 범주 커버리지: 매칭 키가 NaN인 행
3) 타깃 프리셋별: donor 수, 작은 칸, 등급 비율 (허용 범위 config.GRADE_SHARE_RANGE)
4) 방향성: 점수가 상식적인 방향으로 움직이는가 (연령↑ → 디지털 수용도↓ 등)"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src import config as C                                   # noqa: E402
from src.donor import compute_scores, derive_donor, load_donor   # noqa: E402
from src.engine import _filter                                # noqa: E402
from src.utils import codebook_lookup, grade_shares           # noqa: E402

PRESETS = {
    "univ": {"age": (19, 29), "job": ["학생"], "school": ["대졸"]},
    "20s_all": {"age": (19, 29)},
    "30s_office": {"age": (30, 39), "job": ["사무·관리"]},
    "40s_all": {"age": (40, 49)},
    "60plus": {"age": (60, 120)},
    "all": {},
}
CODEBOOK_VARS = ["gender", "school1", "job1", "mar", "income", "d23003", "d26061", "c06006", "i02004", "m01017"]
TOL_PP = 1.0      # 코드북 % 와의 허용 차이 (%p)

raw = load_donor()
y = f"p{C.YEAR}"

# ── 1. 코드북 대조 ──
print("===== 1. 코드북 2024 가중 % 대조 (전체 8,693명, p24wt) =====")
rows = []
for v in CODEBOOK_VARS:
    _, book = codebook_lookup(f"p__{v}")
    book = {int(c): float(p) for c, _, p in book if isinstance(c, (int, float)) and c != 9999 and p is not None}
    s, w = raw[y + v], raw[y + "wt"]
    ok = s.notna()
    mine = (w[ok].groupby(s[ok]).sum() / w[ok].sum() * 100).to_dict()
    codes = sorted(set(book) | {int(k) for k in mine})
    diff = max(abs(mine.get(c, 0) - book.get(c, 0)) for c in codes)
    rows.append((v, len(codes), round(diff, 2), "OK" if diff <= TOL_PP else "확인"))
print(pd.DataFrame(rows, columns=["변수", "코드 수", "최대 차이(%p)", "판정"]).to_string(index=False))

# ── 2. 범주 커버리지 ──
d = derive_donor(raw)
print(f"\n===== 2. 공통 범주 (19세 이상 {len(d):,}명) =====")
for c in ["school", "job_group", "region3", "marital"]:
    t = (d.groupby(c)["wt"].sum() / d["wt"].sum() * 100).round(1)
    print(f"[{c}]", d[c].value_counts().to_dict(), "| 가중%", t.to_dict())
nan = d[C.KEYS + ["wt"]].isna()
print("[키 NaN]", {k: int(v) for k, v in nan.sum().items() if v}, "-> 매칭 제외", int(nan.any(axis=1).sum()))
dd = d.dropna(subset=C.KEYS + ["wt"])

# ── 3. 프리셋별 ──
print("\n===== 3. 프리셋별 donor·등급 비율 =====")
lo, hi = C.GRADE_SHARE_RANGE
rows = []
for name, t in PRESETS.items():
    s = compute_scores(_filter(dd, t))
    cells = s.groupby(C.CELL_KEYS).size()
    sh = {g: grade_shares(s[g], s["wt"]) for g in ["ps_grade", "da_grade", "ns_grade"]}
    fmt = lambda x: "/".join(f"{x.get(k, 0):.0%}" for k in C.GRADE_LABELS)
    warn = [f"{g}:{k}" for g, x in sh.items() for k, v in x.items() if not lo <= v <= hi]
    rows.append((name, len(s), len(cells), int((cells < C.MIN_POOL).sum()),
                 fmt(sh["ps_grade"]), fmt(sh["da_grade"]), fmt(sh["ns_grade"]), ",".join(warn) or "-"))
print("등급 비율 = 낮음/중간/높음 (가중)")
print(pd.DataFrame(rows, columns=["프리셋", "donor", "칸", f"donor<{C.MIN_POOL}칸",
                                  "가격민감", "디지털", "새것선호", "범위 밖"]).to_string(index=False))

# ── 4. 방향성 (전체 19세 이상에서 점수 계산) ──
print("\n===== 4. 방향성 점검 (가중 평균) =====")
a = compute_scores(dd)
a["inc"] = a["income"]


def wmean(col, by):
    return a.groupby(by).apply(lambda g: np.average(g[col], weights=g["wt"]), include_groups=False)


def trend(col, by, order=None, expect=-1, note=""):
    m = wmean(col, by)
    if order:
        m = m.reindex(order)
    r = pd.Series(range(len(m))).corr(pd.Series(m.to_numpy()), method="spearman")
    ok = np.sign(r) == expect and abs(r) >= 0.7
    print(f"[{'OK' if ok else '확인'}] {col} by {by} (순위상관 {r:+.2f}, 기대 {'감소' if expect < 0 else '증가'}) {note}")
    print("      ", {str(k): round(v, 2) for k, v in m.items()})


trend("digital_adoption", "age_bin", C.AGE_LABELS)
trend("novelty_seeking", "age_bin", C.AGE_LABELS)
trend("price_sensitivity", "inc", expect=-1, note="(소득은 WTP 입력 변수라 순환 점검)")
trend("digital_adoption", "i02004", [2, 1], expect=+1, note="(간편결제 미사용→사용, 점수와 독립)")
trend("digital_adoption", "d26092", [2, 1], expect=+1, note="(숏폼 미이용→이용, 점수와 독립)")
trend("price_sensitivity", "age_bin", C.AGE_LABELS, expect=+1, note="(참고: 고령일수록 유료 구독이 적다)")
