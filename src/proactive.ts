/** 主动提示：管家根据记住的事（表态、偏好、持仓）和当天的数据，自己先开口。 */
import { STOCKS, type Vote } from './data/case'
import { anomaliesAt, isFresh, judgmentsAt, myResult, stockOf, type Judgment, type Pref } from './engine'
import type { MeTab, Page } from './store'

export type Nudge = { id: string; text: string; action?: { label: string; page?: Page; code?: string; me?: MeTab } }
type Ctx = { tick: string; prevTick?: string; votes: Record<string, Vote>; prefs: Record<string, Pref>; holdings: Record<string, number>; hasHoldings: boolean }

/** 这一格刚有结果的判断 */
export function newlySettled(tick: string, prevTick?: string): Judgment[] {
  if (!prevTick) return []
  const before = new Map(judgmentsAt(prevTick).map((j) => [j.id, j.status]))
  return judgmentsAt(tick).filter((j) => j.status !== 'pending' && before.get(j.id) === 'pending')
}

export function nudges({ tick, prevTick, votes, prefs, holdings, hasHoldings }: Ctx): Nudge[] {
  const out: Nudge[] = []
  const js = judgmentsAt(tick)
  const fresh = anomaliesAt(tick).filter((a) => isFresh(a, tick, prevTick))

  // 持仓股被说中了：事后应对
  for (const j of newlySettled(tick, prevTick)) if (j.status === 'hit' && (holdings[j.code] ?? 0) > 0)
    out.push({ id: `held-${j.id}`, text: `${stockOf(j.code).name}占你持仓的 ${Math.round(holdings[j.code] * 100)}%，它已经跌破了管家说的价格。可以看看接下来有哪些选择。`, action: { label: '看应对方案', me: 'holdings' } })
  // 我表过态的判断有结果了（合成一条，细节在下面的「有结果了」里）
  const mine = newlySettled(tick, prevTick).map((j) => ({ j, r: myResult(j, votes[j.id]) })).filter((x) => x.r != null)
  if (mine.length === 1) {
    const { j, r } = mine[0]
    out.push({ id: `settled-${j.id}`, text: `你${votes[j.id] === 'agree' ? '同意' : '不同意'}的那条${stockOf(j.code).name}判断有结果了：管家${j.status === 'hit' ? '说对了' : '说错了'}，你${r ? '看对了' : '看错了'}。`, action: { label: '看复盘', page: 'review' } })
  } else if (mine.length > 1) {
    const right = mine.filter((x) => x.r).length
    out.push({ id: 'settled', text: `你表过态的 ${mine.length} 条判断有结果了：你看对 ${right} 条，看错 ${mine.length - right} 条。`, action: { label: '看复盘', page: 'review' } })
  }
  // 我不同意的判断明天对答案
  for (const j of js) if (j.status === 'pending' && votes[j.id] === 'disagree' && j.n - j.elapsed <= 1)
    out.push({ id: `due-${j.id}`, text: `你不同意的那条${stockOf(j.code).name}判断，还有 ${j.n - j.elapsed} 个交易日对答案。`, action: { label: '看这只股票', code: j.code } })
  // 设了「多提醒我」的股票今天有新异动
  for (const s of STOCKS) if (prefs[s.code] === 'focus' && fresh.some((a) => a.hits.includes(s.code)))
    out.push({ id: `focus-${s.code}`, text: `你让我多留意${s.name}，它今天有新的异动。`, action: { label: '去看看', code: s.code } })
  // 还没填持仓，而今天有影响大的事
  if (!hasHoldings && fresh.some((a) => a.tone === 'risk' && a.strength >= 70))
    out.push({ id: 'add-holdings', text: '今天有影响较大的事件。告诉我你持有哪些股票，我可以按你的仓位排出先看哪条。', action: { label: '补充持仓', me: 'holdings' } })
  // 我和管家意见不同的次数够多时，总结一下
  const split = js.filter((j) => votes[j.id] === 'disagree' && (j.status === 'hit' || j.status === 'miss'))
  if (split.length >= 2) {
    const meRight = split.filter((j) => j.status === 'miss').length
    out.push({ id: 'split', text: `到目前为止你有 ${split.length} 次不同意管家，其中 ${meRight} 次是你对。`, action: { label: '看全部结果', page: 'review' } })
  }
  return out.slice(0, 3)
}
