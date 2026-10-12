/** 主动提示：管家根据记住的事（表态、偏好、持仓）和当天的数据，自己先开口。 */
import { STOCKS, type Vote } from './data/case'
import { anomaliesAt, isFresh, judgmentsAt, myResult, recentlySettled, stockOf, type Pref } from './engine'
import { unreviewed } from './review'
import type { Link } from './assistant'
import { profileSet, type Profile } from './profile'
import type { Agent, ReviewState } from './store'

export type Nudge = { id: string; text: string; action?: Link }
type Ctx = { tick: string; prevTick?: string; votes: Record<string, Vote>; prefs: Record<string, Pref>; holdings: Record<string, number>; hasHoldings: boolean; reviewState: Record<string, ReviewState>; profile: Profile; agent: Agent }

/** 每条提醒归哪一类开关管（见「我的 → 管家设置」）。没列出的（比如请你设置画像）不受开关影响 */
const KIND_OF = (id: string): keyof Agent['notify'] | 'tune' | null =>
  /^(review|settled|split|due)/.test(id) ? 'review' : /^(held-hit|over|add-holdings)/.test(id) ? 'holdings' : id.startsWith('focus') ? 'focus' : id.startsWith('tip') ? 'tune' : null

export function nudges({ tick, prevTick, votes, prefs, holdings, hasHoldings, reviewState, profile, agent }: Ctx): Nudge[] {
  const out: Nudge[] = []
  const js = judgmentsAt(tick)
  const fresh = anomaliesAt(tick).filter((a) => isFresh(a, tick, prevTick))
  const recent = recentlySettled(tick)

  // 有结果但还没复盘：对答案之后要总结经验
  const todo = unreviewed(js, reviewState)
  if (todo.length) out.push({ id: 'review', text: `${todo.length} 条判断出了结果，还没复盘。`, action: { label: '开始复盘', review: todo[0].id } })

  // 持仓股被说中了：事后应对（合成一条）
  const heldHit = recent.filter((j) => j.status === 'hit' && !j.up && (holdings[j.code] ?? 0) > 0)
  if (heldHit.length) out.push({ id: 'held-hit', text: `你持有的${[...new Set(heldHit.map((j) => stockOf(j.code).name))].join('、')}已跌破管家说的价格。`, action: { label: '看做法', review: heldHit[0].id } })
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
  // 仓位超过自己设的上限
  const over = profile.maxWeight ? Object.entries(holdings).filter(([, w]) => w * 100 > profile.maxWeight!).map(([c]) => stockOf(c).name) : []
  if (over.length) out.push({ id: 'over', text: `${over.join('、')}的仓位超过了你设的上限（${profile.maxWeight}%）。`, action: { label: '看持仓', me: 'holdings' } })
  // 还没设投资画像
  if (!profileSet(profile)) out.push({ id: 'profile', text: '告诉我你能接受多大的跌幅、一般拿多久，我按你的风格提醒。', action: { label: '设置画像', me: 'profile' } })
  // 还没填持仓，而今天有影响大的事
  if (!hasHoldings && fresh.some((a) => a.tone === 'risk' && a.strength >= 70))
    out.push({ id: 'add-holdings', text: '填上持仓，我按你的仓位排出先看哪条。', action: { label: '补充持仓', me: 'holdings' } })
  // 我和管家意见不同的次数够多时，总结一下
  const split = js.filter((j) => votes[j.id] === 'disagree' && (j.status === 'hit' || j.status === 'miss'))
  if (split.length >= 2) {
    const meRight = split.filter((j) => j.status === 'miss').length
    out.push({ id: 'split', text: `到目前为止你有 ${split.length} 次不同意管家，其中 ${meRight} 次是你对。`, action: { label: '看全部结果', page: 'review' } })
  }
  return out.filter((n) => { const k = KIND_OF(n.id); return k == null || (k === 'tune' ? agent.tune : agent.notify[k]) }).slice(0, 3)
}
