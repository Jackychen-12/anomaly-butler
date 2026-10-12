/**
 * 把一天的异动归并成「几件事」：行情指标和跨市场的异动，如果能对上一个原因（政策或公司事件），就挂在那件事下面，
 * 不再各算一条。全站的数字（导航角标、首页标题、对话栏开场白）都从这里出，保证对得上。
 * 同时在这里限制「高」的数量：每天最多 budget 件事可以标成高，其余降到中。
 */
import { STOCKS, STORY, TICKS } from './data/case'
import { scopeOf } from './data/signals'
import { anomaliesAt, changeOver, isFresh, relatedEvents, type Anomaly, type Grade, type Level } from './engine'

/** 一条自动识别的异动对应的原因：直接点名同一只股票的事件里最新的一件 */
export function causeOf(a: Anomaly, tick: string): Anomaly | null {
  const rel = relatedEvents(a, tick)
  return rel.length ? [...rel].sort((x, y) => (x.tick! < y.tick! ? 1 : -1))[0] : null
}
/** 一件事属于哪条线：同一条线上的事件（比如关税的几次升级）算一件事 */
export const storyOf = (e: Anomaly) => STORY[e.id] ?? e.id
/** 这条异动是哪一天早上第一次出现的 */
const bucketOf = (a: Anomaly) => a.tick ?? TICKS.find((t) => t > a.after!) ?? 'later'

/** 哪些异动可以标成「高」：每个早上按「事」排序，只有最重要的 budget 件事可以 */
export function highAllowed(tick: string, scoreOf: (a: Anomaly, code: string) => number, budget: number): Set<string> {
  const all = anomaliesAt(tick)
  const units = new Map<string, { bucket: string; score: number; ids: string[] }>()
  for (const a of all) {
    const cause = a.auto ? causeOf(a, tick) : null
    // 原因是当天新出现的才并进去；原因是前几天的事，按反应出现的这一天算
    const key = `${bucketOf(a)}|${storyOf(cause ?? a)}`
    const u = units.get(key) ?? { bucket: bucketOf(a), score: 0, ids: [] }
    u.score = Math.max(u.score, ...a.hits.map((c) => scoreOf(a, c))); u.ids.push(a.id)
    units.set(key, u)
  }
  const ok = new Set<string>()
  for (const b of new Set([...units.values()].map((u) => u.bucket)))
    [...units.values()].filter((u) => u.bucket === b).sort((x, y) => y.score - x.score).slice(0, budget).forEach((u) => u.ids.forEach((id) => ok.add(id)))
  return ok
}

export type Thing = {
  id: string
  scope: '宏观' | '微观'
  /** 原因：一件政策或公司事件。没有找到原因的行情异动归在一起，cause 为空 */
  cause: Anomaly | null
  /** 原因是今天新出现的，还是前几天的事今天又有了反应 */
  fresh: boolean
  /** 同一条线上更早的事件，新的在前 */
  history: Anomaly[]
  /** 挂在这件事下面的、今天新出现的行情指标和跨市场异动 */
  reactions: Anomaly[]
  level: Level
  score: number
}
export type Digest = {
  things: Thing[]
  /** 需要看的：等级是高或中的 */
  need: Thing[]
  /** 今天一共捕捉到多少条信号（归并前） */
  signals: number
  /** 自选里上一个交易日涨跌超过 2% 的有几只 */
  moved: number
  stocks: number
  /** 近几天出现、今天没有新反应的宏观事件 */
  earlier: Anomaly[]
}

export function digest(tick: string, prevTick: string | undefined, gradeOf: (a: Anomaly, code: string) => Grade): Digest {
  const all = anomaliesAt(tick)
  const fresh = all.filter((a) => isFresh(a, tick, prevTick))
  const top = (a: Anomaly) => a.hits.map((c) => gradeOf(a, c)).sort((x, y) => y.score - x.score)[0]
  const map = new Map<string, Thing>()
  const put = (cause: Anomaly | null, key: string, isFreshCause: boolean) => {
    if (!map.has(key)) map.set(key, { id: key, cause, scope: cause ? scopeOf(cause.signal) : '微观', fresh: isFreshCause, history: [], reactions: [], level: '低', score: 0 })
    return map.get(key)!
  }
  // 一条线上最新的那件事作为这件事的「原因」，更早的进到来龙去脉里
  const week = new Date(tick + 'T00:00:00Z'); week.setUTCDate(week.getUTCDate() - 8)
  const line = (e: Anomaly) => all.filter((x) => !x.auto && storyOf(x) === storyOf(e) && x.tick! >= week.toISOString().slice(0, 10)).sort((x, y) => (x.tick! === y.tick! ? y.strength - x.strength : x.tick! < y.tick! ? 1 : -1))
  const add = (e: Anomaly) => { const [lead, ...rest] = line(e).length ? line(e) : [e]; const t = put(lead, storyOf(e), fresh.includes(lead)); t.history = rest; return t }
  for (const a of fresh.filter((x) => !x.auto)) add(a)
  for (const a of fresh.filter((x) => x.auto)) {
    const cause = causeOf(a, tick)
    ;(cause ? add(cause) : put(null, 'unexplained', false)).reactions.push(a)
  }
  const rank: Record<Level, number> = { 高: 2, 中: 1, 低: 0 }
  for (const t of map.values()) {
    const gs = [...(t.cause && t.fresh ? [top(t.cause)] : []), ...t.reactions.map(top)]
    if (!gs.length && t.cause) gs.push(top(t.cause))
    t.score = Math.max(0, ...gs.map((g) => g.score))
    t.level = gs.map((g) => g.level).sort((x, y) => rank[y] - rank[x])[0] ?? '低'
    t.reactions.sort((x, y) => top(y).score - top(x).score)
  }
  const things = [...map.values()].sort((x, y) => rank[y.level] - rank[x.level] || y.score - x.score)
  const since = new Date(tick + 'T00:00:00Z'); since.setUTCDate(since.getUTCDate() - 4)
  const earlier = all.filter((a) => !a.auto && scopeOf(a.signal) === '宏观' && !map.has(storyOf(a)) && (a.tick ?? '') >= since.toISOString().slice(0, 10))
  return { things, need: things.filter((t) => t.level !== '低'), signals: fresh.length, moved: STOCKS.filter((s) => Math.abs(changeOver(s.code, tick, 1)) >= 2).length, stocks: STOCKS.length, earlier }
}
