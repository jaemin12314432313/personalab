from pathlib import Path

import numpy as np
import pandas as pd

from . import config as C

STRUCT_COLS = ["uuid", "sex", "age", "marital_status", "education_level",
               "bachelors_field", "occupation", "province"]
TEXT_COLS = ["persona", "hobbies_and_interests", "cultural_background"]

# 직업군 사전. NVIDIA occupation은 한국표준직업분류(KSCO) 세세분류 이름이고, donor job3도 KSCO 기준이다.
# KSCO 대분류 -> donor 직업군: 1 관리자·3 사무 -> 사무·관리 / 2 전문가 -> 전문·기술 / 4 서비스·5 판매 -> 판매·서비스
#                              6 -> 농림어업 / 7 기능·8 장치조작·9 단순노무 -> 생산·기능 / 군인 -> 무직·기타
# OCC_EXACT를 먼저 보고, 없으면 JOB_KEYWORDS를 위에서부터 부분 일치로 본다(먼저 맞는 그룹).
OCC_EXACT = {
    "검사": "전문·기술",                                       # '검사원'과 구분
    "소규모 상점 경영자": "판매·서비스",
    "소규모 상점 일선 관리 종사원": "판매·서비스",
    "카지노 딜러": "판매·서비스",
    "투자 권유 대행인": "판매·서비스",
    "결혼상담원": "판매·서비스",
    "장례 상담원": "판매·서비스",
    "웨딩플래너": "판매·서비스",
    "육아 도우미": "판매·서비스",
    "복지시설 생활 지도원": "전문·기술",
    "의료 서비스 상담 종사원": "사무·관리",
    "보험 설계사": "판매·서비스",                               # '설계'와 구분
    "장례 지도사": "판매·서비스",
    "사무용품 대여원": "판매·서비스",
    "도서 및 영상 기록 매체 대여원": "판매·서비스",
    "환경 검사원": "전문·기술",
    "보건 위생 검사원": "전문·기술",
    "비파괴 검사원": "전문·기술",
    "외환 딜러": "전문·기술",
    "증권 중개인": "전문·기술",
    "선물거래 중개인": "전문·기술",
}
JOB_KEYWORDS = [
    ("무직·기타", ["무직", "구직", "육군", "해군", "공군", "해병대"]),
    ("학생", ["학생"]),
    # KSCO 9 단순노무: 서비스·판매처럼 보여도 donor에서는 91~99 -> 생산·기능
    ("생산·기능", ["조작원", "조립원", "설치 및 수리원", "설치 및 정비원", "단순 종사원", "경비원", "청소원", "미화원", "수거원", "주차 관리원", "대리 주차원", "검표원",
                "수금원", "검침원", "배달원", "택배원", "우편집배원", "가사 도우미", "주방 보조원",
                "패스트푸드 준비원", "매장 정리원", "선별원", "수동 포장원", "수동 상표 부착원", "산불 감시원",
                "방역원", "구두 미화원", "세탁원", "요금 정산원", "주차 단속원", "환경 감시원", "하역",
                "건물 관리원"]),
    # KSCO 1 관리자
    ("사무·관리", ["관리자", "임원", "대표이사", "총장", "학장", "교장", "교감", "원장", "국회의원", "의회 의원",
                "장학관", "고위 공무원"]),
    # KSCO 2 전문가 및 관련 종사자
    ("전문·기술", ["전문가", "전문의", "의사", "약사", "간호사", "교사", "교수", "강사", "조교", "연구원", "기술자",
                "시험원", "제도사", "디자이너", "프로그래머", "개발자", "엔지니어", "작가", "기자", "편집자", "사서",
                "학예사", "기록물 관리사", "사진가", "관제사", "조종사", "항해사", "선장", "도선사", "선박 기관사",
                "치료사", "재활사", "위생사", "기공사", "방사선사", "임상병리사", "영양사", "의무 기록사", "심리사",
                "변호사", "판사", "목사", "신부", "승려", "전도사", "수녀", "종교", "감독", "연출", "배우", "가수",
                "연주가", "국악", "무용가", "안무가", "성우", "아나운서", "리포터", "모델", "운동선수", "코치", "심판",
                "경기 기록원", "평론가", "만화가", "삽화가", "창작자", "보육교사", "사회복지", "운영자", "분석가",
                "컨설턴트", "설계", "감리", "측량", "지도 제작", "사정관", "변리사", "법무사", "관세사", "사정사",
                "감정", "헤드헌터", "매니저", "이벤트", "레크리에이션", "산업 안전원", "위험 관리원", "색채",
                "조명기사", "음향", "촬영기사", "영상", "영사기사", "방송 송출", "스크립터", "지휘자", "성악가",
                "통역", "번역", "자산 운용가", "투자", "인수 심사원", "보존원", "활동가", "평가원", "집행관",
                "회계사", "세무사", "노무사", "상담사", "지도사", "기획자", "연구관", "연구사", "연구가", "건축가",
                "예술가", "심사원", "무대의상", "소품 관리원"]),
    # KSCO 3 사무
    ("사무·관리", ["사무", "비서", "입력원", "상담원", "추심원", "안내원", "접수원", "출납", "행정"]),
    # KSCO 4 서비스, 5 판매
    ("판매·서비스", ["판매", "영업", "상점", "계산원", "매표원", "대여원", "모집인", "설계사", "텔레마케터",
                  "조리사", "조리", "바리스타", "서비스 종사원", "서비스원", "미용사", "이용사", "관리사",
                  "메이크업", "간병인", "요양 보호사", "돌봄", "도우미", "바텐더", "캐디", "딜러", "승무원", "여행",
                  "장례", "혼례", "경찰", "소방관", "교도관", "구조대원", "구급 요원", "경호원", "점술가",
                  "민속신앙", "훈련사", "해설사", "유원시설", "오락", "노래방", "숙박", "주류", "음료", "음식",
                  "건강원", "개그맨", "중개", "경매사", "경호", "보안", "감시원", "간호조무사", "철도운송 관련 종사원",
                  "피부 및 체형", "주방장"]),
    # KSCO 7 기능, 8 장치·기계조작
    ("생산·기능", ["조작원", "조립원", "용접", "정비원", "수리원", "운전원", "기관사", "기능", "목공", "석공",
                "배관공", "도장", "판금", "제관", "금형", "주조", "단조", "주형원", "목형원", "세공원", "공예원",
                "재단사", "재봉사", "패턴사", "제화원", "수선원", "건립원", "시공원", "부착원", "부설원", "가설원",
                "해체원", "타설원", "보수원", "설치", "배선", "기사", "제빵사", "제과원", "도축원", "가공", "제조",
                "튜닝원", "조율사", "잠수", "광원", "채석원", "발파", "점검원", "운반", "포장", "생산", "건설",
                "기계", "정비", "수리", "설비", "인쇄", "봉제", "철골", "철근공", "방수공", "도배공", "미장공",
                "단열공", "비계공", "조적공", "유리", "석재", "시추", "굴착", "날염원", "등급원", "탕제원",
                "철로", "제조원", "건축원", "주입원", "전기원", "접속원", "세정원", "채굴", "선박부원",
                "등대원"]),
    # KSCO 6 농림어업
    ("농림어업", ["사육", "재배", "농업", "농부", "축산", "어업", "어부", "해녀", "조경원", "부화원", "양식원",
               "임업", "벌목", "원예"]),
]


def nvidia_dataset():
    """허깅페이스에서 parquet 파일만 받아(캐시) pyarrow 데이터셋으로 연다.
    load_dataset은 arrow 캐시로 한 번 더 변환해 디스크를 두 배 넘게 쓰므로 쓰지 않는다."""
    import pyarrow.dataset as pads
    from huggingface_hub import snapshot_download
    root = snapshot_download(C.NVIDIA_ID, repo_type="dataset", allow_patterns=["data/*.parquet"])
    files = sorted(str(p) for p in Path(root, "data").glob("*.parquet"))   # 파일 순서 = _row 순서
    return pads.dataset(files, format="parquet")


def load_nvidia_struct(cache=C.INTERIM / "nvidia_struct.parquet") -> pd.DataFrame:
    if cache.exists():
        return pd.read_parquet(cache)
    df = nvidia_dataset().to_table(columns=STRUCT_COLS).to_pandas()
    df["_row"] = np.arange(len(df))                          # 원본 행 번호(서술형 열 조회용)
    # 학생 추정 후보(19~29세·전문대/4년제·무직)만 서술을 읽어 구직자 서술 여부를 표시한다
    cand = (df["age"].between(19, 29) & df["education_level"].str.contains("전문대|4년제")
            & df["occupation"].str.strip().eq("무직"))
    t = nvidia_dataset().take(df.loc[cand, "_row"].to_numpy(),
                              columns=["persona", "professional_persona"]).to_pandas()
    txt = t["persona"].fillna("") + " " + t["professional_persona"].fillna("")
    df["jobseek_text"] = False
    df.loc[cand, "jobseek_text"] = txt.str.contains(C.JOBSEEK_PATTERN).to_numpy()
    cache.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(cache)
    return df


def fetch_text(panel: pd.DataFrame) -> pd.DataFrame:
    """뽑힌 페르소나의 서술형 열만 원본에서 가져온다."""
    t = nvidia_dataset().take(panel["_row"].to_numpy(), columns=TEXT_COLS).to_pandas()
    t.index = panel.index
    return panel.join(t)


def school_group(s: str) -> str:
    if "전문대" in s or "4년제" in s:                        # donor와 같이 대졸로 묶는다
        return "대졸"
    if "대학원" in s:
        return "대학원"
    if s in {"무학", "초등학교", "중학교", "고등학교"}:
        return "고졸이하"
    return "미상"


def region3_from_province(s: str) -> str:
    head = s[:2]
    if head in {"서울", "경기", "인천"}:
        return "수도권"
    if head in {"부산", "대구", "광주", "대전", "울산"}:
        return "광역시"
    if head in {"강원", "충청", "충북", "충남", "전라", "전북", "전남", "경상", "경북", "경남", "제주", "세종"}:
        return "기타"
    return "미상"


def occupation_group(occ: str) -> str:
    if not isinstance(occ, str):
        return "미분류"
    if occ in OCC_EXACT:
        return OCC_EXACT[occ]
    for group, kws in JOB_KEYWORDS:
        if any(k in occ for k in kws):
            return group
    return "미분류"


def derive_nvidia(df: pd.DataFrame) -> pd.DataFrame:
    d = df[df["age"] >= 19].copy()
    d["sex"] = d["sex"].str[:1]                              # 남자/여자 -> 남/여
    d["age_bin"] = pd.cut(d["age"], C.AGE_EDGES, labels=C.AGE_LABELS).astype(object)
    d["school"] = d["education_level"].map(school_group)
    d["region3"] = d["province"].map(region3_from_province)
    d["marital"] = np.where(d["marital_status"] == "미혼", "미혼", "기혼")
    unk = {"school": d.loc[d.school == "미상", "education_level"].unique().tolist(),
           "province": d.loc[d.region3 == "미상", "province"].unique().tolist()}
    if unk["school"] or unk["province"]:
        raise ValueError(f"매핑 안 된 값 -> 사전에 추가하세요: {unk}")

    occ_map = {o: occupation_group(o) for o in d["occupation"].unique()}
    base = d["occupation"].map(occ_map)
    inferred = (d["age"].between(19, 29) & d["school"].eq("대졸")
                & d["occupation"].str.strip().eq("무직"))    # 초안: 대학 학력 + 무직 -> 학생(추정)
    if "jobseek_text" in d:                                   # 서술이 구직자면 학생으로 보지 않는다
        inferred &= ~d["jobseek_text"]
    d["job_group"] = base.where(~inferred, "학생")
    d["student_inferred"] = inferred
    d["job_group"] = d["job_group"].replace("미분류", np.nan)
    return d
