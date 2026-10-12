"""拉取案例回放所需的真实日线行情，写入 src/data/prices.json。
用法：python scripts/fetch_prices.py   （依赖 akshare）"""
import json, sys, time, pathlib
import akshare as ak

START, END = "20250102", "20250430"
STOCKS = [("002475", "a"), ("600519", "a"), ("300750", "a"), ("00700", "hk"), ("01810", "hk"),
          ("AAPL", "us"), ("NVDA", "us"), ("PDD", "us")]
US_PREFIX = {"AAPL": "105.AAPL", "NVDA": "105.NVDA", "PDD": "105.PDD"}

def rows(df):
    out = []
    for _, r in df.iterrows():
        out.append({"d": str(r["日期"])[:10], "o": float(r["开盘"]), "c": float(r["收盘"]), "h": float(r["最高"]),
                    "l": float(r["最低"]), "v": float(r["成交量"]), "p": float(r["涨跌幅"]), "t": float(r["换手率"])})
    return out

def fetch(code, mkt):
    if mkt == "a":
        return rows(ak.stock_zh_a_hist(symbol=code, period="daily", start_date=START, end_date=END, adjust="qfq"))
    if mkt == "hk":
        return rows(ak.stock_hk_hist(symbol=code, period="daily", start_date=START, end_date=END, adjust="qfq"))
    return rows(ak.stock_us_hist(symbol=US_PREFIX[code], period="daily", start_date=START, end_date=END, adjust="qfq"))

out = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "prices.json"
# 行情接口偶发断连：已有的数据先留着，只替换这次拉成功的；缺换手率（t）的股票下次再补
data = json.loads(out.read_text())["prices"] if out.exists() else {}
todo = [(c, m) for c, m in STOCKS if c not in data or "t" not in data[c][-1]] or STOCKS
failed = []
for code, mkt in todo:
    for attempt in range(8):
        try:
            data[code] = fetch(code, mkt)
            print(code, len(data[code]), file=sys.stderr)
            break
        except Exception as e:  # noqa: BLE001
            print("retry", code, attempt, repr(e)[:80], file=sys.stderr)
            time.sleep(3 + attempt * 3)
    else:
        failed.append(code)
out.write_text(json.dumps({"source": "东方财富（经 akshare），前复权日线", "range": [START, END], "prices": data}, ensure_ascii=False))
print("failed:", failed, file=sys.stderr)
sys.exit(1 if failed else 0)
