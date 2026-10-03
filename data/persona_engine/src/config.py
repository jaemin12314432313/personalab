from pathlib import Path

YEAR = "24"                                   # 미디어패널 조사연도 (변수명 p24xxxx)
ROOT = Path(__file__).resolve().parents[1]     # data/persona_engine
DATA = ROOT.parent                              # 저장소의 data/
RAW, INTERIM, OUT = DATA / "raw", DATA / "interim", ROOT / "outputs"
SAV = RAW / "p24v32_KMP_spss.sav"               # 배포 파일명 (명세서의 p24v32_KMP.sav와 다름)
CODEBOOK = RAW / "P_codebook_v32.xlsx"
NVIDIA_ID = "nvidia/Nemotron-Personas-Korea"

# 가격 민감도 초안 가중치 (합 1.0). 바꾸면 버전을 기록한다.
WTP_WEIGHTS = {"ott": 0.35, "income": 0.25, "svod": 0.20, "app": 0.10, "ai": 0.10}
SCORING_VERSION = "v0.1-draft"
# v0.1: 학력 3범주(고졸이하/대졸/대학원) — school13이 재학·휴학생만 응답해 졸업자의 전문대/4년제 구분 불가
#       등급은 동점을 쪼개지 않는 경계로 (utils.grade_balanced)
#       등급 비율이 GRADE_SHARE_RANGE를 벗어나면 가장 큰 동점 덩어리를 '중간'에 고정

# 등급: 경계는 서로 다른 점수값 사이에만 둔다. 등급별 가중 비율이 이 범위를 벗어나면 경고
GRADE_LABELS = ["낮음", "중간", "높음"]
GRADE_SHARE_RANGE = (0.15, 0.50)

# 공통 범주
SCHOOLS = ["고졸이하", "대졸", "대학원"]
JOB_GROUPS = ["사무·관리", "전문·기술", "판매·서비스", "생산·기능", "농림어업", "학생", "무직·기타"]
REGIONS = ["수도권", "광역시", "기타"]
MARITALS = ["미혼", "기혼"]
AGE_EDGES = [18, 21, 24, 29, 39, 49, 59, 69, 200]
AGE_LABELS = ["19-21", "22-24", "25-29", "30s", "40s", "50s", "60s", "70+"]
KEYS = ["sex", "age_bin", "job_group", "school", "region3", "marital"]
RELAX = [KEYS, KEYS[:5], KEYS[:4], KEYS[:3]]   # match_level 1~4
CELL_KEYS = ["sex", "age_bin", "job_group", "school"]
MIN_POOL = 5

# 학생 추정 보강: NVIDIA 서술(persona·professional_persona)에 이 표현이 있으면 학생으로 보지 않는다
# (19~29세·대졸·'무직' 중 58%가 졸업 후 구직자로 서술됨)
JOBSEEK_PATTERN = r"취업 준비|취준|구직|취업을 준비|졸업 후|졸업한|사회 초년"
# 카드에 넣지 않는 건강 서술 (명세서 7장: 건강·가족사 같은 무관한 서술 제외)
HEALTH_PATTERN = r"비만|흡연|담배|질환|당뇨|고혈압|우울|불면|통증|투병"
