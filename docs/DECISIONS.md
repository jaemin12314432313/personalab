# 결정 기록

개발계획서에 명시되지 않았거나 서로 어긋나는 부분을 어떻게 정했는지 남긴다. 계획서를 고치기 전까지 이 문서가 보충 기준이다.

| # | 날짜 | 내용 | 결정 | 반영 위치 |
| --- | --- | --- | --- | --- |
| 1 | 2026-09-28 | 11-3 라벨링 가이드의 `OTHER`가 고정 카테고리 8개에 없음 | **리뷰 라벨링(`benchmark_issues.category`)에서만 허용.** Act·참가자 이탈 이유는 8개 그대로. 순위 대조에서 `OTHER`는 제외 | `core/config.py` `LABEL_OTHER`, DB CHECK |
| 2 | 2026-09-28 | 8-2 의사코드가 강제 종료 시 `drop_reason="MAX_TURNS"`로 기록하나 카테고리가 아님 | **`MAX_TURNS`를 시스템 코드로 허용.** 이탈 이유 분포 집계에서는 제외하고 별도로 센다 | `core/config.py` `DROP_REASON_MAX_TURNS`, DB CHECK |
| 3 | 2026-09-28 | `act_logs.participant_id`가 personas(ai)와 invites(real)를 모두 가리킴 | **FK 없이 정수 + `participant_type`.** 무결성은 `repositories/`에서 검사 | `models/run.py` `ActLog` |
| 4 | 2026-09-28 | 실제 참가자의 Q5·Q6 응답 저장 위치가 9장에 없음. 실제 참가자 `act_logs.run_id`도 미정 | **6단계(참가자 뷰) 전에 팀 결정.** 계획서 9장 수정 후 마이그레이션 추가 | 미정 |
