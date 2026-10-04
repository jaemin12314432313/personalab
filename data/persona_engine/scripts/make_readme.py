"""outputs/의 리포트를 모아 점검 결과 표와 알려진 한계를 outputs/README.md로 쓴다. 사용: python scripts/make_readme.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import config as C                                   # noqa: E402

LIMITS = """## 알려진 한계

| 한계 | 원인 | 영향 |
|---|---|---|
| 자취·1인가구 대학생의 행태가 거의 없다 | 미디어패널은 가구 방문 패널이라 20대 대학생 375명 중 359명이 가구주의 자녀 | 자취생의 높은 가격 민감도가 과소 반영될 수 있다(검증 불가) |
| donor 시점과 현재의 차이 | donor는 2024년 조사 | OTT·생성형 AI 유료 이용률이 현재보다 낮게 잡힐 수 있다 |
| NVIDIA에 실제 대학생이 거의 없다 | `occupation`에 학생 값이 없고, '20대·대졸·무직' 서술의 58%가 구직자, 학생 표현은 0.1% | 학생은 '서술에 구직 표현이 없는 20대 대졸 무직'(16,623명)으로 추정한다. 학생이라고 명시된 사람은 아니다 |
| NVIDIA 직업군이 규칙 기반 | KSCO 직업명을 키워드 사전(`nvidia.JOB_KEYWORDS`, 매핑표 `occupation_map.csv`)으로 donor 직업군에 맞춘다 | 경계 직업은 팀 검토로 고친다 |
| NVIDIA에 농림어업 종사자가 매우 적다 | 19~70세 중 244명(0.03%), donor는 1.9% | 농림어업 비중이 큰 타깃(고령·지방)에서 shortfall이 생길 수 있다 |
| 대졸자의 전문대/4년제를 구분하지 않는다 | `p24school13`은 재학·휴학생만 응답 | 학력 매칭 키를 고졸이하/대졸/대학원 3범주로 묶었다(v0.1) |
| 작은 칸에서 donor가 재사용된다 | 예: 여성 25~29세 대학생 donor 8명 | 같은 경제 변수를 가진 페르소나가 생긴다. `over_cap`, `max_reuse`로 감시 |
| 소득의 변별력이 약하다 | 대학생 donor의 80%가 소득 없음 | 가격 민감도가 OTT 지불 형태에 크게 의존한다 |
| 점수는 타깃 부분집합 안의 상대값이다 | 부분집합 안의 가중 백분위 | 같은 사람도 타깃이 다르면 점수가 다르다. 서로 다른 스터디의 점수를 직접 비교하지 않는다 |
| 쪼갤 수 없는 동점 덩어리가 있다 | 예: 60세 이상의 40%가 '소득 있음·유료 서비스 없음'으로 같은 점수 | 등급 비율이 허용 범위를 벗어나면 가장 큰 덩어리를 '중간'에 고정한다. 60세 이상은 가격 민감 낮음 12%로 경고 |
| 결측이 큰 변수를 '미이용'으로 처리한다 | `d31007` 결측 62%, `d26057`·`d26061` 약 27% | 응답 거부와 미이용이 구분되지 않는다 |
| 점수 가중치가 초안이다 | 팀 합의 전 | `SCORING_VERSION`으로 버전 관리 |
"""


def main():
    rows = []
    for rp in sorted(C.OUT.glob("panel_*_report.json")):
        j = json.loads(rp.read_text(encoding="utf-8"))
        r, ck = j["report"], j["checks"]
        name = rp.name.replace("panel_", "").replace("_report.json", "")
        ml = r["match_level_counts"]
        ge3 = sum(v for k, v in ml.items() if int(k) >= 3)
        ok = lambda b: "✅" if b else "⚠️"
        rows.append(
            f"| {name} | {ck['quota_match']['n']}/{r['n']} | {ok(ck['quota_match']['ok'])} | "
            + " / ".join(f"{k} {v['p']:.2f}" for k, v in ck["dist"].items()) + f" | "
            f"{ml.get('1', 0)}% · 3+ {ge3}% {ok(ck['match_level']['ok'])} | "
            f"{r['donors_used']} / {r['donor_max_reuse']}회 / {r['over_cap_n']} | "
            f"{ok(ck['duplicate_cards']['ok'])} | {ok(ck['card_numbers']['ok'])} | "
            f"{', '.join(r.get('grade_warnings', [])) or '-'} |")
    head = (f"# Persona Engine 산출물\n\n점수 버전 `{C.SCORING_VERSION}` · 생성: `python scripts/make_panel.py --preset <이름>`"
            " · 뷰어: `python scripts/make_viewer.py`\n\n## 품질 점검 (N=100, seed=42)\n\n"
            "| 패널 | 인원 | 할당 일치 | 분포 일치 p (ps / da / privacy / ott) | 매칭 level 1 · 3+ | donor 사용 / 최대 재사용 / 상한 초과 | 카드 중복 0 | 카드 숫자 0 | 등급 경고 |\n"
            "|---|---|---|---|---|---|---|---|---|\n")
    note = "\n분포 일치는 카이제곱 검정으로 p > 0.05면 donor 부분집합의 가중 분포와 다르지 않다는 뜻이다.\n\n"
    out = C.OUT / "README.md"
    out.write_text(head + "\n".join(rows) + "\n" + note + LIMITS, encoding="utf-8")
    print(out)
    print(head.split("## 품질 점검")[1] + "\n".join(rows))


if __name__ == "__main__":
    main()
