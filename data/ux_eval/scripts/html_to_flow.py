"""정적 HTML 묶음(페이지끼리 링크로 이어진 프로토타입)을 흐름 JSON으로 바꾼다.

  python scripts/html_to_flow.py samples/signup_html --name signup --task "회원가입을 완료한다" --goal S05 --start S01

파일 하나 = 화면 하나, 파일 이름 = 화면 id. 버튼 이동은 <a href>, <button data-to>, onclick의 location.href,
<form action>에서 읽는다. 자바스크립트로 그리는 화면(React 등)은 읽지 못한다.
결과 JSON을 열어 빠진 문구나 연결을 고친 뒤 evaluate.py에 넣는다."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.flow import html_to_flow, render_flow                # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", help=".html 파일이 들어 있는 폴더")
    ap.add_argument("--name", required=True, help="흐름 이름 (결과 폴더 이름에 쓰임)")
    ap.add_argument("--task", required=True, help="페르소나에게 줄 과제 문장")
    ap.add_argument("--goal", required=True, help="목표 화면 id (파일 이름)")
    ap.add_argument("--start", help="시작 화면 id (없으면 파일 이름순 첫 화면)")
    ap.add_argument("--out", help="저장할 JSON 경로 (기본: 폴더 옆 <name>_flow.json)")
    a = ap.parse_args()

    try:
        flow = html_to_flow(a.folder, a.name, a.task, a.goal, a.start)
    except ValueError as e:
        sys.exit(f"변환 실패: {e}")
    out = Path(a.out) if a.out else Path(a.folder).parent / f"{a.name}_flow.json"
    out.write_text(json.dumps(flow, ensure_ascii=False, indent=2), encoding="utf-8")
    print(render_flow(flow))
    print(f"\n-> {out}  (화면 {len(flow['screens'])}개)")


if __name__ == "__main__":
    main()
