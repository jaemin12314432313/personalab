"""outputs/의 평가 결과를 보는 HTML 한 장. 사용: python scripts/make_viewer.py
결과: outputs/viewer.html (더블클릭으로 열림), outputs/viewer_web.html (웹 링크 게시용)"""
import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import config as C                                   # noqa: E402
from src.flow import flow_facts, load_flow, screen_facts      # noqa: E402

RUN_NAME = re.compile(r"^(?P<flow>.+?)_(?P<panel>panel_.+?)_n\d+_(?P<model>.+?)(?:_(?P<ver>v[\d.]+))?$")


def run_info(d: Path) -> dict | None:
    """run.json이 있으면 그것을, 없으면(초기 실행) 폴더 이름에서 흐름·패널·모델을 읽는다."""
    if (d / "run.json").exists():
        r = json.loads((d / "run.json").read_text(encoding="utf-8"))
        return {"flow": Path(r["flow"]), "panel": Path(r["panel"]), "model": r["model"],
                "version": r["prompt_version"], "cost": r.get("cost_usd")}
    m = RUN_NAME.match(d.name)
    if not m:
        return None
    return {"flow": C.ROOT / "samples" / f"{m['flow']}_flow.json", "panel": C.PANEL_DIR / f"{m['panel']}.csv",
            "model": m["model"], "version": m["ver"] or "v0.1", "cost": None}


def load_runs() -> list[dict]:
    runs = []
    for d in sorted(p for p in C.OUT.iterdir() if (p / "results.jsonl").exists()):
        info = run_info(d)
        if not info or not info["flow"].exists() or "mock" in info["model"]:
            continue
        flow = load_flow(info["flow"])
        for s in flow["screens"]:
            s["facts"] = screen_facts(s)
        cards = {}
        if info["panel"].exists():
            p = pd.read_csv(info["panel"])
            cards = dict(zip(p.persona_id, p.card_text))
        people = []
        for line in (d / "results.jsonl").read_text(encoding="utf-8").splitlines():
            r = json.loads(line)
            card = cards.get(r["persona_id"], "")
            r["profile"] = card.split("\n")[0] if card else ""
            r["card"] = card
            people.append(r)
        runs.append({"id": d.name, "model": info["model"], "version": info["version"], "cost": info["cost"],
                     "flow": flow, "flow_facts": flow_facts(flow), "people": people})
    runs.sort(key=lambda r: (r["flow"]["name"], r["version"], r["model"]))
    return runs


def main():
    runs = load_runs()
    if not runs:
        sys.exit("outputs/에 실제 평가 결과가 없습니다. scripts/evaluate.py를 먼저 실행하세요.")
    meta = {"criteria": [{"key": k, "name": n, "desc": d} for k, (n, d) in C.CRITERIA.items()],
            "labels": C.LABELS, "drop_ko": C.DROP_REASON_KO}
    tpl = Path(__file__).with_name("viewer_template.html").read_text(encoding="utf-8")
    page = (tpl.replace("/*__RUNS__*/null", json.dumps(runs, ensure_ascii=False, default=str))
               .replace("/*__META__*/null", json.dumps(meta, ensure_ascii=False)))
    head, body = page.split("<!--/HEAD-->")
    head = head.replace("<!--HEAD-->", "")
    (C.OUT / "viewer_web.html").write_text(head + body, encoding="utf-8")
    local = ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
             '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
             f'{head}</head>\n<body>{body}</body>\n</html>\n')
    (C.OUT / "viewer.html").write_text(local, encoding="utf-8")
    print(f"{C.OUT / 'viewer.html'} (+ viewer_web.html) | 실행 {len(runs)}개: " + ", ".join(r["id"] for r in runs))


if __name__ == "__main__":
    main()
