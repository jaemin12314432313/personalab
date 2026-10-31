# UX 흐름 평가 에이전트

AI 페르소나가 서비스의 **화면 흐름 전체**를 보고, 7개 사용성 기준으로 평가하고, 끝까지 할지(완주) 판단합니다.
페르소나는 Persona Engine(`data/persona_engine`)이 만든 카드를 그대로 씁니다.

- 평가 기준: ISO 9241-11(효과성·효율성·만족도) 뼈대 + 닐슨 휴리스틱 항목 7개
  단순함 · 상태 및 피드백 · 통제 · 이해 · 일관성 · 오류 예방 및 복구 · 유연성 및 도움
- 기준마다: 라벨(좋음/보통/나쁨/판단불가) + 근거(화면 id 포함) + 이 페르소나에게 중요한 정도(높음/중간/낮음)와 이유
- 마지막: 끝까지 할지(예/아니오) + 이유. 아니오면 그만둘 화면과 이탈 이유(팀 공용 8개 카테고리)
- 화면은 **글(구조 요약)로만** 봅니다. 색·배치·글자 크기·속도는 '판단불가'로 나옵니다

## 준비 (처음 한 번)

```
cd data/ux_eval
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set PYTHONUTF8=1
```

- 페르소나 CSV가 필요합니다: `data/persona_engine`에서 `python scripts/make_panel.py --preset univ`
- 실제 실행에는 저장소 루트 `.env`에 `LLM_API_KEY=...`가 필요합니다 (백엔드와 같은 키, 같은 호출 함수)

## 사용법

**1) 화면 흐름 준비**: 둘 중 하나

- 정적 HTML 묶음(페이지끼리 링크로 연결)을 변환
  ```
  python scripts/html_to_flow.py samples/signup_html --name signup --task "Plani에 회원가입을 완료한다" --goal S05 --start S01
  ```
  파일 하나 = 화면 하나, 파일 이름 = 화면 id. 만들어진 `samples/signup_flow.json`을 열어 빠진 것만 고칩니다.
- 또는 `samples/signup_flow.json` 형식으로 직접 작성 (Figma 화면을 옮길 때)
- **실제 웹사이트**: 화면으로 쓸 페이지 주소를 설정 파일에 적고 변환 (예: `samples/aicoss_signup_pages.json`)
  ```
  python scripts/url_to_flow.py samples/aicoss_signup_pages.json
  ```
  - 페이지는 한 번만 받아 `outputs/cache/`에 저장(요청 사이 1초 대기). 결과는 `outputs/flows/<이름>_flow.json`
  - 모든 페이지에 반복되는 상단·하단 메뉴와 문구는 "공통 메뉴"로 한 번만 넣는다 (비용 절감)
  - 자바스크립트로 이동하는 버튼은 설정 파일 `patch`에 이동 대상을 적는다
  - 양식 제출처럼 실제 동작이 일어나는 화면(예: 가입 완료)은 열지 않고 `extra_screens`에 "내용 확인 안 함"으로 둔다
  - 서버가 완성된 HTML을 주는 사이트만 읽는다 (React 등으로 화면을 그리는 사이트는 안 됨)

**2) 평가 실행**

| 하고 싶은 것 | 명령어 | 비용 |
|---|---|---|
| AI에게 실제로 보낼 글 확인 | `python scripts/evaluate.py --flow samples/signup_flow.json --dry-run` | 없음 |
| 가짜 응답으로 전체 과정 점검 | `python scripts/evaluate.py --flow samples/signup_flow.json --mock` | 없음 |
| 20명 실제 평가 | `python scripts/evaluate.py --flow samples/signup_flow.json` | 호출 20회 |
| 다른 패널·인원 | `... --panel ../persona_engine/outputs/panel_30s_office_n100_seed42.csv --n 50` | 호출 50회 |

**3) 결과**: `outputs/<흐름>_<패널>_n<인원>/`

| 파일 | 내용 |
|---|---|
| `summary.md` | 완주율, 이탈 화면·이유, 기준별 라벨 분포와 일치도, 특성별 완주율, 대표 근거 |
| `results.csv` | 한 줄 = 페르소나 한 명. 엑셀로 열기 |
| `results.jsonl` | LLM 응답 원본 |

**라벨 일치도**를 먼저 보세요. 라벨은 화면에서 확인되는 사실이라 페르소나가 달라도 같아야 합니다.
일치도가 낮은 기준은 프롬프트 문구나 입력(화면 요약)이 모호하다는 뜻입니다.

## 응답 검증 (자동, 실패 시 최대 3번 다시 묻기)

- 7개 기준이 모두 있고, 라벨·중요도가 정해진 값인지
- '판단불가'가 아닌 라벨은 근거에 화면 id나 화면 이름이 들어 있는지 (입력에서 확인한 사실인지)
- 완주 '아니오'면 그만둘 화면이 흐름에 있고 이탈 이유가 8개 중 하나인지

## 파일

```
data/ux_eval/
├─ scripts/evaluate.py       ★ 평가 실행
├─ scripts/html_to_flow.py   정적 HTML -> 흐름 JSON
├─ samples/signup_html/      샘플 프로토타입 (회원가입 5화면, 일부러 문제를 넣음)
├─ samples/signup_flow.json  위를 변환한 흐름
└─ src/
   ├─ config.py   평가 기준 문구, 라벨, 이탈 카테고리 (기준을 바꾸면 PROMPT_VERSION 올리기)
   ├─ prompt.py   시스템 프롬프트, 응답 형식, 응답 검증
   ├─ flow.py     흐름 읽기·검사, HTML 변환, 구조 요약 글 만들기
   └─ summary.py  결과 표와 요약
```

## 한계

- 정적 HTML만 변환합니다. 자바스크립트로 화면을 그리는 웹앱(React 등)과 APK는 지원하지 않습니다.
- 버튼을 눌렀을 때의 반응(오류 메시지, 로딩)은 화면에 미리 적혀 있지 않으면 알 수 없어 '판단불가'가 많을 수 있습니다.
- 결과는 AI 페르소나의 응답(Synthetic User Response)이며 실제 사용자 결과와 섞지 않습니다.
