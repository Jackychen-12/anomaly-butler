/** 主动提示：管家根据记住的事（表态、偏好、持仓）和当天的数据，自己先开口。 */
import { STOCKS, type Vote } from './data/case'
import { anomaliesAt, isFresh, judgmentsAt, myResult, recentlySettled, stockOf, type Pref } from './engine'
import { unreviewed } from './review'
import type { Link } from './assistant'
import type { ReviewState } from './store'

export type Nudge = { id: string; text: string; action?: Link }
type Ctx = { tick: string; prevTick?: string; votes: Record<string, Vote>; prefs: Record<string, Pref>; holdings: Record<string, number>; hasHoldings: boolean; reviewState: Record<string, ReviewState> }

export function nudges({ tick, prevTick, votes, prefs, holdings, hasHoldings, reviewState }: Ctx): Nudge[] {
  const out: Nudge[] = []
  const js = judgmentsAt(tick)
  const fresh = anomaliesAt(tick).filter((a) => isFresh(a, tick, prevTick))
  const recent = recentlySettled(tick)

  // 有结果但还没复盘：对答案之后要总结经验
  const todo = unreviewed(js, reviewState)
  if (todo.length) out.push({ id: 'review', text: `有 ${todo.length} 条判断出了结果还没复盘。我们一起看看为什么对、为什么错，把经验记下来。`, action: { label: '开始复盘', review: todo[0].id } })

  // 持仓股被说中了：事后应对（合成一条）
  const heldHit = recent.filter((j) => j.status === 'hit' && (holdings[j.code] ?? 0) > 0)
  if (heldHit.length) out.push({ id: 'held-hit', text: `你持有的${[...new Set(heldHit.map((j) => stockOf(j.code).name))].join('、')}最近跌破了管家说的价格。可以看看接下来有哪些选择。`, action: { label: '看应对方案', me: 'holdings' } })
  // 我表过态的判断有结果了（合成一条，细节在下面的「有结果了」里）
  const mine = recent.map((j) => ({ j, r: myResult(j, votes[j.id]) })).filter((x) => x.r != null)
  if (mine.length === 1) {
    const { j, r } = mine[0]
    out.push({ id: `settled-${j.id}`, text: `你${votes[j.id] === 'agree' ? '同意' : '不同意'}的那条${stockOf(j.code).name}判断有结果了：管家${j.status === 'hit' ? '说对了' : '说错了'}，你${r ? '看对了' : '看错了'}。`, action: { label: '去复盘', page: 'review' } })
  } else if (mine.length > 1) {
    const right = mine.filter((x) => x.r).length
    out.push({ id: 'settled', text: `你表过态的判断最近有 ${mine.length} 条出了结果：你看对 ${right} 条，看错 ${mine.length - right} 条。`, action: { label: '去复盘', page: 'review' } })
  }
  // 我不同意的判断快要对答案了
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
