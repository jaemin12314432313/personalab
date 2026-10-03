import re

import pandas as pd
from scipy.stats import chisquare

from . import config as C

BAD = re.compile(r"\d[\d,.]*\s*(원|만원|천원|%)")


def _chi(panel, col, expected):
    cats = sorted(expected)
    obs = panel[col].astype(str).value_counts()
    f_obs = [int(obs.get(c, 0)) for c in cats]
    tot = sum(f_obs)
    f_exp = [expected[c] * tot / sum(expected.values()) for c in cats]
    stat, p = chisquare(f_obs, f_exp)
    return {"p": round(float(p), 4), "ok": bool(p > 0.05),
            "obs": dict(zip(cats, f_obs)), "min_expected": round(min(f_exp), 1)}


def run_checks(panel: pd.DataFrame, rep: dict) -> dict:
    out = {}
    got = panel.groupby(C.CELL_KEYS).size()
    got = {"/".join(map(str, k)): int(v) for k, v in got.items()}
    want = {k: v - rep["shortfall"].get(k, 0) for k, v in rep["quota"].items()}
    out["quota_match"] = {"ok": got == {k: v for k, v in want.items() if v > 0},
                          "n": len(panel), "requested": rep["n"], "shortfall": rep["shortfall"]}
    out["dist"] = {c: _chi(panel, c, rep["expected"][c]) for c in rep["expected"]}
    lv = panel["match_level"]
    out["match_level"] = {"counts": rep["match_level_counts"],
                          "share_ge3": round(float((lv >= 3).mean()), 3),
                          "ok": bool((lv >= 3).mean() <= 0.5)}
    out["donor_reuse"] = {"donors_used": rep["donors_used"], "max_reuse": rep["donor_max_reuse"],
                          "cap": rep["donor_cap"], "over_cap_n": rep["over_cap_n"]}
    out["duplicate_cards"] = {"n": int(panel["card_text"].duplicated().sum()),
                              "ok": not panel["card_text"].duplicated().any()}
    out["card_numbers"] = {"n_bad": int(panel["card_text"].map(lambda t: bool(BAD.search(t))).sum()),
                           "ok": not panel["card_text"].map(lambda t: bool(BAD.search(t))).any()}
    return out
