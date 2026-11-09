"""데이터팀 Persona Engine과 스터디의 패널 생성 API를 연결한다."""

import importlib
import importlib.util
import sys
from pathlib import Path
from threading import Lock

_ENGINE = Path(__file__).resolve().parents[4] / "data" / "persona_engine" / "src"
_PACKAGE = "_personalab_persona_engine"
_LOAD_LOCK = Lock()


def _engine_api():
    raw = _ENGINE.parents[1] / "raw"
    for name in ("p24v32_KMP_spss.sav", "P_codebook_v32.xlsx"):
        if not (raw / name).is_file():
            raise FileNotFoundError(f"페르소나 원본 데이터 필요: {raw / name}")
    # data/ux_eval도 src 패키지를 사용하므로 sys.path에 동명의 src를 추가하지 않는다.
    with _LOAD_LOCK:
        if _PACKAGE not in sys.modules:
            spec = importlib.util.spec_from_file_location(
                _PACKAGE, _ENGINE / "__init__.py", submodule_search_locations=[str(_ENGINE)]
            )
            if spec is None or spec.loader is None:
                raise RuntimeError("페르소나 엔진을 읽을 수 없습니다.")
            module = importlib.util.module_from_spec(spec)
            sys.modules[_PACKAGE] = module
            spec.loader.exec_module(module)
        return importlib.import_module(f"{_PACKAGE}.api")


def sample_personas(conditions: dict, n: int, seed: int) -> list[dict]:
    """원본 데이터에서 패널을 생성한다. 실패 시 임시·랜덤 프로필로 대체하지 않는다."""
    engine = _engine_api()
    engine.parse_conditions(conditions)
    with _LOAD_LOCK:
        return engine.generate(conditions, n, seed)
