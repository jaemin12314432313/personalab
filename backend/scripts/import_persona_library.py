"""
Usage: python scripts/import_persona_library.py --directory ../data/persona_engine/outputs
--source-commit SHA
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import SessionLocal, engine
from app.services.persona.library_import import import_prepared, prepare_directory


async def run(args):
    # 전체 파일 검증을 DB 트랜잭션 시작 전에 끝낸다.
    panels = prepare_directory(Path(args.directory), args.source_commit, args.expected_total)
    try:
        async with SessionLocal() as session:
            async with session.begin():
                result = await import_prepared(session, panels)
        print(
            json.dumps(
                {"total": sum(p["count"] for p in result), "panels": result}, ensure_ascii=True
            )
        )
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--expected-total", type=int, default=400)
    asyncio.run(run(parser.parse_args()))
