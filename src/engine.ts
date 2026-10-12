/** 异动识别、分级与判断结算。所有函数都只使用「当前时间刻度之前」的数据。 */
import raw from './data/prices.json'
import { AUTO_JUDGMENTS, CROSS, EVENTS, REVIEWS, SECTORS, STOCKS, type Category, type EventDef, type JudgmentDef, type Review, type Stock, type Vote } from './data/case'
import { GROUP_LABEL, SIGNAL_SECTIONS, SIGNALS, signalOf, TIER_LABEL, type SignalDef, type Tier } from './data/signals'

/** 日线。t 是换手率（%），部分股票可能没取到 */
export type Bar = { d: string; o: number; c: number; h: number; l: number; v: number; p: number; t?: number }
const PRICES = (raw as { prices: Record<string, Bar[]> }).prices
export const PRICE_SOURCE = (raw as { source: string }).source
/** 行情里有没有取到换手率。没取到时「换手率异常」这个信号不会触发 */
export const HAS_TURNOVER = Object.values(PRICES).some((bars) => bars.some((b) => b.t != null))

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

// ── 规则：每项指标按哪一档提醒，用户可以在信号库里逐项切换 ─────
export type Rules = {
  /** 默认档位：没单独设过的指标都用它 */
  base: Tier
  /** 逐项指定的档位。key 是指标编号 */
  tiers: Record<string, Tier>
  /** 用户关掉的指标 */
  off: string[]
}
export const DEFAULT_RULES: Rules = { base: 'balanced', tiers: {}, off: [] }
let RULES: Rules = DEFAULT_RULES
export const tierOf = (id: string, r: Rules = RULES): Tier => r.tiers?.[id] ?? r.base ?? 'balanced'

type SLevel = 'S1' | 'S2' | 'S3'
type Hit = { id: string; label: string; level: SLevel; strength: number; detail: string }
const STRENGTH: Record<SLevel, number> = { S1: 35, S2: 62, S3: 90 }
const median = (xs: number[]) => { const v = [...xs].sort((x, y) => x - y); const m = v.length >> 1; return v.length ? (v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) : 0 }
/** RVOL20（日终口径）：当天成交量 ÷ 此前 20 个交易日成交量的中位数。不足 20 日返回 null */
export const rvol20 = (bars: Bar[], i: number) => { if (i < 20) return null; const base = median(bars.slice(i - 20, i).map((b) => b.v)); return base ? bars[i].v / base : null }
const ma = (bars: Bar[], i: number, n: number) => (i + 1 >= n ? bars.slice(i + 1 - n, i + 1).reduce((x, b) => x + b.c, 0) / n : null)
/** ATR14（Wilder 平滑），算到第 i 根为止 */
function atr14(bars: Bar[], i: number): number | null {
  if (i < 14) return null
  const tr = (k: number) => Math.max(bars[k].h - bars[k].l, Math.abs(bars[k].h - bars[k - 1].c), Math.abs(bars[k].l - bars[k - 1].c))
  let atr = 0
  for (let k = 1; k <= 14; k++) atr += tr(k) / 14
  for (let k = 15; k <= i; k++) atr = (atr * 13 + tr(k)) / 14
  return atr
}
/** 三档门槛：稳健 / 平衡 / 进取 */
const pick = <T,>(t: Tier, steady: T, balanced: T, aggressive: T) => (t === 'steady' ? steady : t === 'aggressive' ? aggressive : balanced)

/**
 * 某只股票某一天触发了哪些量价指标。只做日线算得出的五项（P02 量比、P05 回撤、P06 技术结构、P10 量价组合、P11 跳空）；
 * 是否触发按该指标所选档位的门槛，等级（S1–S3）按表里的固定规则，不随档位变。
 */
function indicators(bars: Bar[], i: number, r: Rules): Hit[] {
  const b = bars[i], out: Hit[] = []
  const on = (id: string) => !r.off.includes(id)
  const add = (id: string, label: string, level: SLevel, detail: string) => out.push({ id, label, level, strength: STRENGTH[level], detail })
  const rv = rvol20(bars, i)

  // P10 量价组合：日收益 × RVOL20。上涨也是异动，但只记 S1、不写利空
  if (rv != null && on('P10')) {
    const [x, y] = pick(tierOf('P10', r), [2, 1.5], [3, 2], [5, 3])
    if (b.p <= -x && rv >= y) add('P10', `放量下跌 ${Math.abs(b.p).toFixed(2)}% · 量比 ${rv.toFixed(1)}`, b.p <= -8 && rv >= 4 ? 'S3' : b.p <= -3 && rv >= 2 ? 'S2' : 'S1', `日收益不高于 −${x}% 且 RVOL20 不低于 ${y}`)
    else if (b.p >= x && rv >= y) add('P10', `放量上涨 ${b.p.toFixed(2)}% · 量比 ${rv.toFixed(1)}`, 'S1', `日收益不低于 +${x}% 且 RVOL20 不低于 ${y}（正向活跃，不写利空）`)
  }
  // P02 量比：已经并进 P10 的不重复报
  if (rv != null && on('P02') && !out.some((h) => h.id === 'P10')) {
    const y = pick(tierOf('P02', r), 1.5, 2, 3)
    if (rv >= y) add('P02', `量比 ${rv.toFixed(1)}`, 'S1', `RVOL20 不低于 ${y}（活跃度，方向另看价格）`)
  }
  // P05 回撤：较近 20 日最高收盘价的回撤。只在回撤创新低那天报，避免天天重复
  if (i >= 19 && on('P05')) {
    const win = bars.slice(i - 19, i + 1).map((k) => k.c)
    const dd = (b.c / Math.max(...win) - 1) * 100, x = pick(tierOf('P05', r), 8, 12, 18)
    if (dd <= -x && b.c <= Math.min(...win)) add('P05', `20 日回撤 ${Math.abs(dd).toFixed(1)}%`, dd <= -12 ? 'S2' : 'S1', `较 20 日最高收盘价回撤达到 ${x}%`)
  }
  // P06 技术结构：收盘跌破 MA20
  if (i >= 22 && on('P06')) {
    const below = (k: number, pct: number) => { const m = ma(bars, k, 20); return m != null && bars[k].c < m * (1 - pct / 100) }
    const t = tierOf('P06', r)
    const hit = t === 'steady' ? below(i, 1) && !below(i - 1, 1)
      : t === 'balanced' ? below(i, 1) && below(i - 1, 1) && !below(i - 2, 1) && (rv ?? 0) >= 1.5
      : below(i, 2) && below(i - 1, 2) && below(i - 2, 2) && !below(i - 3, 2) && (rv ?? 0) >= 2
    if (hit) add('P06', '跌破 20 日线', below(i - 1, 1) && (rv ?? 0) >= 1.5 ? 'S2' : 'S1', pick(t, '首次收盘跌破 MA20 超过 1%', '连续 2 日低于 MA20 至少 1%，且第二日 RVOL20 不低于 1.5', '连续 3 日低于 MA20 至少 2%，且第三日 RVOL20 不低于 2'))
  }
  // P11 开盘跳空：缺口 ÷ 昨日 ATR14
  const atr = i > 0 ? atr14(bars, i - 1) : null
  if (atr && on('P11')) {
    const gap = (b.o / bars[i - 1].c - 1) * 100, g = Math.abs(b.o - bars[i - 1].c) / atr
    const [k, x] = pick(tierOf('P11', r), [1, 1], [1.5, 2], [2, 3])
    if (g >= k && Math.abs(gap) >= x) add('P11', `${gap < 0 ? '向下' : '向上'}跳空 ${Math.abs(gap).toFixed(1)}%`, gap < 0 && g >= 1.5 && gap <= -2 ? 'S2' : 'S1', `开盘缺口达到昨日 ATR14 的 ${k} 倍且不小于 ${x}%`)
  }
  return out
}

// ── 异动 ────────────────────────────────────────────────
/** indicators：自动识别的异动里，当天触发了哪些指标（带固定等级） */
export type Anomaly = Omit<EventDef, 'tick'> & { tick?: string; after?: string; auto: boolean; sortKey: string; indicators?: { id: string; label: string; level: SLevel }[] }

const AUTO_FROM = '2025-03-20'

/** 每只股票每天最多一条：同一天触发的几项指标归并成一件事（它们多半在描述同一次波动），分别保留命中的指标 */
function autoAnomalies(r: Rules): Anomaly[] {
  const out: Anomaly[] = []
  for (const s of STOCKS) {
    const bars = PRICES[s.code]
    bars.forEach((b, i) => {
      if (b.d < AUTO_FROM) return
      const hits = indicators(bars, i, r)
      if (!hits.length) return
      const top = [...hits].sort((x, y) => y.strength - x.strength)[0]
      // 「大跌之后会不会续跌」的判断只在确实触发了放量下跌时才成立
      const jd = hits.some((h) => h.id === 'P10') && b.p < 0 ? AUTO_JUDGMENTS[`${s.code}|${b.d}`] : undefined
      const rv = rvol20(bars, i)
      out.push({
        id: `auto-${s.code}-${b.d}`, signal: top.id, after: b.d, sortKey: b.d + 'T16', auto: true, cat: '价量' as Category,
        when: `${fmtDate(b.d)} 收盘`, tone: b.p < 0 ? 'risk' : 'relief',
        title: `${s.name}：${hits.map((h) => h.label).join(' · ')}`,
        indicators: hits.map((h) => ({ id: h.id, label: h.label, level: h.level })),
        strength: Math.min(100, top.strength + 6 * (hits.length - 1)),
        hits: [s.code],
        chain: [{ label: '行情', text: `收盘 ${b.c}，涨跌幅 ${signed(b.p)}%${rv != null ? `，量比（RVOL20）${rv.toFixed(1)}` : ''}` }],
        evidence: hits.map((h) => ({ label: `${h.id} · ${h.level}`, text: `${h.detail}。`, source: `信号库 · ${signalOf(h.id)?.name ?? h.id}（${TIER_LABEL[tierOf(h.id, r)]}）` })),
        judgments: jd ? [{ ...jd, code: s.code }] : [],
      })
    })
  }
  return out
}

/** I03 客户与供应商传导：美股龙头（关键客户）隔夜大涨大跌，提醒自选里和它关系明确的 A 股、港股 */
function crossAnomalies(r: Rules): Anomaly[] {
  if (r.off.includes('I03')) return []
  const x = pick(tierOf('I03', r), 3, 5, 8)
  const out: Anomaly[] = []
  for (const [code, map] of Object.entries(CROSS)) {
    const s = stockOf(code)
    for (const b of PRICES[code]) {
      if (b.d < AUTO_FROM || Math.abs(b.p) < x) continue
      const down = b.p < 0
      out.push({
        id: `cross-${code}-${b.d}`, signal: 'I03', after: b.d, sortKey: b.d + 'T23', auto: true, cat: '跨市场传导' as Category,
        when: `${fmtDate(b.d)} 美股收盘`, tone: down ? 'risk' : 'relief',
        title: `${s.name}隔夜${down ? '下跌' : '上涨'} ${Math.abs(b.p).toFixed(2)}%`,
        strength: Math.min(90, Math.round(Math.abs(b.p) * 8)),
        hits: map.codes,
        chain: [{ label: '隔夜', text: `${s.name}收盘 ${b.c}，${down ? '下跌' : '上涨'} ${Math.abs(b.p).toFixed(2)}%` }, { label: '传导', text: map.via }],
        paths: [{ via: map.via, codes: map.codes }],
        evidence: [{ label: 'I03 · S1', text: `关键客户单日涨跌幅达到 ${x}%。关系是人工指定的，占比未核实。`, source: `信号库 · 供应商与客户传导（${TIER_LABEL[tierOf('I03', r)]}）` }],
        judgments: [],
      })
    }
  }
  return out
}

function build(r: Rules): Anomaly[] {
  return [
    ...EVENTS.filter((e) => !r.off.includes(e.signal)).map((e) => ({ ...e, auto: false, sortKey: e.tick + 'T08' })),
    ...autoAnomalies(r),
    ...crossAnomalies(r),
  ].sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1))
}
let ALL: Anomaly[] = build(RULES)
/** 应用用户调过的规则。规则没变时什么都不做 */
export function configure(r: Rules) {
  const next: Rules = { base: r.base ?? 'balanced', tiers: r.tiers ?? {}, off: r.off ?? [] }
  if (JSON.stringify(next) === JSON.stringify(RULES)) return
  RULES = next
  ALL = build(next)
}

const visible = (a: Anomaly, tick: string) => (a.tick ? a.tick <= tick : a.after! < tick)
/** 当前时刻已经出现的异动，新的在前 */
export const anomaliesAt = (tick: string): Anomaly[] => ALL.filter((a) => visible(a, tick))
export const anomaliesOf = (code: string, tick: string): Anomaly[] => anomaliesAt(tick).filter((a) => a.hits.includes(code))
/** 这条异动是不是在当前这一格才出现的 */
export const isFresh = (a: Anomaly, tick: string, prevTick: string | undefined) => visible(a, tick) && (!prevTick || !visible(a, prevTick))

/** 一件事的传导路径分支：途径 → 受影响的自选股。没有写明分支时，用传导链中间那一句作为唯一途径 */
export function pathsOf(a: Anomaly): { via: string; codes: string[] }[] {
  if (a.paths?.length) return a.paths
  const via = a.chain.length > 1 ? a.chain[a.chain.length > 2 ? 1 : a.chain.length - 1].text : a.chain[0].text
  return [{ via, codes: a.hits }]
}

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
  if (g.styleFactor > 1) parts.push('按你的画像上调')
  if (g.styleFactor < 1) parts.push('按你的画像下调')
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
  /** 窗口内朝判断方向走得最远的收盘涨跌幅（看跌是最低，看涨是最高） */
  worst: number | null
  /** 判断方向：true = 会涨过，false = 会跌破 */
  up: boolean
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
  const up = def.thr > 0
  const window = all.filter((b) => b.d >= issued).slice(0, def.n)
  const seen = window.filter((b) => b.d < tick)
  const voidTick = def.voidOn && def.voidOn.tick <= tick ? def.voidOn.tick : undefined

  let status: Status = 'pending'
  let settledOn: string | undefined
  const counted: Bar[] = []
  for (const b of seen) {
    if (voidTick && b.d >= voidTick) break
    counted.push(b)
    if (up ? b.c >= line : b.c <= line) { status = 'hit'; settledOn = b.d; break }
  }
  if (status === 'pending' && voidTick) { status = 'void'; settledOn = voidTick }
  if (status === 'pending' && seen.length === def.n) { status = 'miss'; settledOn = seen[seen.length - 1].d }

  const pct = (c: number) => (c / baseBar.c - 1) * 100
  const s = stockOf(def.code)
  return {
    ...def, anomaly: a, issued, base: baseBar.c, baseDate: baseBar.d, line, status, settledOn,
    elapsed: counted.length,
    worst: counted.length ? (up ? Math.max : Math.min)(...counted.map((b) => pct(b.c))) : null,
    up,
    latest: counted.length ? pct(counted[counted.length - 1].c) : null,
    dueDate: window.length === def.n ? window[def.n - 1].d : undefined,
    text: `${s.name} ${def.n} 个交易日内会${up ? '涨过' : '跌破'} ${line.toFixed(2)}（比 ${fmtDate(baseBar.d)} 收盘价 ${baseBar.c} ${up ? '高' : '低'} ${Math.abs(def.thr)}%）`,
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
export function shiftDay(d: string, n: number) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }

// ── 信号库评测 ──────────────────────────────────────────
const FWD = 5, CONT = -5
/** cont：触发后 5 日内沿信号方向又走了 5% 以上的次数。samples 里 ext 是沿信号方向走得最远的幅度 */
export type RuleEval = { kind: 'rule'; n: number; cont: number; avg5: number; samples: { code: string; d: string; p: number; ext: number; fwd5: number; ok: boolean }[] }
export type EventEval = { kind: 'event'; n: number; hit: number; miss: number; void: number; pending: number }
export type SignalEval = RuleEval | EventEval | null

/** 规则类信号：在全部自选股的日线上回测；事件类信号：统计已发出的判断结果。都只用 tick 之前的数据。rules 不传时用当前规则 */
export function evaluateSignal(id: string, tick: string, rules: Rules = RULES): SignalEval {
  const def = signalOf(id)
  if (!def || def.kind === 'planned') return null
  if (def.kind === 'rule') {
    const r = { ...rules, off: [] } // 评测不受「关掉」影响
    const samples: RuleEval['samples'] = []
    // 触发日的涨跌方向决定「延续」指的是继续跌还是继续涨（方向固定的指标用它自己的方向）
    const add = (code: string, d: string, p: number, base: number, fwd: Bar[]) => {
      const down = def.dir === 'down' || (def.dir !== 'up' && p < 0)
      const ext = ((down ? Math.min : Math.max)(...fwd.map((x) => x.c)) / base - 1) * 100
      samples.push({ code, d, p, ext, fwd5: (fwd[FWD - 1].c / base - 1) * 100, ok: down ? ext <= CONT : ext >= -CONT })
    }
    if (id === 'I03') {
      // 触发看美股龙头，结果看被它带动的 A 股、港股之后 5 个交易日
      const x = pick(tierOf('I03', r), 3, 5, 8)
      for (const [us, map] of Object.entries(CROSS)) for (const b of knownBars(us, tick)) {
        if (Math.abs(b.p) < x) continue
        for (const code of map.codes) {
          const bars = knownBars(code, tick), fwd = bars.filter((k) => k.d > b.d).slice(0, FWD), before = bars.filter((k) => k.d <= b.d)
          if (fwd.length === FWD && before.length) add(code, b.d, b.p, before[before.length - 1].c, fwd)
        }
      }
    } else {
      for (const s of STOCKS) {
        const bars = knownBars(s.code, tick)
        bars.forEach((b, i) => {
          if (i + FWD >= bars.length) return // 后面不足 5 个交易日的不计入
          if (indicators(bars, i, r).some((h) => h.id === id)) add(s.code, b.d, b.p, b.c, bars.slice(i + 1, i + 1 + FWD))
        })
      }
    }
    samples.sort((x, y) => (x.d < y.d ? 1 : -1))
    return { kind: 'rule', n: samples.length, cont: samples.filter((k) => k.ok).length, avg5: samples.length ? samples.reduce((x, k) => x + k.fwd5, 0) / samples.length : 0, samples }
  }
  const js = judgmentsAt(tick).filter((j) => j.anomaly.signal === id)
  const count = (st: Status) => js.filter((j) => j.status === st).length
  return { kind: 'event', n: js.length, hit: count('hit'), miss: count('miss'), void: count('void'), pending: count('pending') }
}

/** 判断卡上的「同类信号过去怎么样」一句话 */
export function evalLine(id: string, tick: string): string {
  const e = evaluateSignal(id, tick)
  if (!e) return '暂无评测'
  if (e.kind === 'rule') return e.n ? `回测触发 ${e.n} 次，其中 ${e.cont} 次之后 5 日内沿同一方向又走了 5% 以上` : '回测区间内没有触发'
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

/** 信号库导出为 Markdown，作为课题交付物 */
export function signalsMarkdown(tick: string): string {
  const lines = ['# 异动监测信息集', '', '共 38 项指标。每项有三档提醒门槛（稳健型更早提醒、平衡型默认、进取型容忍波动）和一套不随偏好变的固定等级（S1–S3）；可能影响不是涨跌预测。',
    '', `评测口径（截至 ${fmtDate(tick)}）：已接入的量价指标在 ${STOCKS.length} 只自选股 2025 年以来的真实日线上回测，「延续」指触发后 ${FWD} 个交易日内收盘价沿当天方向再走 ${Math.abs(CONT)}% 以上；事件类指标统计已发出的判断结果。阈值未经校准，样本量小，仅供参考。`, '']
  for (const sec of SIGNAL_SECTIONS) for (const g of sec.groups) {
    lines.push(`## ${sec.name} · ${GROUP_LABEL[g]}`, '')
    for (const s of SIGNALS.filter((x) => x.group === g)) {
      const e = evaluateSignal(s.id, tick), c = s.spec
      lines.push(`### ${s.id} ${s.name}`, '', s.intro, '', `- 接入状态：${s.kind === 'planned' ? `未接入（${s.need}）` : s.kind === 'rule' ? '已接入，用日线计算' : '已接入，人工整理事件'}`,
        `- 稳健型：${c.steady}`, `- 平衡型：${c.balanced}`, `- 进取型：${c.aggressive}`, `- 固定等级：${c.levels}`, `- 可能影响：${c.impact}`,
        `- 例子（合成）：${c.example}`, `- 反例与误报排除：${c.exclude}`, `- 计算口径：${c.formula}`, `- 当前所选档位：${TIER_LABEL[tierOf(s.id)]}`)
      if (e?.kind === 'rule') lines.push(`- 评测：触发 ${e.n} 次；延续 ${e.cont} 次（${e.n ? Math.round((e.cont / e.n) * 100) : 0}%）；触发后 5 日平均涨跌 ${signed(e.avg5)}%`)
      else if (e?.kind === 'event') lines.push(`- 评测：判断 ${e.n} 条；说对 ${e.hit}，说错 ${e.miss}，作废 ${e.void}，在等结果 ${e.pending}`)
      lines.push('')
    }
  }
  return lines.join('\n')
}
