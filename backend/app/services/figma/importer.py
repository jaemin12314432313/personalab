"""Figma 문서를 기존 텍스트·버튼 Screen 구조로 변환한다. 이미지·조건 분기는 재현하지 않는다."""

import asyncio
import re
from urllib.parse import parse_qs, urlparse

import httpx

from app.core.config import (
    FIGMA_API_BASE,
    FIGMA_MAX_ATTEMPTS,
    FIGMA_MAX_BYTES,
    FIGMA_MAX_DESCRIPTION,
    FIGMA_MAX_NODES,
    FIGMA_MAX_SCREENS,
    FIGMA_TIMEOUT_SEC,
    settings,
)


class FigmaImportError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def parse_figma_url(url: str) -> tuple[str, str | None]:
    try:
        parsed = urlparse(url)
        if (
            parsed.scheme != "https"
            or parsed.hostname not in {"figma.com", "www.figma.com"}
            or parsed.username
            or parsed.password
            or parsed.port not in {None, 443}
        ):
            raise ValueError()
        match = re.match(r"^/(?:design|file|proto)/([A-Za-z0-9]{6,100})(?:/|$)", parsed.path)
        if not match:
            raise ValueError()
        node = parse_qs(parsed.query).get("node-id", [None])[0]
        if node:
            if not re.fullmatch(r"[0-9]+[-:][0-9]+", node):
                raise ValueError()
            node = node.replace("-", ":")
        return match.group(1), node
    except (ValueError, TypeError):
        raise FigmaImportError("Figma 파일 또는 프로토타입의 HTTPS 링크를 입력해 주세요.") from None


def walk(node: dict):
    stack = [node]
    count = 0
    while stack:
        current = stack.pop()
        if not isinstance(current, dict) or current.get("visible") is False:
            continue
        count += 1
        if count > FIGMA_MAX_NODES:
            raise FigmaImportError(
                "문서의 요소가 너무 많습니다. 테스트할 화면을 별도 파일로 모아 주세요."
            )
        yield current
        stack.extend(reversed(current.get("children") or []))


def convert_file(payload: dict, requested_node: str | None = None) -> tuple[list[dict], list[str]]:
    document = payload.get("document")
    if not isinstance(document, dict):
        raise FigmaImportError("Figma 문서 구조를 읽을 수 없습니다.", 502)
    all_nodes = list(walk(document))
    frames = []

    def collect(node):
        for child in node.get("children") or []:
            if not isinstance(child, dict) or child.get("visible") is False:
                continue
            if child.get("type") in {"FRAME", "COMPONENT", "INSTANCE"}:
                frames.append(child)
            elif child.get("type") in {"DOCUMENT", "CANVAS", "SECTION", "GROUP", "COMPONENT_SET"}:
                collect(child)

    collect(document)
    if not frames:
        raise FigmaImportError(
            "가져올 화면 프레임이 없습니다. Figma에서 화면을 프레임으로 구성해 주세요."
        )
    owner = {n["id"]: f["id"] for f in frames for n in walk(f) if n.get("id")}
    start = owner.get(requested_node) if requested_node else None
    if requested_node and not start:
        raise FigmaImportError(
            "링크의 시작 요소가 가져올 화면에 없습니다. 화면 프레임 링크를 확인해 주세요."
        )
    if not start:
        starts = [
            point.get("nodeId")
            for n in all_nodes
            if n.get("type") == "CANVAS"
            for point in n.get("flowStartingPoints", [])
        ]
        starts += [n.get("prototypeStartNodeID") for n in all_nodes if n.get("type") == "CANVAS"]
        start = next((owner[s] for s in starts if s in owner), frames[0]["id"])
    frames.sort(key=lambda f: f["id"] != start)
    warnings = {
        (
            "화면 텍스트와 명시적인 클릭 이동만 가져옵니다. 이미지·조건 "
            "분기·오버레이·스크롤·애니메이션은 재현하지 않습니다."
        )
    }
    if len(frames) > FIGMA_MAX_SCREENS:
        warnings.add(
            f"화면이 많아 처음 {FIGMA_MAX_SCREENS}개만 가져왔습니다. 나머지는 별도 파일로 "
            "가져오세요."
        )
    frames = frames[:FIGMA_MAX_SCREENS]
    mapping = {f["id"]: f"S{i + 1:02}" for i, f in enumerate(frames)}
    screens = []
    for frame in frames:
        texts = [
            n.get("characters", "").strip()
            for n in walk(frame)
            if n.get("type") == "TEXT" and n.get("characters", "").strip()
        ]
        description = "\n".join(dict.fromkeys(texts))
        if len(description) > FIGMA_MAX_DESCRIPTION:
            warnings.add(
                "일부 화면의 텍스트가 길어 가져오기 상한에서 잘렸습니다. 편집 화면에서 확인하세요."
            )
        elements = []
        used = set()
        for node in walk(frame):
            actions = []
            for interaction in node.get("interactions") or []:
                if (interaction.get("trigger") or {}).get("type") != "ON_CLICK":
                    warnings.add("클릭 이외의 트리거는 가져오지 않았습니다.")
                    continue
                actions.extend(
                    interaction.get("actions")
                    or ([interaction["action"]] if interaction.get("action") else [])
                )
            # 구 버전 파일의 단일 전환 필드도 명시적으로 지원한다.
            if not node.get("interactions") and node.get("transitionNodeID"):
                warnings.add(
                    "구 버전 단일 화면 전환을 가져왔습니다. 실제 클릭 연결인지 확인하세요."
                )
                actions.append(
                    {
                        "type": "NODE",
                        "navigation": "NAVIGATE",
                        "destinationId": node["transitionNodeID"],
                    }
                )
            supported = [
                a for a in actions if a.get("type") == "NODE" and a.get("navigation") == "NAVIGATE"
            ]
            if len(actions) != len(supported) or len(supported) > 1:
                warnings.add(
                    "복합 동작·조건·오버레이 또는 외부 동작을 생략했습니다. 버튼 연결을 확인하세요."
                )
            if len(supported) != 1:
                continue
            target = owner.get(supported[0].get("destinationId"))
            if target not in mapping:
                warnings.add(
                    "가져오지 않은 화면을 향하는 연결을 생략했습니다. 버튼 연결을 확인하세요."
                )
                continue
            labels = [
                n.get("characters", "").strip()
                for n in walk(node)
                if n.get("type") == "TEXT" and n.get("characters", "").strip()
            ]
            label = " ".join(labels) or node.get("name") or "버튼"
            if label in used:
                label = f"{label} ({node.get('id')})"
            used.add(label)
            elements.append({"text": label, "to": mapping[target]})
        screens.append(
            {
                "id": mapping[frame["id"]],
                "label": frame.get("name") or "화면",
                "description": description[:FIGMA_MAX_DESCRIPTION],
                "elements": elements,
            }
        )
    return screens, sorted(warnings)


async def import_file(url: str) -> tuple[list[dict], list[str]]:
    key, node = parse_figma_url(url)
    if not settings.figma_access_token:
        raise FigmaImportError(
            (
                "Figma 연결 키가 필요합니다. 서버 FIGMA_ACCESS_TOKEN을 설정하거나 아래 화면 "
                "편집을 사용해 주세요."
            ),
            503,
        )
    async with httpx.AsyncClient(timeout=FIGMA_TIMEOUT_SEC, follow_redirects=False) as client:
        for attempt in range(FIGMA_MAX_ATTEMPTS):
            try:
                async with client.stream(
                    "GET",
                    f"{FIGMA_API_BASE}/files/{key}",
                    headers={"X-Figma-Token": settings.figma_access_token},
                ) as response:
                    if response.status_code in {401, 403}:
                        raise FigmaImportError(
                            (
                                "Figma 파일을 읽을 권한이 없습니다. 파일 공유와 연결 키의 "
                                "file_content:read 권한을 확인해 주세요."
                            ),
                            403,
                        )
                    if response.status_code == 404:
                        raise FigmaImportError(
                            "Figma 파일을 찾지 못했습니다. 링크와 파일 공유 권한을 확인해 주세요.",
                            404,
                        )
                    if response.status_code == 429 or response.status_code >= 500:
                        if attempt < FIGMA_MAX_ATTEMPTS - 1:
                            await asyncio.sleep(attempt + 1)
                            continue
                        raise FigmaImportError(
                            "Figma 요청이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.", 503
                        )
                    if response.status_code != 200:
                        raise FigmaImportError("Figma 파일을 가져오지 못했습니다.", 502)
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > FIGMA_MAX_BYTES:
                            raise FigmaImportError(
                                "Figma 파일이 너무 큽니다. 테스트할 화면만 별도 파일로 모아 주세요."
                            )
                    try:
                        import json

                        payload = json.loads(data)
                        if not isinstance(payload, dict):
                            raise ValueError()
                    except (ValueError, TypeError):
                        raise FigmaImportError(
                            "Figma 응답 형식이 올바르지 않습니다.", 502
                        ) from None
                    return convert_file(payload, node)
            except (httpx.TimeoutException, httpx.TransportError):
                if attempt == FIGMA_MAX_ATTEMPTS - 1:
                    raise FigmaImportError(
                        "Figma 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", 503
                    ) from None
                await asyncio.sleep(attempt + 1)
    raise FigmaImportError("Figma 파일을 가져오지 못했습니다.", 502)
