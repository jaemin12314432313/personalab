"""고객 응답용 최소 프로필. 원문과 엔진 속성은 DB에서만 사용한다."""

from copy import deepcopy

from app.core.regions import region_name


def grade(value):
    if isinstance(value, int | float):
        return "높음" if value >= 4 else "중간" if value >= 2 else "낮음"
    return str(value) if value in ("낮음", "중간", "높음", "미등록") else "미등록"


def public_attributes(attributes, display_id=""):
    profile = attributes.get("profile") or {}
    traits = attributes.get("traits") or {}
    source = attributes.get("source") or {}
    visible = {
        k: deepcopy(profile[k]) for k in ("age", "sex", "region", "job_group") if k in profile
    }
    if "region" in visible:
        visible["region"] = region_name(visible["region"])
    digital = grade(traits.get("digital"))
    novelty = grade(traits.get("novelty"))
    privacy = grade(traits.get("privacy"))
    behaviors = {"digital": digital, "novelty": novelty, "privacy": privacy}
    summary = (
        f"{visible.get('age', '')}세 · {visible.get('job_group', '사용자')} · "
        f"{visible.get('region', '지역 미등록')}. 디지털 친숙도 {digital}, 새로운 기능 친숙도 "
        f"{novelty}, 개인정보 우려 {privacy}."
    )
    origin = {k: source[k] for k in ("library_entry_id", "library_panel_id", "stub") if k in source}
    if source.get("local_demo") is True:
        origin["local_demo"] = True
    if display_id:
        origin["persona_id"] = display_id
    origin["synthetic"] = True
    return {"profile": visible, "traits": behaviors, "card_text": summary, "source": origin}
