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
           [f"m01{i:03d}" for i in range(1, 25)]


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

    priv = d["d23003"].where(d["d23003"].between(1, 5))      # 8(온라인 활동 안함) -> 결측
    d["privacy_concern"] = priv.fillna(weighted_median(priv, w)).round().astype("Int64")

    d["ps_grade"] = grade_balanced(d["price_sensitivity"], w, C.GRADE_LABELS, C.GRADE_SHARE_RANGE)
    d["da_grade"] = grade_balanced(d["digital_adoption"], w, C.GRADE_LABELS, C.GRADE_SHARE_RANGE)
    d["ns_grade"] = grade_balanced(d["novelty_seeking"], w, C.GRADE_LABELS, C.GRADE_SHARE_RANGE)
    d["ott_payment"] = d["d26061"].map({3: "단독", 2: "친구와 나눔", 1: "가족"}).fillna("미이용")
    return d
