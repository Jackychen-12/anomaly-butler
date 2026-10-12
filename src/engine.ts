/** 异动识别、分级与判断结算。所有函数都只使用「当前时间刻度之前」的数据。 */
import raw from './data/prices.json'
import { AUTO_JUDGMENTS, EVENTS, STOCKS, type Category, type EventDef, type JudgmentDef, type Stock, type Vote } from './data/case'

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
export const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
export const signClass = (v: number) => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-ink')
function nextDay(d: string) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10) }

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
        id: `auto-${s.code}-${b.d}`, after: b.d, sortKey: b.d + 'T16', auto: true, cat: '价量' as Category,
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
export const PREF_LABEL: Record<Pref, string> = { focus: '盯紧', normal: '默认', mute: '少提醒' }
const PREF_FACTOR: Record<Pref, number> = { focus: 1.25, normal: 1, mute: 0.6 }
export type Level = '高' | '中' | '低'
export type Grade = { score: number; level: Level; strength: number; weightFactor: number | null; prefFactor: number }

/** 未授权时持仓权重不参与（系数 1）；授权后重仓放大、未持仓缩小。 */
export function grade(strength: number, code: string, authorized: boolean, pref: Pref, weightOverride?: number): Grade {
  const w = weightOverride ?? stockOf(code).weight
  const weightFactor = authorized ? Math.min(1.4, 0.6 + w * 4) : null
  const prefFactor = PREF_FACTOR[pref]
  const score = Math.min(100, Math.round(strength * (weightFactor ?? 1) * prefFactor))
  return { score, level: score >= 70 ? '高' : score >= 40 ? '中' : '低', strength, weightFactor, prefFactor }
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
    text: `${s.name}未来 ${def.n} 个交易日内，收盘价较 ${baseBar.c}（${fmtDate(baseBar.d)} 收盘）下跌超过 ${Math.abs(def.thr)}%`,
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
