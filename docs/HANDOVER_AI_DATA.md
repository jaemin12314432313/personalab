# AI/Data 인수인계: Persona Engine · UX 흐름 평가 에이전트

백엔드·프론트가 이어받아 연결할 수 있도록 정리한 문서입니다. 작성 2026-10-27.

**한 줄 요약**: AI 페르소나를 만드는 엔진(Persona Engine)과, 그 페르소나가 서비스 화면 흐름을 평가하는 에이전트(UX 흐름 평가)가 동작합니다. 둘 다 지금은 `data/` 아래의 독립 도구이고, 백엔드 API에는 아직 연결되지 않았습니다.

- 결과 화면 미리보기: [UX 평가 뷰어](https://claude.ai/artifact/Jk2QXRRP2AXt34XdR1radm) (공유받은 사람만 열림) 또는 `data/ux_eval/outputs/viewer.html`
- 상세 사용법: [`data/persona_engine/README.md`](../data/persona_engine/README.md), [`data/ux_eval/README.md`](../data/ux_eval/README.md)

---

## 1. 지금 무엇이 되나

| 기능 | 상태 | 위치 | 비용 |
|---|---|---|---|
| 조건으로 페르소나 N명 만들기 (카드 문장 포함) | ✅ 동작, `main`에 머지됨 (PR #6) | `data/persona_engine/` | 0원 (LLM 안 씀) |
| 백엔드용 페르소나 함수 `generate()` | ✅ 동작, 이번 PR | `data/persona_engine/src/api.py` | 0원 |
| 화면 흐름을 7개 사용성 기준으로 평가 + 완주 판단 | ✅ 동작, 이번 PR | `data/ux_eval/` | 1명당 약 $0.025 (gpt-4o) |
| 정적 HTML·실제 웹사이트 -> 화면 흐름 변환 | ✅ 동작, 이번 PR | `data/ux_eval/scripts/` | 0원 |
| 결과 뷰어 (고객 구분별 보기 포함) | ✅ 동작 (HTML 한 장) | `data/ux_eval/scripts/make_viewer.py` | 0원 |
| 백엔드 API 연결 (`panel/generate`, UX 평가 실행) | ❌ 안 됨 → 3장 | `backend/` | |
| 프론트 화면 | ❌ 안 됨 → 4장 (뷰어를 참고 디자인으로) | `frontend/` | |

**검증 결과 (gpt-4o)**
- 샘플 앱 회원가입(5화면) × 페르소나 50명: 완주 58%. 이탈은 정보 입력 화면(입력칸 11개)에 집중됨
- 실제 사이트 AICOSS 회원가입(4화면) × 20명: 완주 56%. 이탈은 회원정보 입력 화면(입력칸 17개)에 집중됨
- 같은 화면 사실에 대한 판단(라벨) 일치도가 기준 7개 중 5개에서 85% 이상

---

## 2. 바로 써보기 (터미널)

준비: 각 폴더 README의 "처음 한 번만 준비"를 따릅니다. 원본 데이터 zip 2개를 `data/raw/`에 풀어야 하고(팀 공유 폴더), UX 평가를 실제로 돌리려면 저장소 루트 `.env`에 `LLM_API_KEY`가 필요합니다.

```
# 1) 페르소나 만들기 (data/persona_engine)
python scripts/make_panel.py --preset univ                               # 20대 대학생 100명
python scripts/make_panel.py --age 20-39 --sex 여 --job 사무관리 --n 50   # 조건 직접

# 2) 화면 흐름 준비 (data/ux_eval) — 셋 중 하나
python scripts/html_to_flow.py samples/signup_html --name signup --task "회원가입을 완료한다" --goal S05 --start S01
python scripts/url_to_flow.py samples/aicoss_signup_pages.json           # 실제 사이트
#   또는 samples/signup_flow.json 형식으로 직접 작성

# 3) 평가 (data/ux_eval)
python scripts/evaluate.py --flow samples/signup_flow.json --dry-run      # AI에게 보낼 글만 확인 (무료)
python scripts/evaluate.py --flow samples/signup_flow.json --mock         # 가짜 응답으로 전체 점검 (무료)
python scripts/evaluate.py --flow samples/signup_flow.json --n 20         # 실제 평가 (약 $0.5)

# 4) 결과 화면
python scripts/make_viewer.py                                            # outputs/viewer.html
```

---

## 3. 백엔드 연결 안내

### 3-1. 페르소나 생성 (`POST /studies/{id}/panel/generate`) — 바로 연결 가능

`backend/app/services/persona/sample.py`의 임시 구현을 아래로 바꾸면 됩니다. 입력·출력 모양은 임시 구현의 설명과 같게 맞췄습니다.

```python
import sys
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[4] / "data" / "persona_engine"
sys.path.insert(0, str(ENGINE))
from src.api import generate  # noqa: E402


def sample_personas(conditions: dict, n: int, seed: int) -> list[dict]:
    return generate(conditions, n, seed)        # 잘못된 조건은 ValueError(한국어 메시지) -> 400으로
```

| 항목 | 내용 |
|---|---|
| `conditions` | `{"preset": "univ"}` 또는 `{"age": "20-29", "sex": "여", "job": ["학생"], "school": ["대졸"], "region": ["수도권"], "marital": ["미혼"], "price": ["중간", "높음"]}`. 값 목록은 4-1 표 |
| 속도 | 서버가 켜진 뒤 첫 호출 약 20초(데이터 로딩), 이후 약 2초. 서버 시작 때 한 번 미리 호출해 두면 좋습니다 |
| 같은 seed | 같은 조건 + 같은 seed = 항상 같은 사람들 |
| 필요한 것 | 서버에 `data/raw/`(미디어패널 원본)와 NVIDIA 데이터 캐시(첫 실행 때 자동 다운로드 약 2GB). 패키지는 `data/persona_engine/requirements.txt` |

돌려주는 한 명(`personas.attributes_json`에 그대로 저장):

```json
{
  "profile":  {"age": 24, "sex": "여", "region": "부산", "region3": "광역시", "job_group": "학생", "school": "대졸", "occupation": "무직"},
  "card_text": "24세 여자 대학생이고 부산 지역에 산다.\n...\n가입할 때 개인정보를 많이 물으면 이유를 모르는 항목에서 바로 멈춘다.",
  "traits":   {"price": "높음", "digital": "높음", "novelty": "높음", "privacy": 5, "ott": "가족"},
  "source":   {"persona_id": "P001", "nvidia_uuid": "b4f5...", "donor_pid": 106340002, "match_level": 1, "student_inferred": true, "scoring_version": "v0.1-draft", "seed": 42}
}
```

- **프롬프트에는 `card_text`만 넣습니다.** `traits`의 등급·점수는 리포트 분석용이고 프롬프트에 넣지 않습니다(숫자가 응답을 끌어당김).
- 점검 리포트(할당·분포·경고)가 필요하면 `generate_with_report()`를 씁니다.

### 3-2. UX 흐름 평가 — 연결 전에 팀 결정이 필요

평가 한 번 = 페르소나 1명당 LLM 1회 호출. 입력은 "화면 흐름" 하나, 출력은 페르소나별 평가 JSON입니다.

**입력: 화면 흐름 JSON** (`data/ux_eval/src/flow.py` 맨 위 설명)

```json
{"name": "signup", "task": "회원가입을 완료한다", "goal": "S05",
 "screens": [
   {"id": "S02", "label": "회원가입",
    "texts": ["학교 인증이 필요해요"],
    "fields": [{"label": "이름", "type": "text", "required": true, "hint": "실명"}],
    "elements": [{"text": "다음", "to": "S03"}, {"text": "뒤로", "to": "S01"}]}]}
```

첫 화면이 시작 화면입니다. 백엔드의 `prototype/manual` 입력(`id, label, description, elements`)과 거의 같고, `description` 대신 `texts`(화면 문구)와 `fields`(입력칸)를 구조로 받는 점만 다릅니다.

**출력: 페르소나 1명의 평가**

```json
{"criteria": {
   "simplicity":  {"label": "나쁨", "evidence": "S03에 입력 필드 11개", "importance": "높음", "importance_reason": "..."},
   "feedback": {...}, "control": {...}, "clarity": {...}, "consistency": {...}, "error": {...}, "flexibility": {...}},
 "complete": "아니오", "complete_reason": "입력할 게 너무 많아서 그만둘래요.",
 "drop_screen": "S03", "drop_reason": "TOO_MANY_STEPS",
 "opinions": {
   "screen_comments": [{"screen": "S03", "comment": "학번이랑 주소는 왜 필요한지 모르겠어요."}],
   "liked": "첫 화면에서 무슨 앱인지 바로 알겠어요.",
   "disliked": "필수인지 아닌지 몰라서 다 채워야 할 것 같았어요.",
   "suggestion": "학교 이메일 인증만 하고 나머지는 나중에 받으면 좋겠어요."}}
```

- `label`: 좋음 / 보통 / 나쁨 / 판단불가. `importance`: 높음 / 중간 / 낮음
- `drop_reason`은 **팀 공용 이탈 카테고리 8개**(`core/config.py` `DROP_REASONS`) 중 하나 → Act 모드·실제 참가자와 같은 축으로 비교 가능
- `opinions`(프롬프트 v0.6): 화면별 한마디 1~3개(화면 id 포함), 좋았던 점, 불편했던 점, 개선 제안. 화면에 있는 사실에 근거하도록 지시·검증
- 응답 검증(형식, 근거에 화면 id, 8개 카테고리 등)과 재시도는 `data/ux_eval/src/prompt.py`의 `check_eval`

**연결할 때 정해야 할 것** (CLAUDE.md: DB 스키마는 계획서 9장 기준, 바꾸려면 팀 논의 먼저)

| 결정 | 선택지 |
|---|---|
| 이 평가를 무엇으로 볼지 | (가) 새 실행 모드 `ux` 추가 — `runs.mode`의 CHECK에 값 추가(마이그레이션) / (나) 계획서 Act 모드와 별개인 실험 도구로 두기 |
| 결과 저장 위치 | (가) 새 테이블 `ux_evaluations(run_id, persona_id, result_json)` / (나) `ask_responses.response_json`처럼 페르소나별 JSON 한 칸 재사용 |
| 화면 입력 형식 | `prototypes.screens_json` 안에 `texts`, `fields`를 함께 저장 (JSON 칸 안의 키라 컬럼 변경은 아님, Pydantic `Screen`에 선택 필드 추가 필요) |
| LLM | 백엔드 `services/llm.py`는 **Gemini 전용**. 테스트는 OpenAI(gpt-4o)로 했고 `data/ux_eval/src/llm_openai.py`가 같은 규칙의 OpenAI 버전. 키가 `sk-`로 시작하면 자동으로 OpenAI를 씀 |

모드를 정하면 연결 자체는 간단합니다. 백엔드 쪽에서는 `evaluate.py`의 반복문 하나(페르소나마다 `call_llm(SYSTEM, build_contents(card_text, render_flow(flow)), SCHEMA, check)`)를 `services/` 안으로 옮기면 됩니다.

---

## 4. 프론트 안내

### 4-1. 패널 생성 화면 — 조건 선택지

| 조건 | 키 | 값 | 화면 예 |
|---|---|---|---|
| 연령 | `age` | `"20-29"`, `"60-"`(이상) | 범위 슬라이더 |
| 성별 | `sex` | 남, 여 | 라디오 (선택 안 함 = 전체) |
| 직업군 | `job` | 사무·관리, 전문·기술, 판매·서비스, 생산·기능, 농림어업, 학생, 무직·기타 | 다중 선택 |
| 학력 | `school` | 고졸이하, 대졸, 대학원 | 다중 선택 |
| 권역 | `region` | 수도권, 광역시, 기타 | 다중 선택 |
| 혼인 | `marital` | 미혼, 기혼 | 다중 선택 |
| 가격 민감도 | `price` | 낮음, 중간, 높음 | 다중 선택 |
| 프리셋 | `preset` | univ, 30s_office, 40s_all, 60plus | 빠른 선택 버튼 |

### 4-2. UX 평가 결과 화면 — 뷰어를 참고 디자인으로

`data/ux_eval/scripts/viewer_template.html`이 그대로 참고용 화면입니다(바닐라 JS, 데이터만 바꿔 끼우는 구조). 들어간 구성과 계산법:

| 영역 | 보여주는 것 | 계산 |
|---|---|---|
| 요약 | 완주율, 가장 많이 그만둔 화면, 평균 라벨 일치도, 비용 | 완주율 = `complete=="예"` 수 / 성공 응답 수 |
| 고객 구분별 보기 | 디지털 수용도·가격 민감도·개인정보 우려·성별·연령대로 그룹을 나눠 그룹마다 완주율, 이탈 화면·이유, 중요하게 본 기준 TOP 3, 실제 의견 인용 | 그룹 = `traits`/`profile` 값. 중요 기준 = `importance=="높음"` 비율 |
| 화면 흐름 | 화면을 휴대폰 모양으로 나열, 그만둔 화면 강조, 입력칸·뒤로가기 유무 | 화면 정보는 흐름 JSON, 그만둔 수는 `drop_screen` 집계 |
| 기준별 평가 | 7개 기준의 라벨 분포 막대, 대표 라벨과 일치도, 근거 예 | 일치도 = 가장 많은 라벨 수 / 성공 응답 수 |
| 화면별 한마디 | 화면마다 페르소나 의견 모음 (고른 그룹만 볼 수 있음) | `opinions.screen_comments`를 화면 id로 묶음 |
| 페르소나별 응답 | 완주 여부·이유, 좋았던 점·불편했던 점·개선 제안, 기준별 라벨, 근거 펼치기 | |

**지켜야 할 것** (CLAUDE.md)
- AI 응답에는 **Synthetic User Response** 표시. 실제 참가자 결과와 섞지 않기
- 체류 시간·망설임·감정 강도처럼 **셀 수 없는 것은 표시하지 않기**
- 화면은 글로만 평가하므로 색·배치·글자 크기 판단은 없음(라벨 '판단불가')

---

## 5. 알고 써야 할 한계

| 한계 | 영향 |
|---|---|
| 화면을 글(구조 요약)로만 봄 | 시각 디자인(색·배치)은 평가하지 않음. 이미지 입력은 비용이 몇 배 |
| 정적 HTML만 변환 | React 등으로 화면을 그리는 사이트, APK는 안 됨 → Figma 화면을 JSON으로 옮기거나 수동 입력 |
| 양식 제출 화면은 열지 않음 | 예: AICOSS 가입 완료 화면은 실제 가입이 일어나서 "내용 확인 안 함"으로 둠 |
| NVIDIA에 실제 대학생이 거의 없음 | 학생은 '서술에 구직 표현이 없는 20대 대졸 무직'으로 추정 (Persona Engine README 8장) |
| LLM이 지시를 다 지키진 않음 | 검증에 걸리면 이유를 알려주고 다시 묻는다(최대 3회). 50명에 실패 2명 수준 |
| 크레딧 | 테스트 계정 잔액 약 $0.32. 계속하려면 예산(예산 신청 문서 참고) 또는 gpt-4o-mini(단가 약 1/17, 품질 확인 필요) |

## 6. 결정이 필요한 것 (모아보기)

- [ ] UX 흐름 평가를 계획서의 정식 모드로 넣을지, 저장 위치(3-2 표)
- [ ] LLM 공급자 하나로 통일 (Gemini vs OpenAI)
- [ ] 계획서 6-3 Persona Schema(숫자 점수)와 카드 방식(숫자 없는 문장) 정리
- [ ] 직업 매핑표 `data/persona_engine/occupation_map.csv` 검토
- [x] 페르소나 의견 항목 추가 — v0.6에서 추가 (화면별 한마디·좋았던 점·불편했던 점·개선 제안). 3명 테스트에서 1명당 비용 거의 그대로($0.028)

## 7. 파일 지도

```
data/persona_engine/          페르소나 엔진 (PR #6, 머지됨)
├─ README.md                  사용 안내
├─ src/api.py                 ★ 백엔드용 generate() (이번 PR)
├─ src/engine.py              인원 배분 -> NVIDIA 추출 -> 실제 응답자 매칭
├─ src/cards.py               카드 문장
└─ scripts/make_panel.py      명령줄 실행

data/ux_eval/                 UX 흐름 평가 (이번 PR)
├─ README.md                  사용 안내
├─ src/prompt.py              ★ 프롬프트(7개 기준), 응답 형식, 응답 검증
├─ src/flow.py                흐름 JSON 읽기·검사, HTML 변환, 구조 요약(+자동 집계)
├─ src/config.py              기준 문구, 라벨, 비용 상한, 단어 목록 (프롬프트 바꾸면 PROMPT_VERSION 올리기)
├─ src/llm_openai.py          OpenAI 호출 (백엔드 llm.py와 같은 규칙)
├─ src/summary.py             결과 요약 표
├─ scripts/evaluate.py        ★ 평가 실행 (비용 측정·상한, 연속 실패 시 중단)
├─ scripts/html_to_flow.py    정적 HTML -> 흐름
├─ scripts/url_to_flow.py     실제 웹사이트 -> 흐름
├─ scripts/make_viewer.py     결과 뷰어
└─ samples/                   샘플 프로토타입, AICOSS 페이지 목록
```

프롬프트 변경 이력: `data/ux_eval/src/config.py`의 `PROMPT_VERSION` 주석 (v0.1 → v0.6, 각 버전에서 무엇을 왜 바꿨는지).
