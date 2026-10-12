"""把 scripts/export-dataset.ts 导出的 JSON 排成 Excel，只留和题目直接相关的四块：信号集（宏观政策 + 微观指标）、信噪比、异动记录、评测事件。
用法：npx tsx scripts/export-dataset.ts > dataset.json && python scripts/build_dataset_xlsx.py dataset.json docs/异动监测信息集与评测事件.xlsx   （依赖 openpyxl）"""
import json, sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

d = json.load(open(sys.argv[1], encoding='utf-8'))
AS_OF = d['asOf']
INK, MUTED, LINE = 'FF1F2328', 'FF657689', 'FFE3E6EA'
FILL = {'head': 'FFF3F4F6', 'hit': 'FFE3F4E8', 'miss': 'FFFBE4E4', 'void': 'FFEFEFEF', 'pending': 'FFEDE9FB', 'live': 'FFE3F4E8', 'event': 'FFE1EEFB'}
STATUS = {'hit': '说对', 'miss': '说错', 'void': '作废', 'pending': '在等结果'}
KIND = {'rule': '已接入 · 日线计算', 'event': '已接入 · 人工整理事件', 'planned': '未接入'}
MARKET = {'A': 'A股', 'HK': '港股', 'US': '美股'}
font = lambda **k: Font(name='Arial', size=k.pop('size', 10), color=k.pop('color', INK), **k)
thin = Side(style='thin', color=LINE)
md = lambda s: f"{int(s[5:7])}月{int(s[8:10])}日" if s else ''
sg = lambda v: '' if v is None else f"{'+' if v > 0 else ''}{v:.2f}%"

wb = Workbook()
wb.remove(wb.active)

def sheet(name, title, sub, head, rows, widths, freeze='C6', fills=None):
    """和原表同一版式：第 2 行标题、第 3 行说明、第 5 行表头，数据从第 6 行起"""
    ws = wb.create_sheet(name)
    ws.sheet_view.showGridLines = False
    ws['A2'] = title; ws['A2'].font = font(size=16, bold=True)
    ws['A3'] = sub; ws['A3'].font = font(color=MUTED)
    for c, h in enumerate(head, 1):
        x = ws.cell(5, c, h); x.font = font(color=MUTED, bold=True); x.fill = PatternFill('solid', fgColor=FILL['head'])
        x.alignment = Alignment(vertical='center', wrap_text=True); x.border = Border(bottom=thin, top=thin)
    ws.row_dimensions[5].height = 30
    for r, row in enumerate(rows, 6):
        for c, v in enumerate(row, 1):
            x = ws.cell(r, c, v); x.font = font(bold=(c <= 2 and isinstance(v, str) and len(v) < 24))
            x.alignment = Alignment(vertical='top', wrap_text=True, horizontal='right' if isinstance(v, (int, float)) else 'left'); x.border = Border(bottom=thin)
        if fills and fills[r - 6]:
            col, key = fills[r - 6]
            ws.cell(r, col).fill = PatternFill('solid', fgColor=FILL[key])
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = freeze
    ws.auto_filter.ref = f"A5:{get_column_letter(len(head))}{5 + len(rows)}"
    return ws

inds, anos, jus, snr = d['indicators'], d['anomalies'], d['judgments'], d['snr']
core = [i for i in inds if i['scope'] in ('宏观', '微观')]   # 宏观政策 + 微观指标；质量门槛和个人项归到「信噪比」里讲
gates = [i for i in inds if i['scope'] == '门槛与个人']
live = [i for i in core if i['kind'] != 'planned']
settled = [j for j in jus if j['status'] in ('hit', 'miss')]
hit = sum(j['status'] == 'hit' for j in jus)
bal = next(t for t in snr['tiers'] if t['tier'] == 'balanced')
pc = lambda a, b: f"{round(a / b * 100)}%" if b else ''

# ── 说明 ──
ws = wb.create_sheet('说明'); ws.sheet_view.showGridLines = False
ws.column_dimensions['A'].width = 20; ws.column_dimensions['B'].width = 118
ws['A2'] = '异动监测信息集'; ws['A2'].font = font(size=16, bold=True)
ws['A3'] = '课题核心：针对「股票行情与资讯信息繁杂，提前洞悉自选标的风险」的诉求，利用 AI 捕捉宏观政策与微观指标的异常信号，提高信噪比。'; ws['A3'].font = font(color=MUTED)
notes = [
    ('信号集', f'捕捉什么：{len(core)} 项信号，宏观 {sum(i["scope"] == "宏观" for i in core)} 项（政策与行业）、微观 {sum(i["scope"] == "微观" for i in core)} 项（量价与公司）。每项有大白话解释、三档提醒门槛和固定等级。已接入 {len(live)} 项。'),
    ('信噪比', f'怎么降噪、降了多少：{snr["stockDays"]} 个「股票 × 交易日」里，按平衡型门槛捕捉到 {bal["total"]} 条异动，其中需要马上看的 {bal["high"]} 条。同一张表里列出降噪用的规则。'),
    ('异动记录', f'实际捕捉到了什么：{len(anos)} 条，每条带当日涨跌和之后 5 日涨跌，可以回头核对。'),
    ('评测事件', f'捕捉得准不准：管家发出的 {len(jus)} 条可验证判断，用真实收盘价对答案。有结果的 {len(settled)} 条里说对 {hit} 条、说错 {len(settled) - hit} 条。'),
    ('数据范围', f'8 只自选股（A股 3、港股 2、美股 3），2025 年 {md(snr["from"])} 至 {md(AS_OF)}，真实日线（东方财富，前复权）。'),
    ('读数时注意', '样本只有 8 只股票、20 个交易日，比例只能说明流程能跑通。阈值是候选值，没有校准。事件、传导路径和复盘文字是人工整理的，没有调用大模型，来源未逐条核对。判断的幅度和期限是看过数据后选的，不能当作样本外准确率。'),
]
for r, (k, v) in enumerate(notes, 5):
    ws.cell(r, 1, k).font = font(bold=True); ws.cell(r, 2, v).font = font()
    for c in (1, 2): ws.cell(r, c).alignment = Alignment(vertical='top', wrap_text=True); ws.cell(r, c).border = Border(bottom=thin)

# ── 信号集 ──
def ev(i):
    e = i['eval']
    if not e: return ''
    if e['kind'] == 'rule': return f"触发 {e['n']} 次，之后 5 日同向再走 5% 以上 {e['cont']} 次（{pc(e['cont'], e['n'])}）" if e['n'] else '触发 0 次'
    return f"判断 {e['n']} 条：说对 {e['hit']}、说错 {e['miss']}、作废 {e['void']}、在等 {e['pending']}"
rows = [[i['id'], i['scope'], i['spec']['name'], i['intro'], i['spec']['steady'], i['spec']['balanced'], i['spec']['aggressive'], i['spec']['levels'], KIND[i['kind']] + (f"（{i['need']}）" if i['need'] else ''), ev(i)] for i in core]
sheet('信号集', '信号集 · 捕捉哪些宏观政策与微观指标的异常', f'{len(core)} 项 | 已接入 {len(live)} 项 | E—G 是三档提醒门槛，用户可按自己的风格选，也可逐项开关；H 是固定等级，不随档位变 | 回测截至 {md(AS_OF)}',
      ['ID', '宏观 / 微观', '信号', '它在看什么（大白话）', '稳健型 · 更早提醒', '平衡型 · 默认', '进取型 · 容忍波动', '异动等级', '接入状态', '回测 / 评测'],
      rows, [7, 11, 24, 54, 32, 32, 32, 40, 30, 40], 'D6', [(9, 'live' if i['kind'] == 'rule' else 'event') if i['kind'] != 'planned' else None for i in core])

# ── 信噪比 ──
ws = wb.create_sheet('信噪比'); ws.sheet_view.showGridLines = False
for col, w in zip('ABCDEFG', [30, 16, 16, 16, 16, 16, 60]): ws.column_dimensions[col].width = w
ws['A2'] = '信噪比 · 从繁杂的行情里筛出要看的'; ws['A2'].font = font(size=16, bold=True)
ws['A3'] = f'{snr["stocks"]} 只自选股，{md(snr["from"])} 至 {md(AS_OF)} 共 {snr["tradingDays"]} 个交易日 | 等级按演示持仓计算'; ws['A3'].font = font(color=MUTED)
def table(r0, head, rows, bold_col=None):
    for c, h in enumerate(head, 1):
        x = ws.cell(r0, c, h); x.font = font(color=MUTED, bold=True); x.fill = PatternFill('solid', fgColor=FILL['head']); x.alignment = Alignment(vertical='center', wrap_text=True); x.border = Border(bottom=thin, top=thin)
    for r, row in enumerate(rows, r0 + 1):
        for c, v in enumerate(row, 1):
            x = ws.cell(r, c, v); x.font = font(bold=(c == 1 or c == bold_col)); x.border = Border(bottom=thin)
            x.alignment = Alignment(vertical='top', wrap_text=True, horizontal='right' if isinstance(v, (int, float)) else 'left')
    return r0 + len(rows) + 2
ws['A5'] = '一、筛了多少'; ws['A5'].font = font(size=12, bold=True)
n0 = snr['stockDays']
r = table(6, ['一层一层筛', '数量', '相当于原始的', '', '', '', '说明'], [
    ['原始：股票 × 交易日', n0, '100%', '', '', '', '用户每天要面对的全部行情'],
    ['其中涨跌超过 2% 的', snr['moved2'], pc(snr['moved2'], n0), '', '', '', '只看涨跌幅的话，将近一半的日子都在「异动」'],
    ['捕捉到的异动（平衡型）', bal['total'], pc(bal['total'], n0), '', '', '', f'宏观 {bal["macro"]} 条 + 微观 {bal["micro"]} 条；同一只股票同一天的几项指标归并成一条；一条宏观事件可能涉及几只股票，所以比例只是量级对比'],
    ['其中需要马上看的（高）', bal['high'], pc(bal['high'], n0), '', '', '', '强度 × 仓位 × 个人偏好之后排在最前的；其余进「留意」和「轻微」'],
], 2)
ws.cell(r, 1, '二、三档门槛各捕捉多少').font = font(size=12, bold=True)
TL = {'steady': '稳健型 · 更早提醒', 'balanced': '平衡型 · 默认', 'aggressive': '进取型 · 容忍波动'}
r = table(r + 1, ['档位', '异动合计', '宏观', '微观', '高', '中 / 低', '说明'], [[TL[t['tier']], t['total'], t['macro'], t['micro'], t['high'], f"{t['mid']} / {t['low']}", {'steady': '门槛低，提醒多，适合不想漏的人', 'balanced': '默认档位', 'aggressive': '门槛高，只留大的波动'}[t['tier']]] for t in snr['tiers']], 2)
ws.cell(r, 1, '三、靠什么降噪').font = font(size=12, bold=True)
rules = [
    ['三档门槛，可逐项开关', '', '', '', '', '', '同一项指标，稳健、平衡、进取三档门槛不同；不想看的指标可以直接关掉。'],
    ['同日归并', '', '', '', '', '', '一只股票一天里触发的几项量价指标，多半在描述同一次波动，合成一条提醒。'],
    ['宏观事件走传导路径', '', '', '', '', '', '一条政策只提醒它实际传得到的自选股，并说明通过哪条途径；传不到的不提醒。'],
    ['按仓位和偏好排序', '', '', '', '', '', '提醒等级 = 信号强度 × 持仓占比 × 对这只股票的关注度 × 投资画像，仓位重的排前面。'],
    ['事后对答案', '', '', '', '', '', '有判断的异动到期用真实收盘价结算，说对说错都记一条经验，供回头调门槛时参考（目前不会自动改门槛）。'],
] + [[f"{i['id']} {i['spec']['name']}", '', '', '', '', '', i['intro'] + ('（' + i['need'] + '）' if i['need'] else '')] for i in gates]
r = table(r + 1, ['规则', '', '', '', '', '', '做法'], rules)
ws.freeze_panes = 'B5'

# ── 异动记录 ──
rows = []
for n, a in enumerate(anos, 1):
    mv = a['moves']
    rows.append([f"A{n:02d}", a['date'], a['scope'], a['signal'], a['level'], a['title'], '、'.join(m['name'] for m in mv), '；'.join(f"{m['name']} {sg(m['p'])}" for m in mv) if len(mv) > 1 else sg(mv[0]['p']) if mv else '',
                 '；'.join(f"{m['name']} {sg(m['fwd5'])}" for m in mv if m['fwd5'] is not None) if len(mv) > 1 else (sg(mv[0]['fwd5']) if mv else ''), '规则识别' if a['auto'] else '人工整理'])
sheet('异动记录', '异动记录 · 实际捕捉到了什么', f'{len(anos)} 条，按日期排列 | 等级按演示持仓计算 | 「当日」是事件可见后第一个交易日的涨跌，「之后 5 日」是再往后 5 个交易日的累计涨跌',
      ['编号', '日期', '宏观 / 微观', '信号', '提醒等级', '异动', '涉及自选股', '当日涨跌', '之后 5 日涨跌', '识别方式'],
      rows, [7, 12, 11, 8, 10, 62, 28, 30, 30, 12], 'C6', [(5, {'高': 'miss', '中': 'pending', '低': 'void'}[a['level']]) for a in anos])

# ── 评测事件 ──
def outcome(j):
    far = f"窗口内收盘最{'高' if j['up'] else '低'} {sg(j['worst'])}" if j['worst'] is not None else '还没有收盘数据'
    if j['status'] == 'hit': return f"{md(j['settledOn'])} 收盘{'涨过' if j['up'] else '跌破'} {j['line']}（第 {j['elapsed']} 个交易日），{far}"
    if j['status'] == 'miss': return f"{j['n']} 个交易日走完没有{'涨过' if j['up'] else '跌破'}，{far}"
    if j['status'] == 'void': return f"{md(j['settledOn'])} 失效条件触发：{j['voidOn']['text'] if j['voidOn'] else ''}"
    return f"已过 {j['elapsed']} / {j['n']} 个交易日，{far}"
rows = [[f"T{n:02d}", j['issued'], j['signal'], j['event'], j['text'], outcome(j), STATUS[j['status']], (j['review'] or {}).get('why', ''), (j['review'] or {}).get('lesson', '')] for n, j in enumerate(jus, 1)]
sheet('评测事件', '评测事件 · 捕捉得准不准', f'{len(jus)} 条可验证的判断 | 有结果的 {len(settled)} 条：说对 {hit}、说错 {len(settled) - hit} | 用真实收盘价结算，截至 {md(AS_OF)} | 样本小，幅度和期限为事后选定',
      ['编号', '发出日', '信号', '事件', '管家的判断（有价格、有期限）', '实际结果', '判定', '为什么对 / 错', '记下的经验'],
      rows, [7, 12, 8, 42, 52, 50, 10, 48, 48], 'E6', [(7, j['status']) for j in jus])

wb.move_sheet('说明', -(len(wb.sheetnames) - 1))
wb.save(sys.argv[2])
print('已写入', sys.argv[2], wb.sheetnames)
