# PersonaLab 페르소나 엔진 구현 명세 (Claude Code용)

> **구현 완료 후 메모:** 이 문서는 구현 전 명세다. 실제 코드는 `data/persona_engine/`이 기준이고, 사용법은 `data/persona_engine/README.md`를 본다. 9장 참고 코드와 달라진 점(학력 3범주, KSCO 직업 사전, 등급 규칙, `datasets` 대신 parquet 직접 읽기 등)은 PR #6 본문에 정리했다.

이 문서 하나로 작업을 시작할 수 있게 썼다. 0장 규칙을 읽고, 10장의 Step 0부터 순서대로 진행한다.

## 0. 진행 규칙

### 목표

타깃 조건(연령대·성별·직업군·학력·권역 등)과 인원 N을 받아 **한국 AI 페르소나 N명**을 만드는 Python 엔진을 구현한다. 두 공개 데이터를 쓴다.

| 데이터 | 역할 |
|---|---|
| NVIDIA Nemotron-Personas-Korea | 누구인가: 인구통계 + 성격·생활 서술 |
| 한국미디어패널조사 2024 개인 데이터 (donor) | 돈과 앱을 어떻게 쓰는가: 소득·구독 지출·기술 수용도·개인정보 우려. 인원 비율도 여기서 가져온다 |

모델 학습은 없다. 표본 추출, 핫덱 매칭(실제 응답자 1명의 값을 통째로 복사), 문장 변환만 한다.

### 범위

- 한다: donor 전처리, NVIDIA 로딩·변환, 샘플링·매칭, 프롬프트 카드 생성, 품질 점검
- 하지 않는다: LLM 호출(API 키 불필요), Ask/Act 에이전트, 백엔드·프론트, 피그마 연동, 실제 참가자와의 비교

### 지켜야 할 규칙

1. Step 하나가 끝나면 그 Step의 "보고할 것"을 출력하고 **멈춘다**. 사용자가 확인하기 전에 다음 Step을 시작하지 않는다.
2. 이 문서의 값은 두 종류다. **[확인됨]**은 코드북이나 실제 실행으로 검증한 값이고, **[확인 필요]**는 해당 Step에서 직접 확인한다. 실제 값이 문서와 다르면 실제 값을 쓰고, 무엇이 달랐는지 보고한다.
3. 2025년 데이터는 쓰지 않는다. 필요한 변수(기술 수용도, OTT 지불 형태, 만 나이)가 2024년 조사에만 있다.
4. 값을 지어내지 않는다. 결측은 NaN으로 두고, 이 문서에 적힌 규칙으로만 채운다.
5. 점수 가중치와 임계값은 `src/config.py`에만 둔다. 5장의 점수 규칙을 바꾸고 싶으면 바꾸지 말고 제안만 한다.
6. 난수는 `seed`로 고정한다. 같은 입력과 seed는 같은 결과를 내야 한다.
7. Windows 환경이다. 경로는 `pathlib`, 콘솔 한글은 `set PYTHONUTF8=1`, CSV는 `utf-8-sig`로 저장한다.
8. `data/`와 `outputs/`는 git에 올리지 않는다(`.gitignore`에 추가).

## 1. 전체 흐름

```
타깃 조건 + N
   │
   ▼
[donor] 미디어패널 2024 개인 8,693명 → 만 19세 이상 → 타깃 조건으로 부분집합
   │     공통 범주 6개 + 점수 4개 (부분집합 안에서 가중 백분위로 계산)
   ▼
칸별 할당량 = donor 가중 비율  (성별 × 연령대 × 직업군 × 학력)
   │
   ▼
[NVIDIA] 같은 타깃으로 후보 필터 → 칸별 무작위 추출 → N명
   │
   ▼
핫덱 매칭: 각 NVIDIA 페르소나에 공통 범주가 같은 donor 1명을 골라
           점수·습관 변수를 통째로 복사 (donor_pid, match_level 기록)
   │
   ▼
카드 문장 변환 (숫자 없는 문장) → outputs/panel_*.parquet · .csv · _report.json
```

변수를 한 donor에게서 통째로 가져오는 것이 핵심이다. 변수마다 따로 뽑으면 "소득 없음인데 OTT 단독 결제" 같은 모순이 생긴다.

## 2. 환경과 폴더

```
personalab/
├─ data/raw/          p24v32_KMP.sav, P_codebook_v32.xlsx  (직접 넣는다)
├─ data/interim/      nvidia_struct.parquet (Step 2에서 자동 생성)
├─ outputs/
├─ src/               config, utils, donor, nvidia, engine, cards, checks (9장 코드)
├─ scripts/make_panel.py
└─ requirements.txt
```

```
pip install -r requirements.txt
```

- NVIDIA 데이터는 허깅페이스 공개 데이터셋이다: `load_dataset("nvidia/Nemotron-Personas-Korea", split="train")`. 로그인 없이 받아져야 한다. 권한 오류가 나면 그때 `hf auth login`을 안내하고 멈춘다.
- 처음 받을 때 용량이 크고 오래 걸릴 수 있다(수 GB 추정). 메모리가 부족하면 `streaming=True`로 분포만 먼저 본다.
- 이 문서의 코드는 **합성 데이터로 끝까지 실행해 확인했다**(pandas 2.2.3, 3.0). 실제 데이터에서는 열 이름과 값이 다를 수 있으므로 Step 0~2에서 확인한 뒤 고친다.

## 3. 입력 A: 한국미디어패널조사 2024 개인 데이터 (donor)

### 3-1. 읽기

`data/raw/p24v32_KMP.sav`를 읽는다. **`convert_categoricals=False`가 필수**다. 기본값은 값 라벨을 순서 없는 범주형으로 바꿔서 `between`, `==4` 같은 비교가 깨진다.

```python
df = pd.read_spss("data/raw/p24v32_KMP.sav", convert_categoricals=False)
df.columns = df.columns.str.lower()
df = df.replace(9999, np.nan)        # 9999 = 모름/무응답
```

- 2024년 개인 응답자는 8,693명이다 [확인됨].
- 코드북 규칙: `9999` 모름/무응답, `.` 결측/응답사항 없음. 변수명의 `__`는 조사연도 두 자리다(2024 → `p24...`).
- 서비스 이용자에게만 묻는 문항(`d26061`, `d26057`, `d31007`)의 결측은 "미이용"으로 해석한다(5장).

### 3-2. 변수 표

| 변수 | 의미 | 값 | 상태 |
|---|---|---|---|
| `p24pid` | 개인 ID | | 유저가이드 변수명 규칙 예시(`p25pid`) 기준, Step 0에서 확인 |
| `p24wt` | 개인 통합패널 횡단면 가중치 | | 유저가이드 표 2-3 `p(d)__wt`. 기존패널용 `p24wt_org`는 쓰지 않는다. Step 0에서 열 존재 확인 |
| `p24gender` | 성별 | 1 남, 2 여 | 확인됨 |
| `p24age1` | 만 나이 | 연속값 | 확인됨(2025년에는 없음) |
| `p24school1` | 최종학교 | 0 무학, 1 초, 2 중, 3 고, 4 대학교, 5 대학원, 6 미취학 | 확인됨 |
| `p24school2` | 이수여부 | 1 재학, 2 휴학, 3 중퇴, 4 수료, 5 졸업 | 확인됨 |
| `p24school13` | 대학교 학교 분류 | 1 전문대, 2 대학교 (`school1==4`일 때) | 확인됨 |
| `p24job1` | 직업 유무 | 1 예, 2 아니오 | 확인됨 |
| `p24job3` | 직업코드 | 1 군인, 11~15 관리직, 21~28 전문직, 31~39 사무직, 41~44 서비스직, 51~53 판매직, 61~63 농림어업, 71~79 기능직, 81~89 기계조작직, 91~99 단순노무직 | 확인됨 |
| `p24mar` | 결혼 여부 | 1 미혼, 2 배우자 있음, 3 사별, 4 이혼 | 확인됨 |
| `p24area` | 거주 시도 | 1 서울, 2 부산, 3 대구, 4 인천, 5 광주, 6 대전, 7 울산, 8 경기, 9 강원, 10 충북, 11 충남, 12 전북, 13 전남, 14 경북, 15 경남, 16 제주, 17 세종 | 개인 코드북에는 없고 가구 코드북 `h__area` 라벨이다. `p24area`가 같은 코드인지 Step 0에서 값 범위 1~17로 확인 |
| `p24income` | 개인 월평균 소득 | 1 소득 없음, 2 50만 원 미만, 3 50~100만, 4 100~200만, 5 200~300만, 6 300~400만, 7 400~500만, 8 500만 이상 | 확인됨 |
| `p24d26061` | OTT 이용료 지불 형태 | 1 가족 단위, 2 친구·지인과 나눠 일부만, 3 단독, 4 기타 | 확인됨 |
| `p24d26057` | OTT 월평균 지출 금액(월정액제) | 연속값 | 단위는 코드북에 없음. Step 0에서 값 분포 확인(5장은 백분위만 쓰므로 단위와 무관) |
| `p24c06006` | 유료 앱 구입 경험 | 1 있음, 2 없음 | 확인됨 |
| `p24d31007` | 생성형 AI 유료 서비스 이용 | 1 예, 2 아니오 | 확인됨 |
| `p24d23003` | "온라인 사이트에 가입할 때 개인정보를 너무 많이 요구하는 것이 걱정스럽다" | 1 전혀 아니다 ~ 5 매우 그렇다, 8 온라인 활동 안 함 | 확인됨 |
| `p24m01001`~`p24m01016` | 소비자 혁신성 16문항(기능 1~4, 쾌락 5~8, 사회 9~12, 인지 13~16) | 1~5 | 확인됨 |
| `p24m01017`~`p24m01024` | 기술 수용도 8문항 | 1~5. 역코딩 문항 없음(문항 문구 확인) | 확인됨 |
| `p24d01001`~`p24d01003` | 자주 쓰는 스마트기기 앱 1~3순위 | 1~25 앱 분류, 88 이용경험 없음 | `d01001`만 확인, 02·03은 Step 0 |
| `p24i02004` | 모바일 간편결제 사용 | 1 예, 2 아니오 | 확인됨 |
| `p24d26092` | 숏폼 OTT 이용 | 1 예, 2 아니오 | 확인됨 |

쓰지 않는 변수: `p24rel`, `p24hhldsiz`(거주 형태), `p24school14`(대학 학과 계열), `p24job4`, `p24c06010`.

### 3-3. 코드북 조회 헬퍼

`P_codebook_v32.xlsx`는 시트별로 변수가 나뉜다. 헤더(3번째 행)에 연도가 있고 변수명 행 아래에 값 행이 이어진다. 값이 의심되면 아래로 라벨을 확인한다.

```python
from openpyxl import load_workbook

def codebook_lookup(var, year=2024, path="data/raw/P_codebook_v32.xlsx"):
    """예: codebook_lookup('p__income') -> (설명, [(코드, 라벨, 해당 연도 가중 %), ...])"""
    wb = load_workbook(path, read_only=True)
    for sn in wb.sheetnames[2:]:
        rows = list(wb[sn].iter_rows(values_only=True))
        if len(rows) < 4 or year not in rows[2]:
            continue
        c = list(rows[2]).index(year)
        cur, desc, out = None, None, []
        for r in rows[3:]:
            if len(r) > 1 and r[1]:
                cur = r[1]
                if cur == var:
                    desc = str(r[2]).replace("\n", " ")
            if cur == var and len(r) > c:
                out.append((r[3], r[4], r[c]))
        if out:
            return desc, out
    return None, []
```

### 3-4. donor 쪽 공통 범주 (파생)

모든 범주는 `derive_donor()`가 만든다. 만 19세 이상만 남긴다.

| 열 | 규칙 |
|---|---|
| `sex` | `p24gender` 1 → "남", 2 → "여" |
| `age_bin` | 19~21, 22~24, 25~29, 30대, 40대, 50대, 60대, 70+ (`19-21`, `22-24`, `25-29`, `30s`, `40s`, `50s`, `60s`, `70+`) |
| `school` | `school1`이 0,1,2,3,6 → "고졸이하" / `school1==4`이고 `school13==1` → "전문대" / `school1==4`이고 `school13==2` → "4년제" / `school1==5` → "대학원" |
| `job_group` | ① `school2`가 1,2(재학·휴학)이고 `school1`이 4,5 → "학생" ② 아니면 `job1==1`이면 `job3`을 그룹으로 변환 ③ 직업 없음 → "무직·기타" |
| `region3` | `p24area` 1,4,8 → "수도권" / 2,3,5,6,7 → "광역시" / 나머지 → "기타" |
| `marital` | `p24mar` 1 → "미혼", 2·3·4 → "기혼" |

`job3` → 직업군: 11~15·31~39 "사무·관리", 21~28 "전문·기술", 41~44·51~53 "판매·서비스", 61~63 "농림어업", 71~99 "생산·기능", 1(군인) "무직·기타".

직업군은 7개다: 사무·관리, 전문·기술, 판매·서비스, 생산·기능, 농림어업, 학생, 무직·기타.

키 열(`sex`, `age_bin`, `job_group`, `school`, `region3`, `marital`)이나 `wt`가 NaN인 donor는 매칭 대상에서 뺀다. 빠진 수를 보고한다.

### 3-5. 20대 대학생 검증 프리셋의 기대값 [확인됨]

타깃 `{"age": (19, 29), "job": ["학생"], "school": ["전문대", "4년제"]}`의 donor는 아래 조건과 같아야 한다: `p24age1` 19~29, `p24school1 == 4`, `p24school2 in (1, 2)`. 이전 실행 결과는 다음과 같다.

| 항목 | 값 |
|---|---|
| donor 수 | **375명** |
| 성별 × 연령(19~21 / 22~24 / 25~29) | 남 96 / 79 / 39, 여 98 / 55 / 8 |
| `school13` | 대학교 338, 전문대 37 |
| 권역 | 수도권 206, 광역시 89, 기타 80 |
| `p24rel`(가구주와의 관계) | 가구주의 자녀 359, 손자녀 14, 기타 2 → 자취·1인가구 학생이 거의 없다. 그래서 거주 형태는 매칭 키에서 뺐다 |
| `p24income` | 1:301, 2:25, 3:28, 4:10, 5:9, 7:1, 8:1 |
| `p24d26061` | 1:146, 2:47, 3:80, 4:1, 결측:101 |
| `p24d23003` | 1:6, 2:40, 3:72, 4:141, 5:116 (8 없음) |
| 결측률 | `d31007` 0.62, `d26057` 0.28, `d26061` 0.27, 나머지 점수 재료 0.00 |

## 4. 입력 B: NVIDIA Nemotron-Personas-Korea

### 4-1. 열

26개 열이다(구조화 12 + 페르소나 서술 7 + 속성 6 + `uuid`). 라이선스는 CC BY 4.0이다. 열 이름은 허깅페이스 뷰어에서 읽은 것이라 Step 2에서 `ds.column_names`로 확인한다. **[확인 필요]**

| 용도 | 열 |
|---|---|
| 필터·매칭 키 (`STRUCT_COLS`) | `uuid`, `sex`, `age`, `marital_status`, `education_level`, `bachelors_field`, `occupation`, `province` |
| 카드 문장 (`TEXT_COLS`, 뽑힌 페르소나만 조회) | `persona`, `hobbies_and_interests`, `cultural_background` |
| 쓰지 않음 | `sports_persona`, `arts_persona`, `travel_persona`, `culinary_persona`, `family_persona`, `professional_persona`, `career_goals_and_ambitions`, `skills_and_expertise`(+`_list`), `hobbies_and_interests_list`, `military_status`, `district`, `country`, `family_type`, `housing_type` |

NVIDIA에는 소득·앱 이용·구독 지출·가격 민감도가 **없다**. 그래서 donor가 필요하다. 가격을 제시하는 질문에서 응답이 그 금액으로 수렴한 선례(400명 중 246명이 제시 금액 9,900원으로 답함)가 이 부재 때문이었다.

### 4-2. 관찰된 값 (허깅페이스 뷰어, 일부)

| 열 | 관찰된 값 |
|---|---|
| `sex` | 남자, 여자 |
| `age` | 정수 19~99 |
| `education_level` | 7개 범주 중 6개 관찰: 초등학교, 중학교, 고등학교, 2~3년제 전문대학, 4년제 대학교, 대학원. 나머지 1개는 미확인 |
| `marital_status` | 배우자있음, 미혼, 사별, 이혼 |
| `province` | 17개 시도 약칭. 서울, 경기, 인천, 부산, 광주, 대전, 울산, 강원, 제주, 전북, 경상북, 경상남, 충청남 등을 관찰 |
| `occupation` | 자유 문자열. "무직"(4년제 학력의 22세), "전직 양식 조리사, 현재 구직중" 관찰. **"대학생"이라는 값은 관찰하지 못했다** |

### 4-3. 공통 범주 변환 (`derive_nvidia`)

| 열 | 규칙 |
|---|---|
| `sex` | "남자" → "남", "여자" → "여" (첫 글자) |
| `age_bin` | donor와 같은 구간 |
| `school` | "전문대" 포함 → "전문대" / "4년제" 포함 → "4년제" / "대학원" 포함 → "대학원" / 무학·초등학교·중학교·고등학교 → "고졸이하". **그 외 값이 나오면 오류를 내고 사전에 추가한다** |
| `region3` | province 앞 두 글자: 서울·경기·인천 → "수도권", 부산·대구·광주·대전·울산 → "광역시", 강원·충청·전라·경상·제주·세종 계열 → "기타". **그 외 값이 나오면 오류** |
| `marital` | "미혼" → "미혼", 나머지 → "기혼" |
| `job_group` | 아래 4-4 |

### 4-4. 직업군 분류 (가장 손이 가는 부분)

NVIDIA `occupation`은 자유 문자열이라 donor의 7개 직업군에 맞춰 **키워드 사전**(`JOB_KEYWORDS`, 9장 코드)으로 분류한다. 앞에서부터 먼저 맞는 그룹이 된다. 코드의 사전은 **시드 목록**이다. Step 2에서 실제 값을 보고 확장한다.

- 순서가 중요하다. "전직 양식 조리사, 현재 구직중"이 "구직" 때문에 "무직·기타"로 가야 하므로 무직 키워드가 먼저다.
- 매칭되지 않으면 "미분류"(NaN)가 되어 매칭 대상에서 빠진다. 목표는 만 19~70세 행의 **90% 이상 분류**다.
- **학생 추정 규칙(초안)**: `occupation`에 "학생"이 들어 있거나, (만 19~29세 + 전문대·4년제 학력 + `occupation`이 정확히 "무직")이면 "학생"으로 본다. 후자는 `student_inferred=True`로 표시한다. 대학 졸업 후 구직 중인 사람이 섞일 수 있는 규칙이므로 한계에 기록한다(11장).

## 5. 점수 계산 (donor 쪽)

점수는 **그 스터디의 타깃 부분집합 안에서** 가중 백분위(`wt` 가중, 동점은 중간순위)로 계산한다. "20대 대학생 중 상위"와 "전 연령 중 상위"는 다른 집단이므로 `build_panel` 호출마다 새로 계산한다. 백분위는 0~1이고, 삼분위(1/3, 2/3)로 낮음·중간·높음 등급을 만든다.

### 5-1. price_sensitivity (가격 민감도)

먼저 "돈을 내고 쓰는 정도" WTP를 만들고, 그 백분위를 뒤집는다.

| 요소 | 변수 | 변환 | 가중치 |
|---|---|---|---|
| OTT 지불 형태 | `d26061` | 3 단독 1.0 / 2 친구와 나눔 0.6 / 1 가족 0.3 / 4 기타·결측 0 | 0.35 |
| 개인 소득 | `income` | 1 → 0 / 2 → 0.25 / 3 → 0.5 / 4~8 → 1.0 / 결측은 중앙값 | 0.25 |
| OTT 월 지출 | `d26057` | 지출>0인 사람 안에서의 가중 백분위, 그 외 0 | 0.20 |
| 유료 앱 구입 | `c06006` | 1 → 1, 그 외 0 | 0.10 |
| 생성형 AI 유료 | `d31007` | 1 → 1, 그 외(결측 포함) 0 | 0.10 |

```
WTP = 0.35·x_ott + 0.25·x_income + 0.20·x_svod + 0.10·x_app + 0.10·x_ai
price_sensitivity = 1 − 가중백분위(WTP)        # 값이 높을수록 가격에 민감
```

OTT 지불 형태에 가장 큰 비중을 둔 이유: 대학생 donor는 80%가 소득 "없음"이라 소득의 변별력이 약하고, "구독료를 본인이 내는가"가 가입·결제 화면 반응과 가장 가깝다. **이 가중치는 초안이다.** `config.WTP_WEIGHTS`와 `SCORING_VERSION`에만 두고, 바꾸면 버전을 기록한다.

### 5-2. digital_adoption, novelty_seeking

- `digital_adoption` = 기술 수용도 8문항(`m01017`~`m01024`) 평균(결측 제외)의 가중 백분위
- `novelty_seeking` = 소비자 혁신성 16문항(`m01001`~`m01016`) 평균의 가중 백분위. 카드에서는 "높음"일 때만 쓴다
- 전부 결측이면 0.5

### 5-3. privacy_concern

`p24d23003` 원점수(1~5)를 그대로 쓴다. 8(온라인 활동 안 함)과 결측은 부분집합의 가중 중앙값으로 채우고 반올림한다.

### 5-4. 그 외 복사 열

- `ott_payment`: 3 → "단독", 2 → "친구와 나눔", 1 → "가족", 결측·4 → "미이용"
- 습관 변수(`d01001`~`d01003`, `i02004`, `d26092`)는 **저장만 하고 카드에는 쓰지 않는다**

## 6. 샘플링 + 핫덱 매칭 (`build_panel`)

```python
build_panel(target: dict, n: int = 100, seed: int = 42, *, donor, nv) -> (panel_df, report_dict)
```

### 타깃 조건 (모두 선택)

| 키 | 값 | 예 |
|---|---|---|
| `age` | (최소, 최대) 만 나이, 기본 (19, 120) | `(19, 29)` |
| `sex` | "남" 또는 "여" | |
| `job` | 직업군 리스트 | `["학생"]` |
| `school` | 학력 리스트 | `["전문대", "4년제"]` |
| `region` | 권역 리스트 | `["수도권"]` |
| `marital` | 혼인 리스트 | `["미혼"]` |
| `price_sensitivity` | 등급 리스트. donor 부분집합에서 점수를 계산한 **뒤** 걸러낸다 | `["중간", "높음"]` |

### 알고리즘

1. **donor 부분집합**: 타깃으로 거르고, 키 열·`wt`가 NaN인 행을 뺀다. 점수를 그 안에서 계산한다. `price_sensitivity` 조건이 있으면 그 뒤에 거른다. donor가 0명이면 오류.
2. **칸별 할당량**: (성별 × 연령대 × 직업군 × 학력) 칸의 `wt` 합 비율대로 N명을 배분한다(최대 나머지 방식).
3. **NVIDIA 추출**: 같은 타깃으로 거른 후보에서 칸마다 할당량만큼 무작위 추출한다. 후보가 모자라면 `shortfall`에 기록하고 있는 만큼만 뽑는다(N명 미달).
4. **donor 매칭**: 각 페르소나마다 키 6개가 모두 같은 donor 후보를 모으고, **후보가 5명 미만이면 조건을 하나씩 푼다.**

| match_level | 일치시키는 키 |
|---|---|
| 1 | 성별, 연령대, 직업군, 학력, 권역, 혼인 |
| 2 | 혼인 해제 |
| 3 | 권역까지 해제 |
| 4 | 학력까지 해제 (성별, 연령대, 직업군) |

5. **donor 선택**: 후보 중 한 명을 `wt` 비례로 무작위 선택한다. 한 donor의 사용 상한은 `max(2, ceil(N / donor 수))`이고, 상한을 넘기지 않는 후보가 없으면 상한을 무시하고 `over_cap=True`로 표시한다.
6. **복사와 기록**: 점수·습관 변수를 통째로 복사하고 `donor_pid`, `match_level`, `over_cap`, `pool_size`를 함께 저장한다.

`match_level` 3 이상이 절반을 넘으면 그 스터디의 페르소나는 타깃을 정확히 반영하지 못한 것이므로 리포트에 경고한다.

### 출력 열 (`panel`)

`persona_id`(P001…), `uuid`, `sex`, `age`, `province`, `region3`, `education_level`, `school`, `bachelors_field`, `occupation`, `job_group`, `student_inferred`, `marital`, `donor_pid`, `price_sensitivity`·`ps_grade`, `digital_adoption`·`da_grade`, `novelty_seeking`·`ns_grade`, `privacy_concern`, `ott_payment`, 습관 변수 5개, `match_level`, `over_cap`, `pool_size`, 서술형 3열, `card_text`.

## 7. 프롬프트 카드

에이전트에 들어갈 텍스트다. **숫자(금액·비율·점수)를 넣지 않고 문장만 넣는다.** LLM은 0.76과 0.62의 차이를 행동으로 잘 번역하지 못하고, 금액은 가격 질문의 앵커가 된다. 나이만 예외다.

| 속성 | 값 | 문장 |
|---|---|---|
| `ott_payment` | 단독 | OTT는 본인 명의로 직접 결제한다. |
| | 친구와 나눔 | OTT는 친구들과 계정을 나눠 일부만 낸다. |
| | 가족 | OTT는 가족 계정을 쓰고 본인은 내지 않는다. |
| | 미이용 | 돈을 내는 OTT는 쓰지 않는다. |
| `ps_grade` | 높음 | 새로 월 결제가 생기는 서비스는 거의 가입하지 않는다. |
| | 중간 | 꼭 필요한 서비스에만 돈을 낸다. |
| | 낮음 | 편하면 유료 서비스도 크게 망설이지 않고 결제한다. |
| `da_grade` | 높음 | 새 앱에 금방 익숙해지고 사용법을 따로 찾아보지 않는다. |
| | 중간 | 새 앱은 화면이 익숙하면 쓰고, 낯설면 조금 헤맨다. |
| | 낮음 | 낯선 화면이 나오면 어디를 눌러야 할지 자주 망설인다. |
| `ns_grade` | 높음만 | 새로운 서비스가 나오면 먼저 깔아보는 편이다. |
| `privacy_concern` | 5 | 가입할 때 개인정보를 많이 물으면 이유를 모르는 항목에서 바로 멈춘다. |
| | 4 | 가입 때 묻는 개인정보가 많으면 불편하다. |
| | 3 | 가입 때 개인정보 입력은 보통 넘긴다. |
| | 1~2 | 가입할 때 개인정보를 입력하는 것에 크게 신경 쓰지 않는다. |

카드 구성 순서: ① "{나이}세 {성별} {직업}이고 {province} 지역에 산다." ② 대학 학력이면 "전공 계열은 {bachelors_field}이다." ③ NVIDIA `persona` 첫 문장 ④ `hobbies_and_interests`에서 앱·미디어 키워드가 든 문장 최대 2개(없으면 첫 문장) ⑤ `cultural_background` 첫 문장 ⑥ 위 표의 문장들.

- 직업 표현: 학생 → "대학생"(전문대·4년제), "대학원생"(대학원), "학생"(그 외) / 무직·기타 → "현재 일을 하고 있지 않은 사람" / 그 외 → NVIDIA `occupation` 원문
- NVIDIA 서술 문장 중 금액·비율 숫자가 든 문장(예: "월 9,900원")은 쓰지 않는다.
- 건강·가족사 같은 무관한 서술은 넣지 않는다(위 3개 열만 쓴다).
- 같은 문장 표를 이후 Ask·Act 프롬프트가 공유한다. 문장을 바꾸면 버전을 올린다.

## 8. 품질 점검 (`run_checks`)

페르소나를 만든 직후, 에이전트를 돌리기 전에 점검한다.

| 점검 | 방법 | 기준 |
|---|---|---|
| 할당 일치 | 칸별 인원 = 6장 할당량(shortfall 반영) | 전 칸 일치 |
| 분포 일치 | `ps_grade`, `da_grade`, `privacy_concern`, `ott_payment` 분포 vs donor 부분집합의 가중 분포 (카이제곱) | p > 0.05. 기대 도수가 5 미만인 칸이 있으면 경고만 한다. 100명 표본이라 우연히 p<0.05가 나올 수 있다 |
| 매칭 수준 | `match_level` 비율 | 3 이상이 50% 이하 |
| donor 재사용 | 사용된 donor 수, 최대 재사용 횟수, `over_cap` 수 | 값을 기록 |
| 카드 중복 | `card_text` 중복 | 0장 |
| 카드 숫자 | `\d+원`, `%`, 소수 표기 정규식 | 0장 |

## 9. 참고 구현 (합성 데이터로 실행 확인 완료)

아래 파일을 그대로 저장해서 시작하고, 실제 데이터에서 맞지 않는 곳만 고친다. 구조를 바꿀 때는 보고한다.

### `src/config.py`

```python
from pathlib import Path

YEAR = "24"                                   # 미디어패널 조사연도 (변수명 p24xxxx)
ROOT = Path(__file__).resolve().parents[1]
RAW, INTERIM, OUT = ROOT / "data" / "raw", ROOT / "data" / "interim", ROOT / "outputs"
SAV = RAW / "p24v32_KMP.sav"
NVIDIA_ID = "nvidia/Nemotron-Personas-Korea"

# 가격 민감도 초안 가중치 (합 1.0). 바꾸면 버전을 기록한다.
WTP_WEIGHTS = {"ott": 0.35, "income": 0.25, "svod": 0.20, "app": 0.10, "ai": 0.10}
SCORING_VERSION = "v0-draft"

# 공통 범주
AGE_EDGES = [18, 21, 24, 29, 39, 49, 59, 69, 200]
AGE_LABELS = ["19-21", "22-24", "25-29", "30s", "40s", "50s", "60s", "70+"]
KEYS = ["sex", "age_bin", "job_group", "school", "region3", "marital"]
RELAX = [KEYS, KEYS[:5], KEYS[:4], KEYS[:3]]   # match_level 1~4
CELL_KEYS = ["sex", "age_bin", "job_group", "school"]
MIN_POOL = 5
```

### `src/utils.py`

```python
import numpy as np
import pandas as pd


def weighted_percentile(x, w) -> pd.Series:
    """가중 백분위(0~1). 동점은 중간순위. x가 NaN이거나 w<=0인 행은 분포 계산에서 제외하고,
    NaN이 아닌 x에는 보간으로 값을 준다."""
    x = pd.Series(x, dtype=float)
    w = pd.Series(w, index=x.index, dtype=float).clip(lower=0)
    out = pd.Series(np.nan, index=x.index)
    ok = x.notna() & (w > 0)
    if ok.sum() == 0:
        return out
    g = w[ok].groupby(x[ok]).sum().sort_index()
    pct = (g.cumsum() - g + 0.5 * g) / g.sum()
    has = x.notna()
    out[has] = np.interp(x[has], g.index.to_numpy(), pct.to_numpy())
    return out


def weighted_median(x, w) -> float:
    d = pd.DataFrame({"x": x, "w": w}).dropna()
    d = d[d.w > 0].sort_values("x")
    if d.empty:
        return np.nan
    return d.x[d.w.cumsum() >= d.w.sum() / 2].iloc[0]


def grade3(p: pd.Series) -> pd.Series:
    """0~1 백분위 -> 낮음/중간/높음 (삼분위)."""
    return pd.cut(p, [-1e-9, 1 / 3, 2 / 3, 1 + 1e-9],
                  labels=["낮음", "중간", "높음"]).astype(object)


def allocate(weights: pd.Series, n: int) -> pd.Series:
    """최대 나머지 방식으로 n명을 칸별로 배분."""
    raw = weights / weights.sum() * n
    q = np.floor(raw).astype(int)
    rest = int(n - q.sum())
    if rest > 0:
        order = (raw - q).sort_values(ascending=False, kind="stable").index[:rest]
        q.loc[order] += 1
    return q
```

### `src/donor.py`

```python
import numpy as np
import pandas as pd

from . import config as C
from .utils import grade3, weighted_median, weighted_percentile

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
    d["school"] = np.select(
        [s1.isin([0, 1, 2, 3, 6]), (s1 == 4) & (s13 == 1), (s1 == 4) & (s13 == 2), s1 == 5],
        ["고졸이하", "전문대", "4년제", "대학원"], default="미상")
    d["school"] = d["school"].replace("미상", np.nan)

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

    d["ps_grade"] = grade3(d["price_sensitivity"])
    d["da_grade"] = grade3(d["digital_adoption"])
    d["ns_grade"] = grade3(d["novelty_seeking"])
    d["ott_payment"] = d["d26061"].map({3: "단독", 2: "친구와 나눔", 1: "가족"}).fillna("미이용")
    return d
```

### `src/nvidia.py`

```python
import numpy as np
import pandas as pd

from . import config as C

STRUCT_COLS = ["uuid", "sex", "age", "marital_status", "education_level",
               "bachelors_field", "occupation", "province"]
TEXT_COLS = ["persona", "hobbies_and_interests", "cultural_background"]

# 직업군 키워드 사전: 위에서부터 먼저 맞는 그룹으로 분류. 시드 목록이며 Step 2에서 실제 값을 보고 확장한다.
JOB_KEYWORDS = [
    ("무직·기타", ["무직", "구직", "주부", "군인", "은퇴", "퇴직", "연금"]),
    ("학생", ["학생", "대학원생"]),
    ("농림어업", ["농업", "농부", "축산", "어업", "어부", "임업", "재배", "양식", "원예"]),
    ("전문·기술", ["의사", "간호", "약사", "변호", "회계사", "세무사", "교사", "교수", "강사", "연구",
                "개발", "엔지니어", "프로그래머", "디자이너", "작가", "기자", "설계", "컨설턴트",
                "상담사", "치료사", "사회복지", "통역", "번역", "음악가", "배우", "건축사", "분석가"]),
    ("사무·관리", ["사무", "회계", "경리", "총무", "인사", "기획", "관리자", "경영", "행정", "비서",
                "공무원", "은행", "금융", "보험", "마케팅", "홍보", "감사"]),
    ("판매·서비스", ["판매", "영업", "점원", "매장", "계산원", "조리", "요리", "주방", "바리스타", "미용",
                  "네일", "안내", "접객", "승무원", "경비", "보안", "콜센터", "중개", "호텔", "트레이너"]),
    ("생산·기능", ["기계", "조립", "용접", "정비", "수리", "운전", "택배", "배달", "제조", "생산", "건설",
                "현장", "목수", "전기", "설치", "도장", "배관", "노무", "청소", "인쇄", "봉제", "가공",
                "운반", "포장", "검사원"]),
]


def load_nvidia_struct(cache=C.INTERIM / "nvidia_struct.parquet") -> pd.DataFrame:
    if cache.exists():
        return pd.read_parquet(cache)
    from datasets import load_dataset
    ds = load_dataset(C.NVIDIA_ID, split="train")
    df = ds.select_columns(STRUCT_COLS).to_pandas()
    df["_row"] = np.arange(len(df))                          # 원본 행 번호(서술형 열 조회용)
    cache.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(cache)
    return df


def fetch_text(panel: pd.DataFrame) -> pd.DataFrame:
    """뽑힌 페르소나의 서술형 열만 원본에서 가져온다."""
    from datasets import load_dataset
    ds = load_dataset(C.NVIDIA_ID, split="train")
    t = ds.select(panel["_row"].tolist()).select_columns(TEXT_COLS).to_pandas()
    t.index = panel.index
    return panel.join(t)


def school_group(s: str) -> str:
    if "전문대" in s:
        return "전문대"
    if "4년제" in s:
        return "4년제"
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
    inferred = (d["age"].between(19, 29) & d["school"].isin(["전문대", "4년제"])
                & d["occupation"].str.strip().eq("무직"))    # 초안: 대학 학력 + 무직 -> 학생(추정)
    d["job_group"] = base.where(~inferred, "학생")
    d["student_inferred"] = inferred
    d["job_group"] = d["job_group"].replace("미분류", np.nan)
    return d
```

### `src/engine.py`

```python
import math

import numpy as np
import pandas as pd

from . import config as C
from .donor import compute_scores
from .utils import allocate

SCORE_OUT = ["price_sensitivity", "ps_grade", "digital_adoption", "da_grade",
             "novelty_seeking", "ns_grade", "privacy_concern", "ott_payment"]
HABIT_OUT = ["d01001", "d01002", "d01003", "i02004", "d26092"]


def _filter(df: pd.DataFrame, t: dict) -> pd.DataFrame:
    lo, hi = t.get("age", (19, 120))
    m = df["age"].between(lo, hi)
    if t.get("sex"):
        m &= df["sex"] == t["sex"]
    for key, col in (("job", "job_group"), ("school", "school"),
                     ("region", "region3"), ("marital", "marital")):
        if t.get(key):
            m &= df[col].isin(t[key])
    return df[m]


def build_panel(target: dict, n: int = 100, seed: int = 42, *, donor: pd.DataFrame, nv: pd.DataFrame):
    """target 예: {"age": (19, 29), "job": ["학생"], "school": ["전문대", "4년제"],
                   "price_sensitivity": ["중간", "높음"]}   (키는 모두 선택)
    donor = derive_donor() 결과, nv = derive_nvidia() 결과. (panel DataFrame, report dict) 반환."""
    rng = np.random.default_rng(seed)
    rep = {"target": {k: (list(v) if isinstance(v, (list, tuple)) else v) for k, v in target.items()},
           "n": n, "seed": seed, "scoring_version": C.SCORING_VERSION}

    # 1. donor 부분집합 + 그 안에서 점수 계산
    dsub = _filter(donor, target)
    rep["donor_n_before_dropna"] = len(dsub)
    dsub = dsub.dropna(subset=C.KEYS + ["wt"])
    rep["donor_n"] = len(dsub)
    if len(dsub) == 0:
        raise ValueError("조건에 맞는 donor가 없습니다. 타깃을 넓히세요.")
    dsub = compute_scores(dsub)
    if target.get("price_sensitivity"):
        dsub = dsub[dsub["ps_grade"].isin(target["price_sensitivity"])]
        rep["donor_n_after_score_filter"] = len(dsub)
        if len(dsub) == 0:
            raise ValueError("점수 조건까지 맞는 donor가 없습니다.")

    # 2. 칸별 할당량 (donor 가중 비율)
    cell = dsub.groupby(C.CELL_KEYS)["wt"].sum()
    quota = allocate(cell[cell > 0], n)
    quota = quota[quota > 0]
    rep["quota"] = {"/".join(map(str, k)): int(v) for k, v in quota.items()}

    # 3. NVIDIA에서 칸별 추출
    pool = _filter(nv, target).dropna(subset=C.KEYS)
    groups = pool.groupby(C.CELL_KEYS).groups
    parts, short = [], {}
    for key, q in quota.items():
        idx = groups.get(key, [])
        k = min(int(q), len(idx))
        if k < q:
            short["/".join(map(str, key))] = int(q - k)
        if k:
            parts.append(pool.loc[idx].sample(k, random_state=int(rng.integers(1e9))))
    if not parts:
        raise ValueError("NVIDIA 후보가 없습니다.")
    panel = pd.concat(parts).sample(frac=1, random_state=int(rng.integers(1e9))).reset_index(drop=True)
    rep["nvidia_pool_n"] = len(pool)
    rep["shortfall"] = short

    # 4. 핫덱 매칭: donor 한 명의 값을 통째로 복사
    cap = max(2, math.ceil(len(panel) / len(dsub)))
    used = pd.Series(0, index=dsub.index)
    picks = []
    for _, p in panel.iterrows():
        for lvl, ks in enumerate(C.RELAX, start=1):
            mask = np.ones(len(dsub), dtype=bool)
            for k in ks:
                mask &= (dsub[k].to_numpy() == p[k])
            cand_all = dsub[mask]
            if len(cand_all) >= C.MIN_POOL or lvl == len(C.RELAX):
                break
        if cand_all.empty:
            raise RuntimeError(f"매칭 후보 0명: {p[C.CELL_KEYS].to_dict()}")
        cand = cand_all[used[cand_all.index] < cap]
        over = cand.empty
        if over:
            cand = cand_all
        w = cand["wt"].clip(lower=0).to_numpy()
        pr = w / w.sum() if w.sum() > 0 else None
        pick = cand.iloc[int(rng.choice(len(cand), p=pr))]
        used[pick.name] += 1
        picks.append((pick.name, lvl, over, len(cand_all)))

    pidx = [x[0] for x in picks]
    donor_part = dsub.loc[pidx, [c for c in ["pid"] + SCORE_OUT + HABIT_OUT if c in dsub.columns]]
    donor_part = donor_part.rename(columns={"pid": "donor_pid"}).reset_index(drop=True)
    panel = pd.concat([panel, donor_part], axis=1)
    panel["match_level"] = [x[1] for x in picks]
    panel["over_cap"] = [x[2] for x in picks]
    panel["pool_size"] = [x[3] for x in picks]
    panel.insert(0, "persona_id", [f"P{i + 1:03d}" for i in range(len(panel))])

    vc = used[used > 0]
    def wshare(col):
        t = dsub.groupby(col)["wt"].sum()
        return {str(k): float(v) for k, v in (t / t.sum()).items()}
    rep["expected"] = {c: wshare(c) for c in ["ps_grade", "da_grade", "privacy_concern", "ott_payment"]}
    rep["match_level_counts"] = panel["match_level"].value_counts().sort_index().to_dict()
    rep["donor_cap"] = cap
    rep["donors_used"] = int((used > 0).sum())
    rep["donor_max_reuse"] = int(vc.max())
    rep["over_cap_n"] = int(panel["over_cap"].sum())
    return panel, rep
```

### `src/cards.py`

```python
import re

import pandas as pd

APP_KW = ["앱", "어플", "애플리케이션", "스마트폰", "유튜브", "넷플릭스", "웹툰", "게임", "SNS", "인스타",
          "온라인", "배달", "쇼핑", "구독", "스트리밍", "커뮤니티", "영상", "OTT", "결제", "검색",
          "메신저", "카카오", "네이버", "틱톡"]
MONEY = re.compile(r"\d[\d,.]*\s*(원|만원|천원|%|퍼센트)")      # 금액·비율 숫자가 든 문장은 쓰지 않는다

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
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip() and not MONEY.search(s)]


def job_phrase(p) -> str:
    if p["job_group"] == "학생":
        return "대학원생" if p["school"] == "대학원" else "대학생" if p["school"] in ("전문대", "4년제") else "학생"
    if p["job_group"] == "무직·기타":
        return "현재 일을 하고 있지 않은 사람"
    return str(p["occupation"])


def build_card(p: pd.Series) -> str:
    L = [f"{int(p['age'])}세 {'남자' if p['sex'] == '남' else '여자'} {job_phrase(p)}이고 {p['province']} 지역에 산다."]
    bf = p.get("bachelors_field")
    if p["school"] in ("전문대", "4년제", "대학원") and isinstance(bf, str) and bf.strip():
        L.append(f"전공 계열은 {bf.strip()}이다.")
    L += sentences(p.get("persona"))[:1]
    hs = sentences(p.get("hobbies_and_interests"))
    hit = [s for s in hs if any(k in s for k in APP_KW)]
    L += (hit or hs[:1])[:2]
    L += sentences(p.get("cultural_background"))[:1]
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
```

### `src/checks.py`

```python
import re

import pandas as pd
from scipy.stats import chisquare

from . import config as C

BAD = re.compile(r"\d[\d,.]*\s*(원|만원|천원|%)")


def _chi(panel, col, expected):
    cats = sorted(expected)
    obs = panel[col].astype(str).value_counts()
    f_obs = [int(obs.get(c, 0)) for c in cats]
    tot = sum(f_obs)
    f_exp = [expected[c] * tot / sum(expected.values()) for c in cats]
    stat, p = chisquare(f_obs, f_exp)
    return {"p": round(float(p), 4), "ok": bool(p > 0.05),
            "obs": dict(zip(cats, f_obs)), "min_expected": round(min(f_exp), 1)}


def run_checks(panel: pd.DataFrame, rep: dict) -> dict:
    out = {}
    got = panel.groupby(C.CELL_KEYS).size()
    got = {"/".join(map(str, k)): int(v) for k, v in got.items()}
    want = {k: v - rep["shortfall"].get(k, 0) for k, v in rep["quota"].items()}
    out["quota_match"] = {"ok": got == {k: v for k, v in want.items() if v > 0},
                          "n": len(panel), "requested": rep["n"], "shortfall": rep["shortfall"]}
    out["dist"] = {c: _chi(panel, c, rep["expected"][c]) for c in rep["expected"]}
    lv = panel["match_level"]
    out["match_level"] = {"counts": rep["match_level_counts"],
                          "share_ge3": round(float((lv >= 3).mean()), 3),
                          "ok": bool((lv >= 3).mean() <= 0.5)}
    out["donor_reuse"] = {"donors_used": rep["donors_used"], "max_reuse": rep["donor_max_reuse"],
                          "cap": rep["donor_cap"], "over_cap_n": rep["over_cap_n"]}
    out["duplicate_cards"] = {"n": int(panel["card_text"].duplicated().sum()),
                              "ok": not panel["card_text"].duplicated().any()}
    out["card_numbers"] = {"n_bad": int(panel["card_text"].map(lambda t: bool(BAD.search(t))).sum()),
                           "ok": not panel["card_text"].map(lambda t: bool(BAD.search(t))).any()}
    return out
```

### `scripts/make_panel.py`

```python
"""사용: python scripts/make_panel.py --preset univ --n 100 --seed 42"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import config as C                                   # noqa: E402
from src.cards import add_cards                               # noqa: E402
from src.checks import run_checks                             # noqa: E402
from src.donor import derive_donor, load_donor                # noqa: E402
from src.engine import build_panel                            # noqa: E402
from src.nvidia import derive_nvidia, fetch_text, load_nvidia_struct   # noqa: E402

PRESETS = {
    "univ": {"age": (19, 29), "job": ["학생"], "school": ["전문대", "4년제"]},   # 검증 프리셋 (donor 375명)
    "30s_office": {"age": (30, 39), "job": ["사무·관리"]},
    "40s_all": {"age": (40, 49)},
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", choices=PRESETS, default="univ")
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()

    donor = derive_donor(load_donor())
    nv = derive_nvidia(load_nvidia_struct())
    panel, rep = build_panel(PRESETS[a.preset], a.n, a.seed, donor=donor, nv=nv)
    panel = add_cards(fetch_text(panel))
    ck = run_checks(panel, rep)

    C.OUT.mkdir(parents=True, exist_ok=True)
    name = f"panel_{a.preset}_n{a.n}_seed{a.seed}"
    panel.to_parquet(C.OUT / f"{name}.parquet")
    panel.to_csv(C.OUT / f"{name}.csv", index=False, encoding="utf-8-sig")
    (C.OUT / f"{name}_report.json").write_text(
        json.dumps({"report": rep, "checks": ck}, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8")
    print(name, "| n", len(panel), "| match_level", rep["match_level_counts"],
          "| donors_used", rep["donors_used"], "| quota_ok", ck["quota_match"]["ok"])


if __name__ == "__main__":
    main()
```

### `requirements.txt`

```text
pandas>=2.0
numpy
scipy
pyarrow
pyreadstat
openpyxl
datasets
```

`src/__init__.py`는 빈 파일이다.

## 10. 작업 순서

각 Step의 끝에 "보고할 것"을 출력하고 멈춘다.

### Step 0. 환경과 열 확인

1. 2장 폴더를 만들고 9장 코드를 저장한다. `pip install -r requirements.txt`. `.gitignore`에 `data/`, `outputs/` 추가.
2. `p24v32_KMP.sav`를 3-1 방식으로 읽는다.
3. 아래를 출력한다.
   - 행 수(기대 8,693)와 열 수
   - 3-2 표의 변수 중 **존재하지 않는 열 목록**
   - 이름에 `wt`가 들어간 열 전체, `p24wt`의 결측 수·0 개수·기술통계, `p24pid`의 유일값 수
   - `p24area` 값 분포(1~17이어야 하고 서울·경기가 큰 쪽이어야 한다)
   - `p24d26057 > 0`인 값의 기술통계와 상위 10개 값(단위 추정용)
   - `p24d01002`, `p24d01003` 존재 여부
   - `codebook_lookup`으로 `p__income`, `p__job3`, `p__school1` 라벨이 3-2 표와 같은지
4. **통과 기준**: 8,693행, 필수 열(`pid`, `wt`, `gender`, `age1`, `school1`, `school2`, `school13`, `job1`, `job3`, `mar`, `area`, `income`, `d26061`, `d26057`, `c06006`, `d31007`, `d23003`, `m01001`~`m01024`)이 모두 있을 것. 없으면 대체 후보를 제시하고 멈춘다.

**보고할 것**: 위 출력 요약, 문서와 다른 점.

### Step 1. donor 전처리와 점수

1. `derive_donor`로 공통 범주를 만든다. 직업군·학력·권역·혼인 분포(가중/비가중)와 NaN으로 빠진 행 수를 출력한다.
2. 20대 대학생 프리셋(3-5)으로 부분집합을 만들어 **3-5의 기대값과 비교**한다(donor 375명, 성별×연령 표, `school13`, 권역, `income`, `d26061`, `d23003`, 결측률).
3. `compute_scores`를 프리셋 부분집합과 전체(19세 이상)에 각각 돌려 점수 3개의 기술통계, 등급 분포(각 1/3 근처여야 한다), `privacy_concern` 분포, `ott_payment` 분포를 출력한다.

**통과 기준**: 프리셋 donor가 키 열 NaN 제거 전 375명, 3-5 기대값과 일치.
**보고할 것**: 일치 여부 표, 점수 분포, 이상한 점.

### Step 2. NVIDIA 로딩과 변환

1. `load_nvidia_struct()`로 받아 `data/interim/nvidia_struct.parquet`에 저장한다. `ds.column_names`가 4-1과 같은지, `ds.num_rows`, `ds.features`(문자열 열이 정수 라벨로 바뀌어 있지 않은지)를 확인한다.
2. `sex`, `education_level`, `marital_status`, `province`의 `value_counts()`를 출력한다. `derive_nvidia`가 매핑 오류를 내면 사전에 추가한다(어떤 값을 추가했는지 보고).
3. `occupation`의 고유값 수, 만 19~29세 상위 100개, 30~59세 상위 100개를 출력한다.
4. `JOB_KEYWORDS`로 분류하고 **분류율(19~70세)과 미분류 상위 50개 값**을 출력한다. 분류율이 90% 미만이면 키워드를 확장해서 다시 돌린다. 학생(키워드)과 학생 추정(`student_inferred`) 인원도 출력한다.

**통과 기준**: 매핑 오류 없음, 분류율 90% 이상.
**보고할 것**: 열 확인 결과, 값 분포, 직업군 사전(추가한 키워드 포함), 미분류 상위 값. **직업군 사전은 사용자가 검토한 뒤 확정한다.**

### Step 3. build_panel 실행

`scripts/make_panel.py`로 3개 프리셋(`univ`, `30s_office`, `40s_all`)을 N=100, seed=42로 돌린다. 각각 출력한다.

- 오류 없이 100명인지, `shortfall`
- `match_level` 분포, `donors_used`, `donor_max_reuse`, `over_cap_n`
- `univ`: 여성 25~29세 칸의 할당량과 donor 수(8명)

**통과 기준**: 세 프리셋 모두 실행 성공. **보고할 것**: 위 수치와 이상한 점.

### Step 4. 카드

`univ` 10장, `30s_office` 3장의 `card_text`를 출력한다. 점검: 숫자 누출, 어색한 문장(예: province 약칭이 어색하면 표시용 사전 추가 제안), 직업 표현, 서술 문장이 앱·미디어 맥락인지, 같은 프로필 카드 중복.

**보고할 것**: 카드 샘플과 문제점. 문장 수정은 제안만 한다.

### Step 5. 품질 점검과 산출물

세 프리셋의 `run_checks` 결과를 표로 정리하고, `outputs/`에 `.parquet`, `.csv`, `_report.json`이 생성됐는지 확인한다. 11장을 `outputs/README.md`로 저장한다.

**보고할 것**: 점검 결과 표, 경고, 다음에 할 일 제안(이 문서의 범위 밖 작업은 제안만).

## 11. 알려진 한계 (`outputs/README.md`에 그대로 적는다)

| 한계 | 원인 | 영향 |
|---|---|---|
| 자취·1인가구 대학생의 행태가 거의 없다 | 미디어패널은 가구 방문 패널이라 20대 대학생 375명 중 359명이 가구주의 자녀 | 자취생의 높은 가격 민감도가 과소 반영될 수 있다(검증 불가) |
| donor 시점과 현재의 차이 | donor는 2024년 조사 | OTT·생성형 AI 유료 이용률이 현재보다 낮게 잡힐 수 있다 |
| NVIDIA 직업군·학생 식별이 규칙 기반 | `occupation`이 자유 문자열이고 재학 여부 열이 없다. 학생 추정은 대학 졸업 후 구직 중인 사람을 포함할 수 있다 | 직업 서술 문장과 직업군이 어긋나는 페르소나가 생길 수 있다 |
| 작은 칸에서 donor가 재사용된다 | 예: 여성 25~29세 대학생 donor 8명 | 같은 경제 변수를 가진 페르소나가 생긴다. `over_cap`, `max_reuse`로 감시 |
| 소득의 변별력이 약하다 | 대학생 donor의 80%가 소득 없음 | 가격 민감도가 OTT 지불 형태에 크게 의존한다. 다른 연령대 프리셋에서는 균형이 달라진다 |
| 점수는 타깃 부분집합 안의 상대값이다 | 부분집합 안의 가중 백분위 | 같은 사람도 타깃이 다르면 점수가 다르다. 서로 다른 스터디의 점수를 직접 비교하지 않는다 |
| 결측이 큰 변수를 "미이용"으로 처리한다 | `d31007` 결측 62%, `d26057`·`d26061` 약 27% | 응답 거부와 미이용이 구분되지 않는다 |
| 점수 가중치가 초안이다 | 팀 합의 전 | `SCORING_VERSION`으로 버전 관리 |

## 12. 이 문서 밖 (하지 않는다)

LLM 호출과 프롬프트 최적화, Ask·Act 에이전트, 피그마 API, DB·API·화면, 실제 참가자 조사와 오차 계산, 모델 학습·파인튜닝. 필요해 보이면 제안만 한다.
