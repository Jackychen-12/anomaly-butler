/** 把信号库、异动记录和判断的对答案结果导出成 JSON，供 scripts/build_dataset_xlsx.py 生成 Excel。用法：npx tsx scripts/export-dataset.ts > dataset.json */
import { TICKS } from '../src/data/case'
import { POLICIES, SIGNALS, scopeOf } from '../src/data/signals'
import { anomaliesAt, evaluateSignal, judgmentsAt, knownBars, pathsOf, stockOf } from '../src/engine'

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

const anomalies = anomaliesAt(asOf).map((a) => ({
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

console.log(JSON.stringify({ asOf, indicators, policies: POLICIES, anomalies, judgments }))
