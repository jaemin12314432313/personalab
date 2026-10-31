"""평가 결과를 표와 요약 문서로."""
import pandas as pd

from . import config as C


def flatten(rows: list[dict]) -> pd.DataFrame:
    """페르소나 한 명 = 한 줄. 기준마다 라벨·중요도 열."""
    recs = []
    for r in rows:
        rec = {k: r[k] for k in ("persona_id", "age", "sex", "job_group", "ps_grade", "da_grade", "status")}
        out = r.get("eval") or {}
        for key in C.CRITERIA:
            c = (out.get("criteria") or {}).get(key, {})
            rec[f"{key}_label"] = c.get("label")
            rec[f"{key}_importance"] = c.get("importance")
            rec[f"{key}_evidence"] = c.get("evidence")
        for k in ("complete", "complete_reason", "drop_screen", "drop_reason"):
            rec[k] = out.get(k)
        op = out.get("opinions") or {}
        for k in ("liked", "disliked", "suggestion"):
            rec[f"opinion_{k}"] = op.get(k)
        rec["screen_comments"] = " / ".join(f"{c['screen']}: {c['comment']}" for c in op.get("screen_comments", []))
        recs.append(rec)
    return pd.DataFrame(recs)


def summarize(df: pd.DataFrame, flow: dict, meta: dict) -> str:
    ok = df[df.status == "ok"]
    n = len(ok)
    L = [f"# UX 흐름 평가 요약: {flow['name']}", "",
         f"- 과제: {flow['task']} (화면 {len(flow['screens'])}개, 목표 {flow['goal']})",
         f"- 페르소나: {meta['panel']} 중 {meta['n']}명 · 성공 {n}명 · 실패 {meta['n'] - n}명",
         f"- 모델: {meta['model']} · 프롬프트 {C.PROMPT_VERSION}"
         + (f" · 사용량 {meta['cost']}" if meta.get("cost") else ""),
         "- 이 문서의 평가는 AI 페르소나의 응답이다 (Synthetic User Response). 실제 사용자 결과와 섞지 않는다.", ""]
    if not n:
        return "\n".join(L + ["성공한 응답이 없습니다."])

    done = (ok.complete == "예").mean()
    L += ["## 완주", "", f"끝까지 하겠다: **{done:.0%}** ({int((ok.complete == '예').sum())}/{n}명)", ""]
    drops = ok[ok.complete == "아니오"]
    if len(drops):
        label = {s["id"]: s["label"] for s in flow["screens"]}
        L += ["| 그만둘 화면 | 인원 |", "|---|---|"]
        L += [f"| {sid} {label.get(sid, '')} | {c} |" for sid, c in drops.drop_screen.value_counts().items()]
        L += ["", "| 이탈 이유 | 인원 |", "|---|---|"]
        L += [f"| {r} ({C.DROP_REASON_KO.get(r, '')}) | {c} |" for r, c in drops.drop_reason.value_counts().items()]
        L.append("")

    L += ["## 기준별 평가", "",
          "라벨 일치도 = 가장 많이 나온 라벨을 고른 비율. 라벨은 화면에서 확인되는 사실이라 페르소나와 상관없이 같아야 한다. "
          "낮으면 프롬프트나 입력이 모호하다는 신호다.", "",
          "| 기준 | 좋음 | 보통 | 나쁨 | 판단불가 | 대표 라벨 (일치도) | 중요도 높음 비율 |", "|---|---|---|---|---|---|---|"]
    for key, (name, _) in C.CRITERIA.items():
        lab = ok[f"{key}_label"].value_counts()
        mode = lab.idxmax()
        imp_hi = (ok[f"{key}_importance"] == "높음").mean()
        L.append(f"| {name} | " + " | ".join(str(int(lab.get(x, 0))) for x in C.LABELS)
                 + f" | {mode} ({lab.max() / n:.0%}) | {imp_hi:.0%} |")
    L.append("")

    L += ["## 페르소나 특성별 완주율", ""]
    for col, title in (("da_grade", "디지털 수용도"), ("ps_grade", "가격 민감도")):
        g = ok.groupby(col).complete.apply(lambda s: (s == "예").mean())
        g = g.reindex([x for x in C.IMPORTANCE[::-1] if x in g.index])   # 낮음, 중간, 높음 순
        L.append(f"- {title}: " + ", ".join(f"{k} {v:.0%}" for k, v in g.items()))
    L.append("")

    if "opinion_suggestion" in ok and ok.opinion_suggestion.notna().any():
        L += ["## 페르소나 의견 (개선 제안)", ""]
        L += [f"- {r.persona_id}: {r.opinion_suggestion}" for r in ok.itertuples() if r.opinion_suggestion]
        L.append("")
    L += ["## 대표 근거 (기준마다 대표 라벨을 고른 첫 응답)", ""]
    for key, (name, _) in C.CRITERIA.items():
        mode = ok[f"{key}_label"].value_counts().idxmax()
        ev = ok.loc[ok[f"{key}_label"] == mode, f"{key}_evidence"].iloc[0]
        L.append(f"- **{name} ({mode})**: {ev}")
    return "\n".join(L) + "\n"
