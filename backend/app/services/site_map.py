"""모델 호출 없는 연결 페이지 조사. 구조 확인과 페르소나의 경험을 혼동하지 않는다."""

import asyncio
import re
from copy import deepcopy
from datetime import UTC, datetime
from time import monotonic
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit

from app.core.config import (
    SITE_SCAN_MAX_DISCOVERED,
    SITE_SCAN_MAX_PAGES,
    SITE_SCAN_PAGE_TIMEOUT_MS,
    SITE_SCAN_TIMEOUT_SECONDS,
)
from app.services import browser

READ_PAGE = r"""(limit) => {
 const label=e=>(e.getAttribute('aria-label')||(e.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim()||[...e.labels||[]].map(l=>l.innerText).join(' ')||e.getAttribute('title')||e.innerText||'').trim();
 const controls=[...document.querySelectorAll('input:not([type=hidden]),textarea,select')];
 const visible=e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
 const links=[...document.querySelectorAll('a[href]')].slice(0,limit).map(e=>({url:e.href,label:label(e).slice(0,160)}));
 const issues=[];
 const add=(code,label,count)=>{if(count)issues.push({code,label,count});};
 add('TITLE_MISSING','문서 제목 없음',!document.title.trim()?1:0);
 add('H1_MISSING','대표 제목(H1) 확인 필요',!document.querySelector('h1')?1:0);
 add('INPUT_LABEL','입력란 이름 확인 필요',controls.filter(e=>visible(e)&&!label(e)).length);
 add('BUTTON_LABEL','버튼 이름 확인 필요',[...document.querySelectorAll('button,[role=button]')].filter(e=>visible(e)&&!label(e)&&!e.getAttribute('aria-labelledby')).length);
 add('IMAGE_UNLOADED','이미지 로드 확인 필요',[...document.images].filter(e=>visible(e)&&e.complete&&!e.naturalWidth).length);
 add('OVERFLOW','가로 넘침 확인 필요',document.documentElement.scrollWidth>innerWidth+8?1:0);
 return {title:document.title,links,links_truncated:document.querySelectorAll('a[href]').length>limit,issues,controls:document.querySelectorAll('a[href],button,input,select,textarea,[role=button]').length};
}"""

UNSAFE_PATH = re.compile(
    r"logout|signout|log-out|unsubscribe|delete|remove|checkout|purchase|결제|삭제|탈퇴|로그아웃",
    re.I,
)
ASSET_PATH = re.compile(
    r"\.(?:png|jpe?g|gif|webp|svg|ico|css|m?js|json|woff2?|ttf|pdf|zip|mp[34]|wav|exe|apk)$", re.I
)


def site_mode(scope):
    explicit = scope.get("exploration")
    return (
        explicit == "site"
        if explicit
        else not bool(scope.get("goal_url") or scope.get("goal_text"))
    )


def page_key(url):
    u = urlsplit(url)
    fragment = u.fragment if u.fragment.startswith(("/", "!")) else ""
    return urlunsplit((u.scheme, u.netloc, u.path or "/", u.query, fragment))


def public_url(url, source):
    u = urlsplit(url)
    return (
        urlunsplit(("", "", u.path or "/", u.query, u.fragment))
        if source.get("kind") == "html"
        else page_key(url)
    )


async def discover(
    source,
    viewport="desktop",
    *,
    checkpoint=None,
    on_progress=None,
    should_pause=None,
    max_pages=None,
    max_discovered=None,
    timeout=None,
):
    previous = deepcopy(checkpoint or {})
    pages = {page_key(p["url"]): p for p in previous.get("pages", [])}
    edges = previous.get("edges", [])
    excluded = set()
    overflow = False
    page_limit = max_pages or SITE_SCAN_MAX_PAGES
    discovered_limit = max_discovered or SITE_SCAN_MAX_DISCOVERED
    time_limit = timeout or SITE_SCAN_TIMEOUT_SECONDS

    def result():
        return {
            "pages": list(pages.values()),
            "edges": edges,
            "excluded_count": previous.get("excluded_count", 0) + len(excluded),
            "limit_reached": overflow or any(p["state"] == "pending" for p in pages.values()),
            "max_pages": page_limit,
            "max_discovered": discovered_limit,
            "scanned_at": datetime.now(UTC).isoformat(),
            "blocked_request_count": len(blocked),
        }

    async def publish():
        if on_progress:
            await on_progress(deepcopy(result()))

    started = monotonic()
    async with browser.open_page(source, viewport) as (page, base, blocked):
        initial = page_key(page.url)

        def add(url, label="", parent=None):
            nonlocal overflow
            try:
                u = urlsplit(url)
                if (
                    u.scheme not in ("http", "https")
                    or u.username
                    or u.password
                    or browser.origin(url) != base
                    or UNSAFE_PATH.search(unquote(u.path))
                    or ASSET_PATH.search(u.path)
                ):
                    excluded.add(url)
                    return
                key = public_url(page_key(url), source)
            except ValueError:
                return
            if parent is not None and len(edges) < discovered_limit * 4:
                edge = {
                    "from": public_url(parent, source),
                    "to": public_url(key, source),
                    "label": label[:160],
                }
                if edge not in edges:
                    edges.append(edge)
            if key in pages:
                return
            if len(pages) >= discovered_limit:
                overflow = True
                return
            pages[key] = {
                "url": public_url(key, source),
                "label": label or public_url(key, source),
                "state": "pending",
                "issues": [],
            }

        add(initial, source.get("title", ""))
        # ZIP 안의 독립 HTML도 목록에 넣되 연결 링크로 꾸미지 않는다.
        if source.get("kind") == "html":
            for f in source.get("files", []):
                if f["path"].lower().endswith((".html", ".htm")):
                    add(urljoin(initial, "/" + f["path"]), f["path"])
        attempted = sum(p["state"] != "pending" for p in pages.values())
        await publish()
        while attempted < page_limit:
            if should_pause and await should_pause():
                break
            pending = next(
                ((url, row) for url, row in pages.items() if row["state"] == "pending"), None
            )
            if pending is None or monotonic() - started >= time_limit:
                break
            key, row = pending
            url = urljoin(initial, key) if source.get("kind") == "html" else key
            attempted += 1
            try:
                remaining = time_limit - (monotonic() - started)
                async with asyncio.timeout(max(0.1, remaining)):
                    if url != initial or attempted > 1:
                        response = await page.goto(
                            url, wait_until="domcontentloaded", timeout=SITE_SCAN_PAGE_TIMEOUT_MS
                        )
                        if response and response.status >= 400:
                            row.update(state="error", error=f"HTTP {response.status}")
                            continue
                        await page.wait_for_timeout(200)
                    data = await page.evaluate(READ_PAGE, discovered_limit)
                    if data["links_truncated"]:
                        overflow = True
                    row.update(
                        state="loaded",
                        label=data["title"] or row["label"],
                        issues=data["issues"],
                        controls=data["controls"],
                        final_url=public_url(page.url, source),
                    )
                    for link in data["links"]:
                        if browser.SENSITIVE.search(link["label"]):
                            excluded.add(link["url"])
                            continue
                        add(link["url"], link["label"], url)
            except Exception:
                row.update(
                    state="error", error="페이지를 읽지 못함 · 접근 제한 또는 응답 지연 확인"
                )
            finally:
                await publish()
        return result()


def next_start(source, seen):
    """앞선 사람의 미방문 페이지를 다음 시작점으로 배정. 클릭 경로를 만들어내지 않는다."""
    pages = source.get("site_map", {}).get("pages", [])
    loaded = [p for p in pages if p["state"] == "loaded"]
    if not seen:
        return None
    return next(
        (p["url"] for p in loaded if page_key(p.get("final_url") or p["url"]) not in seen), None
    )
