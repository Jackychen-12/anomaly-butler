"""把「异动监测指标设计与分级规则.xlsx」里的指标部分导入成 src/data/indicators.json。
只取指标规则、设计口径、宏观政策、分级与市场四张表；项目参考、评测事件不导入。
用法：python scripts/import_indicators.py <xlsx 路径>   （依赖 openpyxl）"""
import json, pathlib, sys
import openpyxl

wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
def rows(name, skip):
    out = []
    for i, r in enumerate(wb[name].iter_rows(values_only=True)):
        if i < skip or not r[0] or str(r[0]).strip() in ('ID', '主题', '参考ID'):  # 跳过标题、说明和表头
            continue
        out.append([("" if c is None else str(c).strip()) for c in r])
    return out

spec = {r[0]: r for r in rows("设计口径", 3)}
indicators = []
for r in rows("指标规则", 3):
    s = spec.get(r[0], [""] * 8)
    indicators.append({
        "id": r[0], "layer": r[1], "name": r[2],
        "steady": r[3], "balanced": r[4], "aggressive": r[5],
        "levels": r[6], "impact": r[7], "example": r[8], "exclude": r[9],
        "inputs": s[2], "formula": s[3], "window": s[4], "source": s[5], "boundary": s[7],
    })
policies = [{"id": r[0], "name": r[1], "content": r[2], "path": r[3], "trigger": r[4], "example": r[6]} for r in rows("宏观政策", 3)]
rules = [{"topic": r[0], "item": r[1], "rule": r[2], "boundary": r[3]} for r in rows("分级与市场", 3)]
meta = wb["指标规则"]["A2"].value or ""
out = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "indicators.json"
out.write_text(json.dumps({"indicators": indicators, "policies": policies, "rules": rules}, ensure_ascii=False, indent=1))
print(len(indicators), "indicators,", len(policies), "policies,", len(rules), "rules ->", out)
