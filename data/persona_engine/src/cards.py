import re

import pandas as pd

from . import config as C

APP_KW = ["앱", "어플", "애플리케이션", "스마트폰", "유튜브", "넷플릭스", "웹툰", "게임", "SNS", "인스타",
          "온라인", "배달", "쇼핑", "구독", "스트리밍", "커뮤니티", "영상", "OTT", "결제", "검색",
          "메신저", "카카오", "네이버", "틱톡"]
MONEY = re.compile(r"\d[\d,.]*\s*(원|만원|천원|%|퍼센트)")      # 금액·비율 숫자가 든 문장은 쓰지 않는다
HEALTH = re.compile(C.HEALTH_PATTERN)                          # 건강 서술 문장도 쓰지 않는다

# 카드 문장 표 (v0.3). 평가 · 인터뷰 프롬프트와 공유하므로 바꾸면 config.SCORING_VERSION을 올린다.
# 가격 민감도 · OTT 결제 방식 문장은 v0.2부터 카드에 쓰지 않는다 (제품이 가격을 묻지 않음).
LEARN_S = {"높음": "새 앱에 금방 익숙해지고 사용법을 따로 찾아보지 않는다.",
           "중간": "새 앱은 화면이 익숙하면 쓰고, 낯설면 조금 헤맨다.",
           "낮음": "낯선 화면이 나오면 어디를 눌러야 할지 자주 망설인다."}
INFO_S = {"높음": "처음 보는 서비스는 출처와 근거를 확인하고, 광고처럼 보이는 문구는 의심한다.",
          "중간": "안내 문구는 대체로 믿지만, 중요한 내용은 한 번 더 확인한다.",
          "낮음": "화면에 나온 안내와 문구를 대체로 그대로 믿는다."}
TX_S = {"높음": "온라인 쇼핑 · 예약 · 간편결제가 익숙해 가입과 결제 절차를 빠르게 넘긴다.",
        "중간": "온라인 쇼핑과 예약은 해 봤지만, 처음 보는 절차는 천천히 확인한다.",
        "낮음": "온라인으로 결제하거나 예약하는 일이 드물어, 절차가 길면 부담스러워한다."}
AI_S = {"이용": "생성형 AI 서비스를 직접 써 봤다.",
        "앎": "생성형 AI가 무엇인지는 알지만 직접 써 보지는 않았다.",
        "들어봄": "생성형 AI는 들어 봤지만 잘 모른다.",
        "모름": "생성형 AI가 무엇인지 잘 모른다."}
SKILL_S = {"낮음": "스마트폰 설정을 바꾸거나 앱을 설치하는 일은 혼자 하기 어려워한다.",
           "중간": "스마트폰으로 자주 하는 일은 하지만, 설정을 바꾸는 일은 서툴다."}  # '충분'은 문장 없음
# 표시용: NVIDIA province 약칭 -> 자연스러운 약칭
PROVINCE_DISPLAY = {"경상남": "경남", "경상북": "경북", "충청남": "충남", "충청북": "충북",
                    "전라남": "전남", "전라북": "전북"}
NO_FIELD = {"해당없음", ""}                                    # 전공 계열 없음 (전문대 등)

NOVELTY_S = "새로운 서비스가 나오면 먼저 깔아보는 편이다."
# v0.3: 막혔을 때 도움을 받을 수 있는가 (기술 수용도 문항). 포기 여부를 정하지 않고 상황만 적는다
HELP_S = {"높음": "화면에서 막히면 주변에 물어볼 사람이 있다.",
          "중간": "화면에서 막히면 직접 찾아보거나 주변에 물어보기도 한다.",
          "낮음": "화면에서 막혀도 도와줄 사람이 마땅치 않아 혼자 해결해야 한다."}
APP_PREFIX = "평소 "                                           # 자주 쓰는 앱 문장의 시작 (뷰어가 행동 문장으로 가른다)


def app_sentence(habit) -> str:
    if not isinstance(habit, str) or not habit.strip():
        return ""
    return f"{APP_PREFIX}{habit} 앱을 주로 써서, 그 앱들의 화면 방식에 익숙하다."


def privacy_sentence(v) -> str:
    v = int(v)
    if v >= 5:
        return "가입할 때 개인정보를 많이 물으면 걱정이 크고, 이유가 보이지 않는 항목은 특히 불안하다."
    if v == 4:
        return "가입 때 묻는 개인정보가 많으면 불편하다."
    if v == 3:
        return "가입 때 개인정보 입력은 보통 넘긴다."
    return "가입할 때 개인정보를 입력하는 것에 크게 신경 쓰지 않는다."


def sentences(text) -> list:
    if not isinstance(text, str):
        return []
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip() and not MONEY.search(s) and not HEALTH.search(s)]


def job_phrase(p) -> str:
    if p["job_group"] == "학생":
        return "대학원생" if p["school"] == "대학원" else "대학생" if p["school"] == "대졸" else "학생"
    if p["job_group"] == "무직·기타":
        return "현재 일을 하고 있지 않은 사람"
    return re.sub(r"^그 외\s+", "", str(p["occupation"]))      # KSCO '그 외 ○○' -> '○○' 


def build_card(p: pd.Series) -> str:
    L = [f"{int(p['age'])}세 {'남자' if p['sex'] == '남' else '여자'} {job_phrase(p)}이고 {PROVINCE_DISPLAY.get(p['province'], p['province'])} 지역에 산다."]
    bf = p.get("bachelors_field")
    if p["school"] in ("대졸", "대학원") and isinstance(bf, str) and bf.strip() not in NO_FIELD:
        L.append(f"전공 계열은 {bf.strip()}이다.")
    sent = sentences
    if p["job_group"] == "학생":                              # 학생 카드에는 구직자 서술을 넣지 않는다
        sent = lambda x: [s for s in sentences(x) if not re.search(C.JOBSEEK_PATTERN, s)]
    L += sent(p.get("persona"))[:1]
    hs = sent(p.get("hobbies_and_interests"))
    hit = [s for s in hs if any(k in s for k in APP_KW)]
    L += (hit or hs[:1])[:2]
    L.append(LEARN_S[p["le_grade"]])
    if p.get("ds_level") in SKILL_S:                          # 디지털 활용 능력은 부족할 때만 쓴다
        L.append(SKILL_S[p["ds_level"]])
    L.append(TX_S[p["ot_grade"]])
    L.append(INFO_S[p["ic_grade"]])
    L.append(privacy_sentence(p["privacy_concern"]))
    L.append(AI_S[p["ai_familiarity"]])
    if p.get("help_grade") in HELP_S:
        L.append(HELP_S[p["help_grade"]])
    habit = app_sentence(p.get("app_habit"))
    if habit:
        L.append(habit)
    if p["ns_grade"] == "높음":
        L.append(NOVELTY_S)
    return "\n".join(L)


def add_cards(panel: pd.DataFrame) -> pd.DataFrame:
    panel = panel.copy()
    panel["card_text"] = panel.apply(build_card, axis=1)
    return panel
