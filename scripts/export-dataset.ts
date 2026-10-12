/** 把信号库、异动记录和判断的对答案结果导出成 JSON，供 scripts/build_dataset_xlsx.py 生成 Excel。用法：npx tsx scripts/export-dataset.ts > dataset.json */
import { DEMO_HOLDINGS, STOCKS, TICKS } from '../src/data/case'
import { POLICIES, SIGNALS, scopeOf } from '../src/data/signals'
import { anomaliesAt, configure, DEFAULT_RULES, evaluateSignal, grade, judgmentsAt, knownBars, pathsOf, stockOf, type Anomaly } from '../src/engine'

const asOf = TICKS[TICKS.length - 1]
const all = (code: string) => knownBars(code, '9999-12-31')
const r2 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100) / 100)
/** 这只股票在事件可见后的第一个交易日的涨跌，以及之后 5 个交易日的累计涨跌 */
function move(code: string, from: string, inclusive: boolean) {
  const bars = all(code), i = bars.findIndex((b) => (inclusive ? b.d >= from : b.d > from))
  if (i < 0) return null
  const fwd = bars[Math.min(i + 5, bars.length - 1)]
  return { name: stockOf(code).name, market: stockOf(code).market, d: bars[i].d, p: r2(bars[i].p), fwd5: i + 5 < bars.length ? r2((fwd.c / bars[i].c - 1) * 100) : null }
}

/** 按演示持仓算出的提醒等级：取涉及的自选股里最高的一档 */
const levelOf = (a: Anomaly) => a.hits.map((c) => grade(a.strength, DEMO_HOLDINGS[c] ?? 0, 'normal')).sort((x, y) => y.score - x.score)[0].level

// 信噪比：同一段时间里，原始波动有多少、三档门槛各捕捉到多少、最后需要马上看的有多少
const FROM = '2025-03-20'
const days = STOCKS.flatMap((s) => all(s.code).filter((b) => b.d >= FROM && b.d < asOf))
const tiers = (['steady', 'balanced', 'aggressive'] as const).map((t) => {
  configure({ ...DEFAULT_RULES, base: t })
  const as = anomaliesAt(asOf).filter((a) => (a.tick ?? a.after!) >= FROM)
  const lv = as.map(levelOf)
  return { tier: t, total: as.length, macro: as.filter((a) => scopeOf(a.signal) === '宏观').length, micro: as.filter((a) => scopeOf(a.signal) === '微观').length, high: lv.filter((l) => l === '高').length, mid: lv.filter((l) => l === '中').length, low: lv.filter((l) => l === '低').length }
})
configure(DEFAULT_RULES)
const snr = { from: FROM, stocks: STOCKS.length, tradingDays: new Set(days.map((b) => b.d)).size, stockDays: days.length, moved2: days.filter((b) => Math.abs(b.p) >= 2).length, moved5: days.filter((b) => Math.abs(b.p) >= 5).length, tiers }

const anomalies = anomaliesAt(asOf).map((a) => ({
  level: levelOf(a),
  id: a.id, date: a.tick ?? a.after, when: a.when, scope: scopeOf(a.signal), signal: a.signal, cat: a.cat, auto: a.auto, tone: a.tone, strength: a.strength, title: a.title,
  indicators: a.indicators ?? [], chain: a.chain, paths: pathsOf(a).map((p) => ({ via: p.via, names: p.codes.map((c) => stockOf(c).name) })),
  evidence: a.evidence, judgments: a.judgments.map((j) => j.id),
  moves: a.hits.map((c) => (a.auto && a.cat === '价量' ? move(c, a.after!, true) : move(c, a.tick ?? a.after!, !!a.tick))).filter(Boolean),
})).sort((x, y) => (x.date! < y.date! ? -1 : x.date! > y.date! ? 1 : 0))

const judgments = judgmentsAt(asOf).map((j) => ({
  id: j.id, anomaly: j.anomaly.id, event: j.anomaly.title, signal: j.anomaly.signal, when: j.anomaly.when, issued: j.issued, code: j.code, name: stockOf(j.code).name, market: stockOf(j.code).market,
  text: j.text, thr: j.thr, n: j.n, base: j.base, baseDate: j.baseDate, line: r2(j.line), up: j.up, status: j.status, settledOn: j.settledOn ?? null, elapsed: j.elapsed,
  worst: r2(j.worst), latest: r2(j.latest), dueDate: j.dueDate ?? null, voidOn: j.voidOn ?? null, invalid: j.invalid, review: j.review ?? null,
  chain: j.anomaly.chain, paths: pathsOf(j.anomaly).filter((p) => p.codes.includes(j.code)).map((p) => p.via), evidence: j.anomaly.evidence,
})).sort((x, y) => (x.issued < y.issued ? -1 : 1))

const indicators = SIGNALS.map((s) => ({ id: s.id, scope: ['质量', '用户'].includes(s.group) ? '门槛与个人' : scopeOf(s.id), intro: s.intro, kind: s.kind, need: s.need ?? '', judges: s.judges, spec: s.spec, eval: evaluateSignal(s.id, asOf) }))

console.log(JSON.stringify({ asOf, snr, indicators, policies: POLICIES, anomalies, judgments }))
