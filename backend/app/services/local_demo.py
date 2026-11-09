"""연결 점검용 가상 입력. 실제 카드나 모델 API를 읽거나 호출하지 않는다."""

from app.core.config import LOCAL_CHECK_MAX_TURNS
from app.services.act.loop import agent_loop

SCREENS = [
    {
        "id": "LC01",
        "label": "시작",
        "description": "등록된 설명과 버튼으로 연결을 확인하는 가상 화면입니다.",
        "elements": [{"text": "가입 시작", "to": "LC02"}],
    },
    {
        "id": "LC02",
        "label": "가입 확인",
        "description": "휴대폰 인증을 진행하고 완료하거나 시작으로 돌아갑니다.",
        "elements": [
            {"text": "가입 완료", "to": "LC03"},
            {"text": "처음으로", "to": "LC01"},
            {"text": "화면 유지", "to": None},
        ],
    },
    {"id": "LC03", "label": "홈", "description": "연결 점검용 목표 화면입니다.", "elements": []},
]


def make_local_records():
    records = []
    for index, behavior in enumerate(("complete", "privacy", "limit", "navigation"), 1):
        attrs = {
            "profile": {"age": 20 + index, "job_group": "로컬 점검용 가상 프로필"},
            "card_text": (
                "DB 저장과 결과 조회를 점검하기 위해 직접 구성한 가상 카드입니다. 실제 "
                "페르소나나 실제 AI 응답이 아닙니다."
            ),
            "traits": {},
            "source": {"persona_id": f"LC{index:03}", "local_demo": True},
        }

        def decide(_persona, _task, screen, _history, kind=behavior):
            if screen["id"] == "LC01":
                return {
                    "action": "click",
                    "target": "가입 시작",
                    "drop_reason": None,
                    "reason": "직접 구성한 연결 점검 예시: 가입 화면으로 이동합니다.",
                }
            if kind == "privacy":
                return {
                    "action": "abandon",
                    "target": None,
                    "drop_reason": "PRIVACY",
                    "reason": "직접 구성한 예시: 휴대폰 인증이 필요한 이유를 확인하지 못해 멈춥니다.",  # noqa: E501
                }
            return {
                "action": "click",
                "target": {"complete": "가입 완료", "limit": "화면 유지", "navigation": "처음으로"}[
                    kind
                ],
                "drop_reason": None,
                "reason": "직접 구성한 연결 점검 예시입니다.",
            }

        # limit 콜백은 목록 밖 선택을 하도록 하여 한도 종료를 검증한다. 유효한 제자리 클릭은 경로
        # 반복 종료가 된다.
        if behavior == "limit":

            def decide(_persona, _task, _screen, _history):
                return {
                    "action": "click",
                    "target": "등록되지 않은 점검용 버튼",
                    "drop_reason": None,
                }

        logs = agent_loop(
            attrs,
            "가입을 완료하고 홈으로 이동하세요.",
            {s["id"]: s for s in SCREENS},
            "LC01",
            "LC03",
            LOCAL_CHECK_MAX_TURNS,
            decide=decide,
        )
        records.append((attrs, logs))
    return SCREENS, records
