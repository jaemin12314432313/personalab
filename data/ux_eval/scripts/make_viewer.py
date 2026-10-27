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

TRAIT_COLS = ["card_text", "privacy_concern", "ns_grade", "ott_payment"]

# 고객 구분: 키 -> (화면 이름, 그룹 순서, 그룹 설명). 설명은 Persona Engine 카드의 행동 문장과 같은 뜻으로 썼다
SEGMENTS = {
    "da_grade": ("디지털 수용도", ["낮음", "중간", "높음"], {
        "낮음": "낯선 화면이 나오면 어디를 눌러야 할지 자주 망설이는 사람",
        "중간": "익숙한 화면이면 쓰고, 낯설면 조금 헤매는 사람",
        "높음": "새 앱에 금방 익숙해지고 사용법을 따로 찾아보지 않는 사람"}),
    "ps_grade": ("가격 민감도", ["낮음", "중간", "높음"], {
        "낮음": "편하면 유료 서비스도 크게 망설이지 않고 결제하는 사람",
        "중간": "꼭 필요한 서비스에만 돈을 내는 사람",
        "높음": "새로 월 결제가 생기는 서비스는 거의 가입하지 않는 사람"}),
    "privacy": ("개인정보 우려", ["낮음", "보통", "높음", "매우 높음"], {
        "낮음": "가입할 때 개인정보 입력에 크게 신경 쓰지 않는 사람",
        "보통": "가입 때 개인정보 입력은 보통 넘기는 사람",
        "높음": "가입 때 묻는 개인정보가 많으면 불편해하는 사람",
        "매우 높음": "이유를 모르는 개인정보 항목에서 바로 멈추는 사람"}),
    "sex": ("성별", ["남", "여"], {"남": "남성", "여": "여성"}),
    "age_band": ("연령대", ["19~21세", "22~24세", "25~29세", "30대", "40대", "50대", "60세 이상"], {}),
}
PRIVACY_BAND = {1: "낮음", 2: "낮음", 3: "보통", 4: "높음", 5: "매우 높음"}


def segment_value(key: str, r: dict, t: dict):
    if key == "privacy":
        v = t.get("privacy_concern")
        return PRIVACY_BAND.get(int(v)) if pd.notna(v) else None
    if key == "age_band":
        a = int(r["age"])
        return ("19~21세" if a <= 21 else "22~24세" if a <= 24 else "25~29세" if a <= 29
                else "60세 이상" if a >= 60 else f"{a // 10 * 10}대")
    return r.get(key)


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
        traits = {}
        if info["panel"].exists():                            # 고객 구분용 특성을 패널에서 가져온다
            p = pd.read_csv(info["panel"]).set_index("persona_id")
            traits = p[[c for c in TRAIT_COLS if c in p]].to_dict("index")
        people = []
        for line in (d / "results.jsonl").read_text(encoding="utf-8").splitlines():
            r = json.loads(line)
            t = traits.get(r["persona_id"], {})
            card = t.get("card_text", "")
            r["profile"] = card.split("\n")[0] if card else ""
            r["card"] = card
            r["seg"] = {k: segment_value(k, r, t) for k in SEGMENTS}
            people.append(r)
        runs.append({"id": d.name, "mtime": (d / "results.jsonl").stat().st_mtime,
                     "model": info["model"], "version": info["version"], "cost": info["cost"],
                     "flow": flow, "flow_facts": flow_facts(flow), "people": people})
    runs.sort(key=lambda r: (r["flow"]["name"], r["version"], len(r["people"])))
    return runs


def main():
    runs = load_runs()
    if not runs:
        sys.exit("outputs/에 실제 평가 결과가 없습니다. scripts/evaluate.py를 먼저 실행하세요.")
    meta = {"criteria": [{"key": k, "name": n, "desc": d} for k, (n, d) in C.CRITERIA.items()],
            "labels": C.LABELS, "drop_ko": C.DROP_REASON_KO,
            "segments": [{"key": k, "name": n, "order": o, "desc": d} for k, (n, o, d) in SEGMENTS.items()]}
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
