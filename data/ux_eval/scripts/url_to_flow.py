"""실제 웹사이트 페이지 목록 -> 흐름 JSON.

  python scripts/url_to_flow.py samples/aicoss_signup_pages.json

설정 파일(JSON)에 화면으로 쓸 페이지 주소, 과제, 목표 화면, 자동으로 못 읽는 버튼 이동(patch)을 적는다.
페이지는 한 번만 받아 outputs/cache/에 저장하고(요청 사이 1초 대기), 다음부터는 저장본을 쓴다.
서버에서 완성된 HTML을 주는 사이트만 읽을 수 있다. 양식 제출처럼 실제 동작이 일어나는 요청은 보내지 않는다.
결과: outputs/flows/<name>_flow.json (사이트 원문이 들어가므로 저장소에 올리지 않는다)"""
import argparse
import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import config as C                                   # noqa: E402
from src.flow import pages_to_flow, render_flow               # noqa: E402

CACHE = C.OUT / "cache"


def fetch(url: str, refresh: bool) -> str:
    f = CACHE / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".html")
    if f.exists() and not refresh:
        return f.read_text(encoding="utf-8")
    req = urllib.request.Request(url, headers={"User-Agent": C.FETCH_USER_AGENT})
    with urllib.request.urlopen(req, timeout=C.FETCH_TIMEOUT_SEC) as r:
        html = r.read().decode(r.headers.get_content_charset() or "utf-8", errors="replace")
    CACHE.mkdir(parents=True, exist_ok=True)
    f.write_text(html, encoding="utf-8")
    time.sleep(C.FETCH_DELAY_SEC)                             # 사이트에 부담 주지 않게
    return html


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", help="페이지 목록 설정 JSON")
    ap.add_argument("--refresh", action="store_true", help="저장본을 무시하고 다시 받기")
    a = ap.parse_args()

    spec = json.loads(Path(a.spec).read_text(encoding="utf-8"))
    try:
        flow = pages_to_flow(spec, lambda u: fetch(u, a.refresh))
    except ValueError as e:
        sys.exit(f"변환 실패: {e}")
    out = C.OUT / "flows" / f"{spec['name']}_flow.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(flow, ensure_ascii=False, indent=2), encoding="utf-8")
    print(render_flow(flow))
    print(f"\n-> {out.relative_to(C.ROOT)}  (화면 {len(flow['screens'])}개, 요약 {len(render_flow(flow)):,}자)")


if __name__ == "__main__":
    main()
