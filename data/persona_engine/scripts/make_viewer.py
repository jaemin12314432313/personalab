"""outputs/의 패널들을 카드 뷰어 HTML 한 장으로 만든다. 사용: python scripts/make_viewer.py
결과: outputs/viewer.html (더블클릭으로 브라우저에서 열림, 인터넷 불필요)"""
import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import config as C                                   # noqa: E402
from src.cards import DIGI_S, NOVELTY_S, OTT_S, PRICE_S, PROVINCE_DISPLAY, privacy_sentence   # noqa: E402

BEHAVIOR = set(OTT_S.values()) | set(PRICE_S.values()) | set(DIGI_S.values()) | {NOVELTY_S} | \
           {privacy_sentence(v) for v in range(1, 6)}
FLAGS = {"건강 서술": C.HEALTH_PATTERN, "구직 서술": C.JOBSEEK_PATTERN}   # 카드에서 걸러졌어야 할 표현
COLS = ["persona_id", "age", "sex", "province", "occupation", "education_level", "job_group",
        "student_inferred", "ps_grade", "da_grade", "ns_grade", "privacy_concern", "ott_payment",
        "match_level", "pool_size", "over_cap"]


def split_card(text: str) -> dict:
    lines = text.split("\n")
    head = [lines[0]] + [x for x in lines[1:3] if x.startswith("전공 계열은")]
    rest = lines[len(head):]
    return {"head": head, "story": [x for x in rest if x not in BEHAVIOR],
            "behavior": [x for x in rest if x in BEHAVIOR]}


def load():
    data = {}
    for rp in sorted(C.OUT.glob("panel_*_report.json")):
        name = rp.name.replace("_report.json", "")
        j = json.loads(rp.read_text(encoding="utf-8"))
        pan = pd.read_parquet(C.OUT / f"{name}.parquet")
        rows = []
        for _, p in pan.iterrows():
            r = {c: (p[c].item() if hasattr(p[c], "item") else p[c]) for c in COLS if c in pan}
            r["province"] = PROVINCE_DISPLAY.get(r["province"], r["province"])
            r["card"] = split_card(p["card_text"])
            r["flags"] = [k for k, pat in FLAGS.items() if re.search(pat, p["card_text"])
                          and (k != "구직 서술" or p["job_group"] == "학생")]   # 구직 서술은 학생 카드에서만 문제
            rows.append(r)
        rep, ck = j["report"], j["checks"]
        data[name] = {"target": rep["target"], "n": len(pan), "donor_n": rep["donor_n"],
                      "match": rep["match_level_counts"], "donors_used": rep["donors_used"],
                      "max_reuse": rep["donor_max_reuse"], "shortfall": rep["shortfall"],
                      "warnings": rep.get("grade_warnings", []), "scoring": rep["scoring_version"],
                      "checks": {k: v["ok"] for k, v in ck.items() if isinstance(v, dict) and "ok" in v},
                      "dist_p": {k: v["p"] for k, v in ck["dist"].items()}, "rows": rows}
    return data


def main():
    data = load()
    tpl = (Path(__file__).with_name("viewer_template.html")).read_text(encoding="utf-8")
    page = tpl.replace("/*__DATA__*/null", json.dumps(data, ensure_ascii=False, default=str))
    head, body = page.split("<!--/HEAD-->")
    head = head.replace("<!--HEAD-->", "")
    # 웹 링크(Artifact)용: 문서 껍데기 없이 / 로컬용: 더블클릭으로 여는 완전한 문서
    (C.OUT / "viewer_web.html").write_text(head + body, encoding="utf-8")
    local = ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
             '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
             f'{head}</head>\n<body>{body}</body>\n</html>\n')
    out = C.OUT / "viewer.html"
    out.write_text(local, encoding="utf-8")
    print(f"{out} (+ viewer_web.html) | 패널 {len(data)}개, 카드 {sum(d['n'] for d in data.values())}장")


if __name__ == "__main__":
    main()
