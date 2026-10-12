/** 异动识别、分级与判断结算。所有函数都只使用「当前时间刻度之前」的数据。 */
import raw from './data/prices.json'
import { AUTO_JUDGMENTS, EVENTS, REVIEWS, SECTORS, STOCKS, type Category, type EventDef, type JudgmentDef, type Review, type Stock, type Vote } from './data/case'
import { SIGNAL_GROUPS, SIGNALS, signalOf, type SignalDef } from './data/signals'

export type Bar = { d: string; o: number; c: number; h: number; l: number; v: number; p: number }
const PRICES = (raw as { prices: Record<string, Bar[]> }).prices
export const PRICE_SOURCE = (raw as { source: string }).source

export const stockOf = (code: string): Stock => STOCKS.find((s) => s.code === code)!
/** 时间刻度之前已经收盘的日线 */
export const knownBars = (code: string, tick: string): Bar[] => PRICES[code].filter((b) => b.d < tick)
export const lastBar = (code: string, tick: string): Bar => { const k = knownBars(code, tick); return k[k.length - 1] }

// ── 格式 ────────────────────────────────────────────────
export const signed = (v: number, digits = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`
export const fmtDate = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const weekday = (d: string) => WEEK[new Date(d + 'T00:00:00Z').getUTCDay()]
export const signClass = (v: number) => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-ink')
function nextDay(d: string) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10) }

/** 最近 n 个交易日的累计涨跌幅（%） */
export function changeOver(code: string, tick: string, n: number): number {
  const k = knownBars(code, tick)
  const last = k[k.length - 1], base = k[k.length - 1 - n]
  return base ? (last.c / base.c - 1) * 100 : last.p
}
export type SectorRow = { sector: string; codes: string[]; change: number; weight: number; impact: number }
/** 按板块汇总自选股：板块涨跌取成员的简单平均；weight 是用户在该板块的仓位，impact 是它对总资产的影响（百分点） */
export function sectorRows(tick: string, n: number, holdings: Record<string, number>): SectorRow[] {
  return SECTORS.map((sector) => {
    const members = STOCKS.filter((s) => s.sector === sector)
    const ch = members.map((s) => ({ code: s.code, c: changeOver(s.code, tick, n), w: holdings[s.code] ?? 0 }))
    return { sector, codes: members.map((s) => s.code), change: ch.reduce((a, x) => a + x.c, 0) / ch.length, weight: ch.reduce((a, x) => a + x.w, 0), impact: ch.reduce((a, x) => a + x.w * x.c, 0) }
  })
}

// ── 异动 ────────────────────────────────────────────────
export type Anomaly = Omit<EventDef, 'tick'> & { tick?: string; after?: string; auto: boolean; sortKey: string }

const AUTO_FROM = '2025-03-20'
const AUTO_PCT = 7 // 单日涨跌幅绝对值达到 7% 记为价量异动

function autoAnomalies(): Anomaly[] {
  const out: Anomaly[] = []
  for (const s of STOCKS) {
    const bars = PRICES[s.code]
    bars.forEach((b, i) => {
      if (b.d < AUTO_FROM || Math.abs(b.p) < AUTO_PCT) return
      const prev = bars.slice(Math.max(0, i - 20), i)
      const avgVol = prev.reduce((a, x) => a + x.v, 0) / Math.max(1, prev.length)
      const volRatio = avgVol ? b.v / avgVol : 1
      const down = b.p < 0
      const jd = AUTO_JUDGMENTS[`${s.code}|${b.d}`]
      out.push({
        id: `auto-${s.code}-${b.d}`, signal: down ? (volRatio >= 2 ? 'price-drop-vol' : 'price-drop') : 'price-surge', after: b.d, sortKey: b.d + 'T16', auto: true, cat: '价量' as Category,
        when: `${fmtDate(b.d)} 收盘`, tone: down ? 'risk' : 'relief',
        title: `${s.name}单日${down ? '下跌' : '上涨'} ${Math.abs(b.p).toFixed(2)}%${volRatio >= 2 ? '，成交放量' : ''}`,
        strength: Math.min(100, Math.round(Math.abs(b.p) * 6)),
        hits: [s.code],
        chain: [{ label: '指标', text: `收盘 ${b.c}，涨跌幅 ${signed(b.p)}%；成交量为近 20 日均量的 ${volRatio.toFixed(1)} 倍` }],
        evidence: [{ label: '触发规则', text: `单日涨跌幅绝对值达到 ${AUTO_PCT}% 即记为价量异动，强度随幅度升高。`, source: '管家规则 · 由日线行情计算' }],
        judgments: jd ? [{ ...jd, code: s.code }] : [],
      })
    })
  }
  return out
}

const ALL: Anomaly[] = [
  ...EVENTS.map((e) => ({ ...e, auto: false, sortKey: e.tick + 'T08' })),
  ...autoAnomalies(),
].sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1))

const visible = (a: Anomaly, tick: string) => (a.tick ? a.tick <= tick : a.after! < tick)
/** 当前时刻已经出现的异动，新的在前 */
export const anomaliesAt = (tick: string): Anomaly[] => ALL.filter((a) => visible(a, tick))
export const anomaliesOf = (code: string, tick: string): Anomaly[] => anomaliesAt(tick).filter((a) => a.hits.includes(code))
/** 这条异动是不是在当前这一格才出现的 */
export const isFresh = (a: Anomaly, tick: string, prevTick: string | undefined) => visible(a, tick) && (!prevTick || !visible(a, prevTick))

// ── 分级：信号强度 × 持仓权重 × 用户偏好 ─────────────────
export type Pref = 'focus' | 'normal' | 'mute'
export const PREF_LABEL: Record<Pref, string> = { focus: '多提醒我', normal: '正常', mute: '少提醒我' }
const PREF_FACTOR: Record<Pref, number> = { focus: 1.25, normal: 1, mute: 0.6 }
export type Level = '高' | '中' | '低'
export type Grade = { score: number; level: Level; strength: number; weightFactor: number | null; prefFactor: number; styleFactor: number }

/**
 * weight 传 null 表示用户还没补充持仓，此时持仓不参与（系数 1）；补充后重仓放大、未持仓缩小。
 * style 是按用户投资风格得出的系数（见 profile.ts），没设画像时为 1。
 */
export function grade(strength: number, weight: number | null, pref: Pref, style = 1): Grade {
  const weightFactor = weight == null ? null : Math.min(1.4, 0.6 + weight * 4)
  const prefFactor = PREF_FACTOR[pref]
  const score = Math.min(100, Math.round(strength * (weightFactor ?? 1) * prefFactor * style))
  return { score, level: score >= 70 ? '高' : score >= 40 ? '中' : '低', strength, weightFactor, prefFactor, styleFactor: style }
}
/** 等级的一句话原因，给第一次用的人看 */
export function gradeReason(g: Grade): string {
  const parts = [g.strength >= 70 ? '事件影响大' : g.strength >= 40 ? '事件影响中等' : '事件影响小']
  if (g.weightFactor != null) parts.push(g.weightFactor > 1.05 ? '你的仓位重' : g.weightFactor < 0.95 ? '你的仓位轻或没有持仓' : '你的仓位适中')
  if (g.prefFactor > 1) parts.push('你要求多提醒')
  if (g.prefFactor < 1) parts.push('你要求少提醒')
  if (g.styleFactor > 1) parts.push('符合你的短线风格')
  if (g.styleFactor < 1) parts.push('你是长线，短期波动少提醒')
  return parts.join('，')
}

// ── 判断与结算 ──────────────────────────────────────────
export type Status = 'pending' | 'hit' | 'miss' | 'void'
export type Judgment = JudgmentDef & {
  anomaly: Anomaly
  issued: string
  base: number
  baseDate: string
  line: number
  status: Status
  /** 结算日（命中日 / 窗口最后一日 / 失效触发日） */
  settledOn?: string
  /** 窗口内已走过的交易日数 */
  elapsed: number
  /** 窗口内已出现的最低收盘相对基准的涨跌幅 */
  worst: number | null
  /** 窗口内最新收盘相对基准的涨跌幅 */
  latest: number | null
  dueDate?: string
  text: string
  /** 事后复盘；未结算或与实际结果对不上时为空 */
  review?: Review
}

function settle(def: JudgmentDef, a: Anomaly, tick: string): Judgment {
  const issued = a.tick ?? nextDay(a.after!)
  const all = PRICES[def.code]
  const before = all.filter((b) => b.d < issued)
  const baseBar = before[before.length - 1]
  const line = baseBar.c * (1 + def.thr / 100)
  const window = all.filter((b) => b.d >= issued).slice(0, def.n)
  const seen = window.filter((b) => b.d < tick)
  const voidTick = def.voidOn && def.voidOn.tick <= tick ? def.voidOn.tick : undefined

  let status: Status = 'pending'
  let settledOn: string | undefined
  const counted: Bar[] = []
  for (const b of seen) {
    if (voidTick && b.d >= voidTick) break
    counted.push(b)
    if (b.c <= line) { status = 'hit'; settledOn = b.d; break }
  }
  if (status === 'pending' && voidTick) { status = 'void'; settledOn = voidTick }
  if (status === 'pending' && seen.length === def.n) { status = 'miss'; settledOn = seen[seen.length - 1].d }

  const pct = (c: number) => (c / baseBar.c - 1) * 100
  const s = stockOf(def.code)
  return {
    ...def, anomaly: a, issued, base: baseBar.c, baseDate: baseBar.d, line, status, settledOn,
    elapsed: counted.length,
    worst: counted.length ? Math.min(...counted.map((b) => pct(b.c))) : null,
    latest: counted.length ? pct(counted[counted.length - 1].c) : null,
    dueDate: window.length === def.n ? window[def.n - 1].d : undefined,
    text: `${s.name} ${def.n} 个交易日内会跌破 ${line.toFixed(2)}（比 ${fmtDate(baseBar.d)} 收盘价 ${baseBar.c} 低 ${Math.abs(def.thr)}%）`,
    review: REVIEWS[def.id]?.expect === status ? REVIEWS[def.id] : undefined,
  }
}

/** 当前时刻已发出的全部判断，新的在前 */
export const judgmentsAt = (tick: string): Judgment[] =>
  anomaliesAt(tick).flatMap((a) => a.judgments.map((j) => settle(j, a, tick)))
export const judgmentsOf = (code: string, tick: string) => judgmentsAt(tick).filter((j) => j.code === code)

export type Score = { butler: { hit: number; miss: number; void: number }; me: { right: number; wrong: number }; split: { butler: number; me: number } }
export function score(js: Judgment[], votes: Record<string, Vote>): Score {
  const s: Score = { butler: { hit: 0, miss: 0, void: 0 }, me: { right: 0, wrong: 0 }, split: { butler: 0, me: 0 } }
  for (const j of js) {
    if (j.status === 'pending') continue
    if (j.status === 'void') { s.butler.void++; continue }
    s.butler[j.status]++
    const v = votes[j.id]
    if (v === 'agree' || v === 'disagree') {
      const right = (v === 'agree') === (j.status === 'hit')
      s.me[right ? 'right' : 'wrong']++
      if (v === 'disagree') s.split[right ? 'me' : 'butler']++
    }
  }
  return s
}
/** 我的表态是否正确；未表态或未结算返回 null */
export function myResult(j: Judgment, v: Vote | undefined): boolean | null {
  if (j.status !== 'hit' && j.status !== 'miss') return null
  if (v !== 'agree' && v !== 'disagree') return null
  return (v === 'agree') === (j.status === 'hit')
}

// ── 事后：已发生异动的解读 ───────────────────────────────
/**
 * 解释一条价量异动：往前几天内、在它发生之前就已出现、方向一致（跌对应利空，涨对应好消息）、
 * 且命中同一只股票的宏观或公司事件。
 */
export function relatedEvents(a: Anomaly, tick: string): Anomaly[] {
  if (!a.auto) return []
  const from = shiftDay(a.after!, -5)
  return anomaliesAt(tick).filter((e) => !e.auto && e.tone === a.tone && e.tick! >= from && e.tick! <= a.after! && e.hits.some((c) => a.hits.includes(c)))
}
/** 同一时间段内影响全市场的大事件（没有直接点名这只股票），作为次一级的解释。 */
export function marketEvents(a: Anomaly, tick: string): Anomaly[] {
  if (!a.auto) return []
  const from = shiftDay(a.after!, -5)
  return anomaliesAt(tick).filter((e) => !e.auto && e.cat === '宏观政策' && e.tone === a.tone && e.strength >= 55 && e.tick! >= from && e.tick! <= a.after! && !e.hits.some((c) => a.hits.includes(c)))
}
/** 一句话解释一条价量异动的原因 */
export function whyLine(a: Anomaly, tick: string): string {
  const direct = relatedEvents(a, tick)
  if (direct.length) return `很可能是因为：${direct.map((e) => e.title).join('；')}。`
  const market = marketEvents(a, tick)
  if (market.length) return `没有直接针对它的事件，但同期有影响整个市场的大事：${market.map((e) => e.title).join('；')}。`
  return '没有找到对应的事件，暂时当作一次性波动。'
}
function shiftDay(d: string, n: number) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }

// ── 信号库评测 ──────────────────────────────────────────
const FWD = 5, CONT = -5
export type RuleEval = { kind: 'rule'; n: number; cont: number; avg5: number; samples: { code: string; d: string; p: number; fwdMin: number; fwd5: number }[] }
export type EventEval = { kind: 'event'; n: number; hit: number; miss: number; void: number; pending: number }
export type SignalEval = RuleEval | EventEval | null

const RULE: Record<string, (b: Bar, volRatio: number) => boolean> = {
  'price-drop': (b) => b.p <= -AUTO_PCT,
  'price-drop-vol': (b, r) => b.p <= -AUTO_PCT && r >= 2,
  'price-surge': (b) => b.p >= AUTO_PCT,
}
/** 规则类信号：在全部自选股的日线上回测；事件类信号：统计已发出的判断结果。都只用 tick 之前的数据。 */
export function evaluateSignal(id: string, tick: string): SignalEval {
  const def = signalOf(id)
  // 规划中的信号没有数据；只提醒不判断的事件类信号没有可对答案的样本
  if (!def || def.kind === 'planned' || (def.kind === 'event' && !def.judges)) return null
  if (def.kind === 'rule') {
    const samples: RuleEval['samples'] = []
    for (const s of STOCKS) {
      const bars = knownBars(s.code, tick)
      bars.forEach((b, i) => {
        if (i + FWD >= bars.length) return // 后面不足 5 个交易日的不计入
        const prev = bars.slice(Math.max(0, i - 20), i)
        const avgVol = prev.reduce((a, x) => a + x.v, 0) / Math.max(1, prev.length)
        if (!RULE[id](b, avgVol ? b.v / avgVol : 1)) return
        const fwd = bars.slice(i + 1, i + 1 + FWD)
        samples.push({ code: s.code, d: b.d, p: b.p, fwdMin: (Math.min(...fwd.map((x) => x.c)) / b.c - 1) * 100, fwd5: (fwd[FWD - 1].c / b.c - 1) * 100 })
      })
    }
    samples.sort((a, b) => (a.d < b.d ? 1 : -1))
    return { kind: 'rule', n: samples.length, cont: samples.filter((x) => x.fwdMin <= CONT).length, avg5: samples.length ? samples.reduce((a, x) => a + x.fwd5, 0) / samples.length : 0, samples }
  }
  const js = judgmentsAt(tick).filter((j) => j.anomaly.signal === id)
  const count = (st: Status) => js.filter((j) => j.status === st).length
  return { kind: 'event', n: js.length, hit: count('hit'), miss: count('miss'), void: count('void'), pending: count('pending') }
}
/** 判断卡上的「同类信号过去怎么样」一句话 */
export function evalLine(id: string, tick: string): string {
  const e = evaluateSignal(id, tick)
  if (!e) return '暂无评测'
  if (e.kind === 'rule') return e.n ? `回测触发 ${e.n} 次，其中 ${e.cont} 次之后 5 日内又跌了 5% 以上` : '回测区间内没有触发'
  return e.n ? `到目前共 ${e.n} 条判断：说对 ${e.hit}，说错 ${e.miss}${e.void ? `，作废 ${e.void}` : ''}${e.pending ? `，在等结果 ${e.pending}` : ''}` : '还没有判断样本'
}

/** 最近 days 天内有结果的判断，新的在前 */
export function recentlySettled(tick: string, days = 7): Judgment[] {
  const from = shiftDay(tick, -days)
  return judgmentsAt(tick).filter((j) => j.status !== 'pending' && j.settledOn! >= from).sort((a, b) => (a.settledOn! < b.settledOn! ? 1 : -1))
}

/** 到当前时刻为止，各类信号的判断结果汇总（复盘页用） */
export function reviewBySignal(tick: string): { def: SignalDef; hit: number; miss: number; void: number }[] {
  const js = judgmentsAt(tick).filter((j) => j.status !== 'pending')
  return SIGNALS.map((def) => {
    const mine = js.filter((j) => j.anomaly.signal === def.id)
    const count = (st: Status) => mine.filter((j) => j.status === st).length
    return { def, hit: count('hit'), miss: count('miss'), void: count('void') }
  }).filter((r) => r.hit + r.miss + r.void > 0)
}

const MKT: Record<string, string> = { A: 'A股', HK: '港股', US: '美股' }
/** 信号库导出为 Markdown，作为课题交付物 */
export function signalsMarkdown(tick: string): string {
  const lines = ['# 异动监测信息集', '', '每类信号分为「内容」和「评测」两部分。内容说明信号看什么、数据从哪来、怎样触发；评测说明它在历史数据上表现如何。', '',
    `评测口径（截至 ${fmtDate(tick)}）：规则类信号在 ${STOCKS.length} 只自选股 2025 年以来的真实日线上回测，「续跌」指触发后 ${FWD} 个交易日内最低收盘价较触发日再跌 ${Math.abs(CONT)}% 以上；事件类信号统计已发出的判断结果。样本量小，仅供参考。`, '']
  for (const g of SIGNAL_GROUPS) {
    lines.push(`## ${g}`, '')
    for (const s of SIGNALS.filter((x) => x.group === g)) {
      const e = evaluateSignal(s.id, tick)
      lines.push(`### ${s.name}`, '', `- 状态：${s.kind === 'planned' ? '规划中' : s.kind === 'rule' ? '已接入（规则自动识别）' : '已接入（人工整理事件）'}`,
        `- 定义：${s.define}`, `- 数据来源：${s.source}`, `- 触发规则：${s.rule}`, `- 适用市场：${s.markets.map((m) => MKT[m]).join('、')}`,
        `- 是否出判断：${s.judges ? '是' : '否'}`)
      if (e?.kind === 'rule') lines.push(`- 评测：触发 ${e.n} 次；续跌 ${e.cont} 次（${e.n ? Math.round((e.cont / e.n) * 100) : 0}%）；触发后 5 日平均涨跌 ${signed(e.avg5)}%`)
      else if (e?.kind === 'event') lines.push(`- 评测：判断 ${e.n} 条；说对 ${e.hit}，说错 ${e.miss}，作废 ${e.void}，在等结果 ${e.pending}`)
      else lines.push(s.kind === 'planned' ? '- 评测：数据接入后才有' : '- 评测：只提醒、不出判断，没有可对答案的样本')
      lines.push('')
    }
  }
  return lines.join('\n')
}
