"""Step 2: NVIDIA 로딩·변환 점검. 사용: python scripts/check_step2.py [--occ]
  --occ  직업 상위 값 목록까지 출력 (키워드 사전 확장용)"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import config as C                                   # noqa: E402
from src.nvidia import STRUCT_COLS, TEXT_COLS, derive_nvidia, load_nvidia_struct, nvidia_dataset   # noqa: E402

pd.set_option("display.width", 200)
ds = nvidia_dataset()
print(f"[행 수] {ds.count_rows():,}")
print(f"[열 {len(ds.schema.names)}개]", ds.schema.names)
print("[STRUCT/TEXT 중 없는 열]", [c for c in STRUCT_COLS + TEXT_COLS if c not in ds.schema.names] or "없음")
print("[타입]", {f.name: str(f.type) for f in ds.schema if f.name in STRUCT_COLS})

raw = load_nvidia_struct()
cache = C.INTERIM / "nvidia_struct.parquet"
print(f"[구조화 캐시] {cache.stat().st_size / 1e6:.0f} MB, 메모리 {raw.memory_usage(deep=True).sum() / 1e9:.2f} GB")
for c in ["sex", "education_level", "marital_status", "province", "bachelors_field"]:
    print(f"\n[{c}]\n{raw[c].value_counts(dropna=False).to_string()}")
print("\n[age]", raw["age"].describe().round(1).to_dict())

nv = derive_nvidia(raw)                                       # 매핑 안 된 값이 있으면 여기서 오류
print(f"\n[19세 이상] {len(nv):,}")
print("[occupation 고유값]", f"{raw['occupation'].nunique():,}")

m = nv["age"].between(19, 70)
rate = nv.loc[m, "job_group"].notna().mean()
print(f"\n[직업군 분류율 19~70세] {rate:.1%} (목표 90%)")
print(nv.loc[m, "job_group"].value_counts(dropna=False).to_string())
print(f"[학생] 키워드 {int(((nv.job_group == '학생') & ~nv.student_inferred).sum()):,}, 추정 {int(nv.student_inferred.sum()):,}")

unk = nv.loc[m & nv.job_group.isna(), "occupation"].value_counts()
print(f"\n[미분류 상위 50] (미분류 고유값 {len(unk):,})\n{unk.head(50).to_string()}")

if "--occ" in sys.argv:
    for lo, hi in [(19, 29), (30, 59)]:
        print(f"\n[occupation 상위 100, {lo}~{hi}세]")
        print(nv.loc[nv.age.between(lo, hi), "occupation"].value_counts().head(100).to_string())

# ── donor 직업군 분포와 비교 (같은 연령대 19~70) ──
from src.donor import derive_donor, load_donor               # noqa: E402
from src.nvidia import OCC_EXACT, occupation_group           # noqa: E402

dn = derive_donor(load_donor())
dn = dn[dn.age.between(19, 70)]
cmp = pd.DataFrame({
    "NVIDIA%": nv.loc[m, "job_group"].value_counts(normalize=True) * 100,
    "donor가중%": dn.groupby("job_group")["wt"].sum() / dn["wt"].sum() * 100,
}).round(1)
print(f"\n[직업군 분포 비교 19~70세]\n{cmp.to_string()}")
for col, lab in [("school", "학력"), ("region3", "권역"), ("marital", "혼인")]:
    c = pd.DataFrame({"NVIDIA%": nv.loc[m, col].value_counts(normalize=True) * 100,
                      "donor가중%": dn.groupby(col)["wt"].sum() / dn["wt"].sum() * 100}).round(1)
    print(f"[{lab}] " + " | ".join(f"{k}: {r['NVIDIA%']} vs {r['donor가중%']}" for k, r in c.iterrows()))

# ── 팀 검토용 매핑표 (구직중 표기는 '무직·기타' 규칙 하나로 처리되므로 제외) ──
occ = raw.loc[raw.age.between(19, 70), "occupation"].value_counts()
occ = occ[~occ.index.str.contains("구직")]
mp = pd.DataFrame({"occupation": occ.index, "n_19_70": occ.to_numpy()})
mp["job_group"] = mp.occupation.map(occupation_group)
mp["rule"] = mp.occupation.map(lambda o: "exact" if o in OCC_EXACT else "keyword")
out = C.ROOT / "occupation_map.csv"
mp.sort_values(["job_group", "n_19_70"], ascending=[True, False]).to_csv(out, index=False, encoding="utf-8-sig")
print(f"\n[매핑표] {out.name}: {len(mp):,}개 직업명")
