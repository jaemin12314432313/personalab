"""결과 리포트 HTML 한 장. 사용: python scripts/make_report.py
결과: outputs/report.html (더블클릭으로 열림, 외부 파일·폰트 없이 동작)

데이터와 계산은 make_viewer.py와 같다. 틀(report_template.html)만 다르다."""
import json
from pathlib import Path

from make_viewer import SEGMENTS, C, load_runs


def main():
    runs = load_runs()
    if not runs:
        raise SystemExit("outputs/에 실제 평가 결과가 없습니다. scripts/evaluate.py를 먼저 실행하세요.")
    meta = {"criteria": [{"key": k, "name": n, "desc": d} for k, (n, d) in C.CRITERIA.items()],
            "labels": C.LABELS, "drop_ko": C.DROP_REASON_KO,
            "segments": [{"key": k, "name": n, "order": o, "desc": d} for k, (n, o, d) in SEGMENTS.items()]}
    # 데이터 안의 "</script>" 같은 문자열이 스크립트 태그를 닫지 않게 한다
    dump = lambda x, **kw: json.dumps(x, ensure_ascii=False, **kw).replace("</", "<\\/")
    tpl = Path(__file__).with_name("report_template.html").read_text(encoding="utf-8")
    page = (tpl.replace("/*__RUNS__*/null", dump(runs, default=str))
               .replace("/*__META__*/null", dump(meta)))
    out = C.OUT / "report.html"
    out.write_text(page, encoding="utf-8")
    print(f"{out} | 실행 {len(runs)}개: " + ", ".join(r["id"] for r in runs))


if __name__ == "__main__":
    main()
