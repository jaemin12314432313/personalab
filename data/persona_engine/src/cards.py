import re

import pandas as pd

from . import config as C

APP_KW = ["앱", "어플", "애플리케이션", "스마트폰", "유튜브", "넷플릭스", "웹툰", "게임", "SNS", "인스타",
          "온라인", "배달", "쇼핑", "구독", "스트리밍", "커뮤니티", "영상", "OTT", "결제", "검색",
          "메신저", "카카오", "네이버", "틱톡"]
MONEY = re.compile(r"\d[\d,.]*\s*(원|만원|천원|%|퍼센트)")      # 금액·비율 숫자가 든 문장은 쓰지 않는다
HEALTH = re.compile(C.HEALTH_PATTERN)                          # 건강 서술 문장도 쓰지 않는다

OTT_S = {"단독": "OTT는 본인 명의로 직접 결제한다.",
         "친구와 나눔": "OTT는 친구들과 계정을 나눠 일부만 낸다.",
         "가족": "OTT는 가족 계정을 쓰고 본인은 내지 않는다.",
         "미이용": "돈을 내는 OTT는 쓰지 않는다."}
PRICE_S = {"높음": "새로 월 결제가 생기는 서비스는 거의 가입하지 않는다.",
           "중간": "꼭 필요한 서비스에만 돈을 낸다.",
           "낮음": "편하면 유료 서비스도 크게 망설이지 않고 결제한다."}
DIGI_S = {"높음": "새 앱에 금방 익숙해지고 사용법을 따로 찾아보지 않는다.",
          "중간": "새 앱은 화면이 익숙하면 쓰고, 낯설면 조금 헤맨다.",
          "낮음": "낯선 화면이 나오면 어디를 눌러야 할지 자주 망설인다."}
# 표시용: NVIDIA province 약칭 -> 자연스러운 약칭
PROVINCE_DISPLAY = {"경상남": "경남", "경상북": "경북", "충청남": "충남", "충청북": "충북",
                    "전라남": "전남", "전라북": "전북"}
NO_FIELD = {"해당없음", ""}                                    # 전공 계열 없음 (전문대 등)

NOVELTY_S = "새로운 서비스가 나오면 먼저 깔아보는 편이다."


def privacy_sentence(v) -> str:
    v = int(v)
    if v >= 5:
        return "가입할 때 개인정보를 많이 물으면 이유를 모르는 항목에서 바로 멈춘다."
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
    L += sent(p.get("cultural_background"))[:1]
    L.append(OTT_S[p["ott_payment"]])
    L.append(PRICE_S[p["ps_grade"]])
    L.append(DIGI_S[p["da_grade"]])
    if p["ns_grade"] == "높음":
        L.append(NOVELTY_S)
    L.append(privacy_sentence(p["privacy_concern"]))
    return "\n".join(L)


def add_cards(panel: pd.DataFrame) -> pd.DataFrame:
    panel = panel.copy()
    panel["card_text"] = panel.apply(build_card, axis=1)
    return panel
