import numpy as np
import pandas as pd

from . import config as C
from .utils import grade_balanced, weighted_median, weighted_percentile

try:                                             # pandas 2.2 경고 억제 (없으면 무시)
    pd.set_option("future.no_silent_downcasting", True)
except Exception:
    pass

RAW_COLS = ["pid", "gender", "age1", "school1", "school2", "school13", "job1", "job3",
            "mar", "area", "income", "d26061", "d26057", "c06006", "c06010", "d31007",
            "d23003", "i02004", "d26092", "d01001", "d01002", "d01003", "wt"] + \
           [f"m01{i:03d}" for i in range(1, 25)] + \
           [c for c in C.PRIVACY_ITEMS + C.INFO_ITEMS + C.SKILL_ITEMS if c != "d23003"] + \
           ["i01002", "i01033", "i02001", "d31001", "d31002"]


def load_donor(path=C.SAV) -> pd.DataFrame:
    df = pd.read_spss(path, convert_categoricals=False)   # 값 라벨 변환 끔(코드 숫자 유지)
    df.columns = df.columns.str.lower()
    return df.replace(9999, np.nan)                        # 모름/무응답 -> 결측


def job3_group(code):
    if pd.isna(code):
        return np.nan
    c = int(code)
    if c == 1:
        return "무직·기타"                                  # 군인
    if 11 <= c <= 15 or 31 <= c <= 39:
        return "사무·관리"
    if 21 <= c <= 28:
        return "전문·기술"
    if 41 <= c <= 44 or 51 <= c <= 53:
        return "판매·서비스"
    if 61 <= c <= 63:
        return "농림어업"
    if 71 <= c <= 99:
        return "생산·기능"
    return np.nan


def region3_from_code(code):
    if pd.isna(code):
        return np.nan
    c = int(code)
    return "수도권" if c in (1, 4, 8) else "광역시" if c in (2, 3, 5, 6, 7) else "기타"


def derive_donor(df: pd.DataFrame, y: str = C.YEAR) -> pd.DataFrame:
    """원시 p24 변수 -> 공통 범주 열 + 점수 재료 열. 열 이름은 접두사 p24를 뗀 형태."""
    g = lambda s: df[f"p{y}{s}"]
    keep = [c for c in RAW_COLS if f"p{y}{c}" in df.columns]
    d = pd.DataFrame({c: g(c) for c in keep})
    d["age"] = d["age1"]
    d["sex"] = d["gender"].map({1: "남", 2: "여"})
    d["age_bin"] = pd.cut(d["age"], C.AGE_EDGES, labels=C.AGE_LABELS).astype(object)

    s1, s2, s13 = d["school1"], d["school2"], d["school13"]
    d["school"] = np.select(                                 # school13은 재학·휴학생만 응답 -> 대졸로 묶는다
        [s1.isin([0, 1, 2, 3, 6]), s1 == 4, s1 == 5],
        ["고졸이하", "대졸", "대학원"], default="미상")
    d["school"] = d["school"].replace("미상", np.nan)
    d["school_detail"] = s13.map({1: "전문대", 2: "4년제"})   # 참고용. 졸업자는 결측

    student = s2.isin([1, 2]) & s1.isin([4, 5])             # 재학/휴학 + 대학·대학원
    jg = d["job3"].map(job3_group).where(d["job1"] == 1, "무직·기타")
    d["job_group"] = jg.where(~student, "학생")
    d["region3"] = d["area"].map(region3_from_code)
    d["marital"] = d["mar"].map({1: "미혼", 2: "기혼", 3: "기혼", 4: "기혼"})
    return d[d["age"] >= 19].copy()


def compute_scores(d: pd.DataFrame) -> pd.DataFrame:
    """d 안에서의 가중 백분위로 점수 계산 (타깃 부분집합마다 새로 계산)."""
    d = d.copy()
    w = d["wt"]
    wt = C.WTP_WEIGHTS

    x_ott = d["d26061"].map({3: 1.0, 2: 0.6, 1: 0.3, 4: 0.0}).fillna(0.0)
    inc = d["income"].map({1: 0.0, 2: 0.25, 3: 0.5, 4: 1.0, 5: 1.0, 6: 1.0, 7: 1.0, 8: 1.0})
    x_inc = inc.fillna(inc.median() if inc.notna().any() else 0.0)
    spend = d["d26057"].where(d["d26057"] > 0)               # 지출자만
    x_svod = weighted_percentile(spend, w).fillna(0.0)
    x_app = (d["c06006"] == 1).astype(float)
    x_ai = (d["d31007"] == 1).astype(float)
    wtp = (wt["ott"] * x_ott + wt["income"] * x_inc + wt["svod"] * x_svod
           + wt["app"] * x_app + wt["ai"] * x_ai)
    d["price_sensitivity"] = (1 - weighted_percentile(wtp, w)).fillna(0.5)

    tech = d[[f"m01{i:03d}" for i in range(17, 25)]].mean(axis=1, skipna=True)
    nov = d[[f"m01{i:03d}" for i in range(1, 17)]].mean(axis=1, skipna=True)
    d["digital_adoption"] = weighted_percentile(tech, w).fillna(0.5)
    d["novelty_seeking"] = weighted_percentile(nov, w).fillna(0.5)

    # 개인정보 우려 (v0.2): 5문항 평균을 반올림한 1~5. 8(온라인 활동 안 함)·결측은 부분집합 가중 중앙값
    pcols = [c for c in C.PRIVACY_ITEMS if c in d.columns]
    pitems = d[pcols].where(d[pcols].apply(lambda s: s.between(1, 5)))
    priv = pitems.mean(axis=1, skipna=True)
    d["privacy_concern"] = priv.fillna(weighted_median(priv, w)).round().clip(1, 5).astype("Int64")

    # 학습 용이성: 새 디지털 서비스에 쉽게 익숙해지고 배우기 쉬운가 (2문항)
    d["learn_ease"] = weighted_percentile(d[C.LEARN_ITEMS].mean(axis=1, skipna=True), w).fillna(0.5)
    # 정보 검증 성향: 접한 정보의 사실 · 근거 · 의도를 따져 보는가 (5문항). 높을수록 그대로 믿지 않는다
    icols = [c for c in C.INFO_ITEMS if c in d.columns]
    d["info_check"] = weighted_percentile(d[icols].mean(axis=1, skipna=True), w).fillna(0.5)
    # 도움 가용성 (v0.3): 막혔을 때 물어볼 사람이 있는가 (1문항). 높을수록 도움을 받기 쉽다
    hcols = [c for c in C.HELP_ITEMS if c in d.columns]
    d["help_availability"] = weighted_percentile(d[hcols].mean(axis=1, skipna=True), w).fillna(0.5)
    # 자주 쓰는 앱 (v0.3): 1~3순위 범주를 짧은 이름으로 이어 붙인다 (익숙한 화면 방식). 없으면 빈 문자열
    def app_habit(row):
        names = []
        for c in ("d01001", "d01002", "d01003"):
            v = row.get(c)
            if pd.notna(v) and int(v) in C.APP_SHORT and C.APP_SHORT[int(v)] not in names:
                names.append(C.APP_SHORT[int(v)])
        return "·".join(names)
    d["app_habit"] = d.apply(app_habit, axis=1)
    # 온라인 거래 익숙함: 쇼핑 빈도 · 간편결제 · 인터넷전문은행 · 예약/예매 · 모바일 금융 (금액은 쓰지 않음)
    ow = C.ONLINE_TX_WEIGHTS
    x_shop = ((d["i01033"] - 1) / 7).clip(0, 1).fillna(0.0)          # 결측 = 온라인 쇼핑 안 함
    x_pay = (d["i02004"] == 1).astype(float)
    x_bank = (d["i02001"] == 1).astype(float)
    x_res = ((d["d25073"] - 1) / 4).clip(0, 1).fillna(0.0)
    x_mb = ((d["d25072"] - 1) / 4).clip(0, 1).fillna(0.0)
    tx = (ow["shop"] * x_shop + ow["easypay"] * x_pay + ow["netbank"] * x_bank
          + ow["reserve"] * x_res + ow["mbank"] * x_mb)
    d["online_tx"] = weighted_percentile(tx, w).fillna(0.5)
    # 생성형 AI 친숙도: 이용 여부 + 인지 정도 (범주)
    aware = d["d31001"].map({4: "앎", 3: "앎", 2: "들어봄", 1: "모름"})
    d["ai_familiarity"] = aware.where(d["d31002"] != 1, "이용").fillna("모름")
    # 디지털 활용 능력 (보조): 스마트기기 활용 14문항 평균의 절대 수준
    scols = [c for c in C.SKILL_ITEMS if c in d.columns]
    d["digital_skill"] = d[scols].mean(axis=1, skipna=True)
    lo_cut, hi_cut = C.DIGITAL_SKILL_CUTS
    d["ds_level"] = np.select([d["digital_skill"] < lo_cut, d["digital_skill"] < hi_cut],
                              C.DIGITAL_SKILL_LABELS[:2], default=C.DIGITAL_SKILL_LABELS[2])
    d.loc[d["digital_skill"].isna(), "ds_level"] = C.DIGITAL_SKILL_LABELS[2]

    gb = lambda col: grade_balanced(d[col], w, C.GRADE_LABELS, C.GRADE_SHARE_RANGE)
    d["ps_grade"] = gb("price_sensitivity")       # v0.2: 카드에는 쓰지 않음 (호환용)
    d["da_grade"] = gb("digital_adoption")        # v0.2: 카드에는 학습 용이성(le_grade)을 씀
    d["ns_grade"] = gb("novelty_seeking")
    d["le_grade"] = gb("learn_ease")
    d["ic_grade"] = gb("info_check")
    d["help_grade"] = gb("help_availability")
    d["ot_grade"] = gb("online_tx")
    d["ott_payment"] = d["d26061"].map({3: "단독", 2: "친구와 나눔", 1: "가족"}).fillna("미이용")
    return d
