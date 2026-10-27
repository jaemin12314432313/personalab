"""백엔드용 입구. backend/app/services/persona/sample.py 의 sample_personas 를 이걸로 바꾼다.

    from src.api import generate          # sys.path에 data/persona_engine 추가 후
    people = generate({"age": "20-29", "job": ["학생"], "school": ["대졸"]}, n=100, seed=42)

조건 이름은 make_panel.py 옵션과 같다 (age, sex, job, school, region, marital, price, preset).
돌려주는 한 명 = personas.attributes_json 한 행: profile / card_text / traits / source.
"""
from . import config as C
from .cards import PROVINCE_DISPLAY, add_cards
from .checks import run_checks
from .donor import derive_donor, load_donor
from .engine import build_panel
from .nvidia import derive_nvidia, fetch_text, load_nvidia_struct

PRESETS = {
    "univ": {"age": (19, 29), "job": ["학생"], "school": ["대졸"]},   # 20대 대학(재학·휴학)생
    "30s_office": {"age": (30, 39), "job": ["사무·관리"]},
    "40s_all": {"age": (40, 49)},
    "60plus": {"age": (60, 120)},
}
# 조건 이름 -> (타깃 키, 고를 수 있는 값)
LIST_OPTS = {"job": ("job", C.JOB_GROUPS), "school": ("school", C.SCHOOLS), "region": ("region", C.REGIONS),
             "marital": ("marital", C.MARITALS), "price": ("price_sensitivity", C.GRADE_LABELS)}
_DATA = {}                                                    # 서버가 켜진 동안 한 번만 읽는다 (수십 초)


def parse_age(s) -> tuple:
    """'20-39' / '60-' / '25' / (20, 39) -> (최소, 최대)"""
    if isinstance(s, (list, tuple)):
        lo, hi = int(s[0]), int(s[1])
    else:
        s = str(s)
        lo_s, dash, hi_s = s.partition("-")
        try:
            lo = int(lo_s)
            hi = int(hi_s) if hi_s else (120 if dash else lo)
        except ValueError:
            raise ValueError(f"age 형식 오류: '{s}'. 예: 20-39, 60-, 25") from None
    if lo < 19 or hi < lo:
        raise ValueError(f"age 범위 오류: {s}. 만 19세 이상, 최소 <= 최대")
    return lo, hi


def parse_list(opt: str, value) -> list:
    """'사무관리,판매서비스' 또는 리스트 -> 정해진 값 목록. 가운뎃점(·)은 빼고 써도 된다."""
    allowed = LIST_OPTS[opt][1]
    key = lambda v: str(v).replace("·", "").replace("/", "").replace(" ", "")
    lookup = {key(x): x for x in allowed}
    vals = [v.strip() for v in value.split(",")] if isinstance(value, str) else list(value)
    vals = [v for v in vals if str(v).strip()]
    bad = [v for v in vals if key(v) not in lookup]
    if bad:
        raise ValueError(f"{opt} 값 오류: {bad}. 고를 수 있는 값: {', '.join(allowed)}")
    return [lookup[key(v)] for v in vals]


def parse_conditions(conditions: dict) -> dict:
    """화면·API에서 받은 조건 -> build_panel 타깃. 잘못된 값은 ValueError(한국어 메시지)."""
    conditions = dict(conditions or {})
    preset = conditions.pop("preset", None)
    if preset and preset not in PRESETS:
        raise ValueError(f"preset 값 오류: {preset}. 고를 수 있는 값: {', '.join(PRESETS)}")
    target = dict(PRESETS[preset]) if preset else {}
    unknown = set(conditions) - {"age", "sex", *LIST_OPTS}
    if unknown:
        raise ValueError(f"모르는 조건: {sorted(unknown)}")
    if conditions.get("age"):
        target["age"] = parse_age(conditions["age"])
    if conditions.get("sex"):
        if conditions["sex"] not in ("남", "여"):
            raise ValueError("sex 값 오류: 남 또는 여")
        target["sex"] = conditions["sex"]
    for opt, (key, _) in LIST_OPTS.items():
        if conditions.get(opt):
            target[key] = parse_list(opt, conditions[opt])
    return target


def _data():
    if not _DATA:
        _DATA["donor"] = derive_donor(load_donor())
        _DATA["nv"] = derive_nvidia(load_nvidia_struct())
    return _DATA["donor"], _DATA["nv"]


def generate_with_report(conditions: dict, n: int, seed: int) -> tuple[list[dict], dict]:
    """페르소나 목록과 점검 리포트(할당·분포·매칭 수준·경고)."""
    donor, nv = _data()
    panel, rep = build_panel(parse_conditions(conditions), n, seed, donor=donor, nv=nv)
    panel = add_cards(fetch_text(panel))
    rep["checks"] = run_checks(panel, rep)
    people = []
    for p in panel.to_dict("records"):
        people.append({
            "profile": {"age": int(p["age"]), "sex": p["sex"],
                        "region": PROVINCE_DISPLAY.get(p["province"], p["province"]), "region3": p["region3"],
                        "job_group": p["job_group"], "school": p["school"], "occupation": p["occupation"]},
            "card_text": p["card_text"],
            "traits": {"price": p["ps_grade"], "digital": p["da_grade"], "novelty": p["ns_grade"],
                       "privacy": int(p["privacy_concern"]), "ott": p["ott_payment"]},
            "source": {"persona_id": p["persona_id"], "nvidia_uuid": p["uuid"], "donor_pid": int(p["donor_pid"]),
                       "match_level": int(p["match_level"]), "student_inferred": bool(p["student_inferred"]),
                       "scoring_version": C.SCORING_VERSION, "seed": seed},
        })
    return people, rep


def generate(conditions: dict, n: int, seed: int) -> list[dict]:
    """backend sample_personas 와 같은 모양: personas.attributes_json 목록."""
    return generate_with_report(conditions, n, seed)[0]
