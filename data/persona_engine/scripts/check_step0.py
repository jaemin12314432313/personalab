"""Step 0: 미디어패널 2024 개인 데이터의 행·열과 필수 변수 확인. 사용: python scripts/check_step0.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import config as C                                   # noqa: E402
from src.donor import RAW_COLS, load_donor                    # noqa: E402
from src.utils import codebook_lookup                         # noqa: E402

REQUIRED = ["pid", "wt", "gender", "age1", "school1", "school2", "school13", "job1", "job3", "mar",
            "area", "income", "d26061", "d26057", "c06006", "d31007", "d23003"] + \
           [f"m01{i:03d}" for i in range(1, 25)]

df = load_donor()
y = f"p{C.YEAR}"
print(f"[행·열] {df.shape[0]:,}행 x {df.shape[1]:,}열 (기대 8,693행)")

missing_req = [c for c in REQUIRED if y + c not in df.columns]
missing_all = [c for c in RAW_COLS if y + c not in df.columns]
print("[필수 열 없음]", missing_req or "없음")
print("[RAW_COLS 중 없음]", missing_all or "없음")

print("[wt 들어간 열]", [c for c in df.columns if "wt" in c])
if y + "wt" in df:
    w = df[y + "wt"]
    print(f"[{y}wt] 결측 {w.isna().sum()}, 0 {int((w == 0).sum())}\n{w.describe().to_string()}")
if y + "pid" in df:
    print(f"[{y}pid] 유일값 {df[y + 'pid'].nunique():,} / {len(df):,}")

if y + "area" in df:
    print(f"[{y}area 분포]\n{df[y + 'area'].value_counts(dropna=False).sort_index().to_string()}")

if y + "d26057" in df:
    s = df[y + "d26057"]
    pos = s[s > 0]
    print(f"[{y}d26057 > 0] n={len(pos)}\n{pos.describe().to_string()}")
    print("상위 10개 값(빈도):", pos.value_counts().head(10).to_dict())

for c in ("d01001", "d01002", "d01003"):
    print(f"[{y}{c}] 존재 {y + c in df}", df[y + c].value_counts().sort_index().to_dict() if y + c in df else "")

for v in ("p__income", "p__job3", "p__school1", "p__area"):
    desc, rows = codebook_lookup(v)
    print(f"[코드북 {v}] {desc}")
    for r in rows[:40]:
        print("   ", r)
