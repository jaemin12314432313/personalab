import math

import numpy as np
import pandas as pd

from . import config as C
from .donor import compute_scores
from .utils import allocate, grade_shares

SCORE_OUT = ["price_sensitivity", "ps_grade", "digital_adoption", "da_grade",
             "novelty_seeking", "ns_grade", "privacy_concern", "ott_payment"]
HABIT_OUT = ["d01001", "d01002", "d01003", "i02004", "d26092"]


def _filter(df: pd.DataFrame, t: dict) -> pd.DataFrame:
    lo, hi = t.get("age", (19, 120))
    m = df["age"].between(lo, hi)
    if t.get("sex"):
        m &= df["sex"] == t["sex"]
    for key, col in (("job", "job_group"), ("school", "school"),
                     ("region", "region3"), ("marital", "marital")):
        if t.get(key):
            m &= df[col].isin(t[key])
    return df[m]


def build_panel(target: dict, n: int = 100, seed: int = 42, *, donor: pd.DataFrame, nv: pd.DataFrame):
    """target 예: {"age": (19, 29), "job": ["학생"], "school": ["대졸"],
                   "price_sensitivity": ["중간", "높음"]}   (키는 모두 선택)
    donor = derive_donor() 결과, nv = derive_nvidia() 결과. (panel DataFrame, report dict) 반환."""
    rng = np.random.default_rng(seed)
    rep = {"target": {k: (list(v) if isinstance(v, (list, tuple)) else v) for k, v in target.items()},
           "n": n, "seed": seed, "scoring_version": C.SCORING_VERSION}

    # 1. donor 부분집합 + 그 안에서 점수 계산
    dsub = _filter(donor, target)
    rep["donor_n_before_dropna"] = len(dsub)
    dsub = dsub.dropna(subset=C.KEYS + ["wt"])
    rep["donor_n"] = len(dsub)
    if len(dsub) == 0:
        raise ValueError("조건에 맞는 donor가 없습니다. 타깃을 넓히세요.")
    dsub = compute_scores(dsub)
    lo, hi = C.GRADE_SHARE_RANGE
    rep["grade_share"] = {c: grade_shares(dsub[c], dsub["wt"]) for c in ["ps_grade", "da_grade", "ns_grade"]}
    rep["grade_warnings"] = [f"{c} {g} {v:.0%}" for c, sh in rep["grade_share"].items()
                             for g, v in sh.items() if not lo <= v <= hi]
    if target.get("price_sensitivity"):
        dsub = dsub[dsub["ps_grade"].isin(target["price_sensitivity"])]
        rep["donor_n_after_score_filter"] = len(dsub)
        if len(dsub) == 0:
            raise ValueError("점수 조건까지 맞는 donor가 없습니다.")

    # 2. 칸별 할당량 (donor 가중 비율)
    cell = dsub.groupby(C.CELL_KEYS)["wt"].sum()
    quota = allocate(cell[cell > 0], n)
    quota = quota[quota > 0]
    rep["quota"] = {"/".join(map(str, k)): int(v) for k, v in quota.items()}

    # 3. NVIDIA에서 칸별 추출
    pool = _filter(nv, target).dropna(subset=C.KEYS)
    groups = pool.groupby(C.CELL_KEYS).groups
    parts, short = [], {}
    for key, q in quota.items():
        idx = groups.get(key, [])
        k = min(int(q), len(idx))
        if k < q:
            short["/".join(map(str, key))] = int(q - k)
        if k:
            parts.append(pool.loc[idx].sample(k, random_state=int(rng.integers(1e9))))
    if not parts:
        raise ValueError("NVIDIA 후보가 없습니다.")
    panel = pd.concat(parts).sample(frac=1, random_state=int(rng.integers(1e9))).reset_index(drop=True)
    rep["nvidia_pool_n"] = len(pool)
    rep["shortfall"] = short

    # 4. 핫덱 매칭: donor 한 명의 값을 통째로 복사
    cap = max(2, math.ceil(len(panel) / len(dsub)))
    used = pd.Series(0, index=dsub.index)
    picks = []
    for _, p in panel.iterrows():
        for lvl, ks in enumerate(C.RELAX, start=1):
            mask = np.ones(len(dsub), dtype=bool)
            for k in ks:
                mask &= (dsub[k].to_numpy() == p[k])
            cand_all = dsub[mask]
            if len(cand_all) >= C.MIN_POOL or lvl == len(C.RELAX):
                break
        if cand_all.empty:
            raise RuntimeError(f"매칭 후보 0명: {p[C.CELL_KEYS].to_dict()}")
        cand = cand_all[used[cand_all.index] < cap]
        over = cand.empty
        if over:
            cand = cand_all
        w = cand["wt"].clip(lower=0).to_numpy()
        pr = w / w.sum() if w.sum() > 0 else None
        pick = cand.iloc[int(rng.choice(len(cand), p=pr))]
        used[pick.name] += 1
        picks.append((pick.name, lvl, over, len(cand_all)))

    pidx = [x[0] for x in picks]
    donor_part = dsub.loc[pidx, [c for c in ["pid"] + SCORE_OUT + HABIT_OUT if c in dsub.columns]]
    donor_part = donor_part.rename(columns={"pid": "donor_pid"}).reset_index(drop=True)
    panel = pd.concat([panel, donor_part], axis=1)
    panel["match_level"] = [x[1] for x in picks]
    panel["over_cap"] = [x[2] for x in picks]
    panel["pool_size"] = [x[3] for x in picks]
    panel.insert(0, "persona_id", [f"P{i + 1:03d}" for i in range(len(panel))])

    vc = used[used > 0]
    def wshare(col):
        t = dsub.groupby(col)["wt"].sum()
        return {str(k): float(v) for k, v in (t / t.sum()).items()}
    rep["expected"] = {c: wshare(c) for c in ["ps_grade", "da_grade", "privacy_concern", "ott_payment"]}
    rep["match_level_counts"] = panel["match_level"].value_counts().sort_index().to_dict()
    rep["donor_cap"] = cap
    rep["donors_used"] = int((used > 0).sum())
    rep["donor_max_reuse"] = int(vc.max())
    rep["over_cap_n"] = int(panel["over_cap"].sum())
    return panel, rep
