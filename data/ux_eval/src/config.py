"""UX 흐름 평가 설정. 기준·라벨·경로는 여기에만 둔다."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]                  # data/ux_eval
REPO = ROOT.parents[1]                                      # 저장소 루트
OUT = ROOT / "outputs"
PANEL_DIR = REPO / "data" / "persona_engine" / "outputs"   # Persona Engine 결과(card_text)

# LLM 호출·이탈 카테고리는 백엔드 것을 그대로 쓴다 (재시도·검증 규칙과 8개 카테고리를 한 곳에서 관리)
sys.path.insert(0, str(REPO / "backend"))
from app.core.config import DROP_REASONS  # noqa: E402

PROMPT_VERSION = "v0.1"        # 프롬프트·기준 문구를 바꾸면 올린다
DEV_N = 20                     # 개발 중 기본 인원 (CLAUDE.md 비용 관리: 20명으로 먼저)
MAX_CONSECUTIVE_FAILS = 3      # 연속 실패하면 실행 중단 (프롬프트 문제로 재시도 비용이 새는 것 방지)

LABELS = ["좋음", "보통", "나쁨", "판단불가"]
IMPORTANCE = ["높음", "중간", "낮음"]
COMPLETE = ["예", "아니오"]
NOT_JUDGED = "판단불가"

# 평가 기준 (ISO 9241-11 효과성·효율성·만족도 뼈대 + 닐슨 휴리스틱 항목). 키는 결과 열 이름
CRITERIA = {
    "simplicity": ("단순함", "한 화면의 입력 필드, 선택지, 정보량이 적고, 목표까지 단계가 적은가."),
    "feedback": ("상태 및 피드백", "동작의 결과(진행, 완료, 저장 결과 등)가 문구로 알려지는가."),
    "control": ("통제", "뒤로가기, 건너뛰기, 취소로 사용자가 언제든 화면에서 빠져나갈 수 있는가."),
    "clarity": ("이해", "전문 지식이 없어도 이해하기 쉬운 말인가. 또한 입력 항목마다 이름이나 안내가 있는가."),
    "consistency": ("일관성", "같은 기능의 문구와 동작이 화면마다 같고, 익숙한 앱 관행(다음/완료 같은 표준 버튼 문구, "
                            "약관 동의의 필수 및 선택 구분, 인증 뒤 완료 화면)을 따르는가."),
    "error": ("오류 예방 및 복구", "확정 전 확인과 필수 및 선택 표시가 있고, 오류 시 해결 방법을 안내하는가."),
    "flexibility": ("유연성 및 도움", "소셜 로그인 같은 간편 경로와 막힌 지점에서 볼 수 있는 도움말이 있는가."),
}

# 완주하지 않을 때의 이탈 이유 (계획서 8-5, 백엔드 DROP_REASONS와 같은 순서)
DROP_REASON_KO = {
    "UNCLEAR_PURPOSE": "무슨 앱인지 모르겠다",
    "TOO_MANY_STEPS": "단계·입력 항목이 너무 많다",
    "PRIVACY": "개인정보를 과하게 요구한다",
    "PRICE": "가격이 부담된다",
    "TRUST": "믿기 어렵다",
    "FEATURE_MISSING": "필요한 기능이 없다",
    "SWITCHING_COST": "쓰던 것을 옮기기 번거롭다",
    "NAVIGATION_LOST": "어디로 가야 할지 모르겠다",
}
assert tuple(DROP_REASON_KO) == DROP_REASONS, "백엔드 DROP_REASONS와 달라졌다"
