/** 全局状态：表态、提醒偏好、持仓、长期记忆（经验）、复盘对话、设置（存在浏览器本地），以及当前页面与提问对话。 */
import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { Answer } from './assistant'
import { SEED_VOTES, STOCKS, TICKS, TODAY, type Vote } from './data/case'
import { signalOf } from './data/signals'
import { judgmentsAt, PREF_LABEL, type Judgment, type Pref } from './engine'

export type Page = 'today' | 'watch' | 'review' | 'signals' | 'me'
const PAGES: Page[] = ['today', 'watch', 'review', 'signals', 'me']
export type MeTab = 'holdings' | 'memory' | 'settings'

export const VOTE_LABEL: Record<Vote, string> = { agree: '我也这么看', disagree: '我不这么看', watch: '先不表态' }
/** 管家记下的一件事。day 是记录时演示数据里的日期。 */
export type Memory = { id: string; day: string; kind: 'vote' | 'note' | 'pref' | 'plan' | 'ask' | 'holding'; text: string; code?: string }
/**
 * 一条经验（长期记忆）：从一条有结果的判断里总结出来，按信号归类，以后同类信号出现时拿出来参考。
 * by：管家总结的还是用户自己写的；at：来源判断出结果的日期；seed：演示预置。
 */
export type Lesson = { id: string; jid: string; signal: string; code: string; text: string; by: 'butler' | 'me'; at: string; seed?: boolean }
/** 复盘对话里的一句话。phase 记录它发生在判断出结果之前还是之后 */
export type Turn = { who: 'me' | 'butler'; text: string; phase: 'pending' | 'settled' }
/** 一条判断复盘后的结论：记下了管家的经验 / 不记 / 没有可记的经验、只是看过 */
export type ReviewState = 'kept' | 'skipped' | 'ack'
export type Llm = { on: boolean; url: string; key: string; model: string }
/** 一轮提问：a 为空表示还在等回答 */
export type ChatMsg = { q: string; a?: Answer; error?: string }

type Saved = {
  votes: Record<string, Vote>; prefs: Record<string, Pref>; holdings: Record<string, number>; memory: Memory[]; onboarded: boolean; llm: Llm
  lessons: Lesson[]; reviewState: Record<string, ReviewState>; dialog: Record<string, Turn[]>
}
type Store = Saved & {
  /** 演示数据里的「今天」（早上开盘前），以及上一个交易日。固定不变 */
  tick: string; prevTick: string | undefined
  page: Page; setPage: (p: Page) => void
  meTab: MeTab; openMe: (t: MeTab) => void
  code: string | null; setCode: (c: string | null) => void
  /** 和管家的对话。换页面不丢，刷新后清空 */
  chat: ChatMsg[]; setChat: Dispatch<SetStateAction<ChatMsg[]>>
  /** 打开某只股票的详情 */
  openStock: (code: string) => void
  /** 复盘页当前选中的判断 */
  reviewId: string | null; setReviewId: (id: string | null) => void
  /** 打开某条判断的复盘对话 */
  openReview: (jid: string) => void
  /** 在复盘对话里说一句话：结果出来前是「我的理由」，出来后是「我的经验」（记进长期记忆） */
  say: (j: Judgment, text: string) => void
  /** 对管家提出的经验做决定 */
  decide: (j: Judgment, d: ReviewState) => void
  forgetLesson: (id: string) => void
  /** judgmentText 用于写进记忆，让用户日后看得懂当时表态的是哪一条 */
  vote: (id: string, v: Vote, judgmentText: string, code: string) => void
  setPref: (code: string, p: Pref) => void
  setHoldings: (h: Record<string, number>, note: string) => void
  /** 用户是否补充过持仓；没有时等级不按仓位调整 */
  hasHoldings: boolean
  weightOf: (code: string) => number | null
  remember: (m: Omit<Memory, 'id' | 'day'>) => void
  forget: (id: string) => void
  setOnboarded: (v: boolean) => void
  setLlm: (l: Llm) => void
  reset: () => void
}
const Ctx = createContext<Store | null>(null)
export const useStore = () => useContext(Ctx)!

const KEY = 'anomaly-butler:v3'
/** 演示预置：三条较早的判断已经复盘过，管家的经验已记进长期记忆。只在与实际结算结果一致时预置。 */
const SEED_REVIEWED = ['j-xm-place', 'j-nv-energy', 'j-xm-su7']
function fresh(tick: string): Saved {
  const done = judgmentsAt(tick).filter((j) => SEED_REVIEWED.includes(j.id) && j.review)
  return {
    votes: SEED_VOTES, prefs: {}, holdings: {}, memory: [], onboarded: false, llm: { on: false, url: '', key: '', model: '' },
    lessons: done.map((j) => ({ id: `seed-${j.id}`, jid: j.id, signal: j.anomaly.signal, code: j.code, text: j.review!.lesson, by: 'butler' as const, at: j.settledOn!, seed: true })),
    reviewState: Object.fromEntries(done.map((j) => [j.id, 'kept' as const])), dialog: {},
  }
}
function load(tick: string): Saved {
  try { return { ...fresh(tick), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return fresh(tick) }
}
const pageFromHash = (): Page => {
  const h = location.hash.replace('#/', '') as Page
  return PAGES.includes(h) ? h : 'today'
}
/** 默认用 TODAY；网址带 ?date= 且是演示数据里的交易日时用它（汇报时换一天验证用） */
function initialTick() {
  const d = new URLSearchParams(location.search).get('date')
  return d && TICKS.includes(d) ? d : TODAY
}
const nameOf = (code: string) => STOCKS.find((s) => s.code === code)?.name ?? code

export function StoreProvider({ children }: { children: ReactNode }) {
  const tick = useMemo(initialTick, [])
  const [saved, setSaved] = useState<Saved>(() => load(tick))
  const [page, setPageState] = useState<Page>(pageFromHash)
  const [meTab, setMeTab] = useState<MeTab>('holdings')
  const [code, setCode] = useState<string | null>(null)
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [reviewId, setReviewId] = useState<string | null>(null)

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(saved)) } catch { /* 存不了就只在本次生效 */ } }, [saved])
  useEffect(() => {
    const onHash = () => setPageState(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const patch = (p: Partial<Saved>) => setSaved((s) => ({ ...s, ...p }))
  const setPage = (p: Page) => { location.hash = `#/${p}`; setPageState(p) }
  const remember: Store['remember'] = (m) => setSaved((s) => ({ ...s, memory: [{ ...m, id: `${Date.now()}-${s.memory.length}`, day: tick }, ...s.memory].slice(0, 200) }))
  const hasHoldings = Object.values(saved.holdings).some((w) => w > 0)
  const i = TICKS.indexOf(tick)

  const value: Store = {
    ...saved,
    tick, prevTick: TICKS[i - 1],
    page, setPage,
    meTab, openMe: (t) => { setMeTab(t); setPage('me') },
    code, setCode,
    chat, setChat,
    openStock: (c) => { setCode(c); setPage('watch') },
    reviewId, setReviewId,
    openReview: (jid) => { setReviewId(jid); setPage('review') },
    say: (j, text) => {
      const settled = j.status !== 'pending'
      const sig = signalOf(j.anomaly.signal)?.name ?? j.anomaly.cat
      const turns: Turn[] = settled
        ? [{ who: 'me', text, phase: 'settled' }, { who: 'butler', text: `记下了你的这条经验，放在「${sig}」下面。以后遇到同类信号，我会一起拿出来参考。`, phase: 'settled' }]
        : [{ who: 'me', text, phase: 'pending' }, { who: 'butler', text: '记下了你的理由。到对答案的时候，我会把它拿出来一起看。', phase: 'pending' }]
      setSaved((s) => ({
        ...s,
        dialog: { ...s.dialog, [j.id]: [...(s.dialog[j.id] ?? []), ...turns] },
        lessons: settled ? [{ id: `${Date.now()}`, jid: j.id, signal: j.anomaly.signal, code: j.code, text, by: 'me', at: j.settledOn! }, ...s.lessons] : s.lessons,
        // 写过自己的经验也算复盘过
        reviewState: settled && !s.reviewState[j.id] && !j.review ? { ...s.reviewState, [j.id]: 'ack' } : s.reviewState,
      }))
      if (!settled) remember({ kind: 'note', code: j.code, text: `对「${j.text}」说过理由：${text}` })
    },
    decide: (j, d) => {
      const sig = signalOf(j.anomaly.signal)?.name ?? j.anomaly.cat
      const turns: Turn[] = d === 'kept'
        ? [{ who: 'me', text: '记下来', phase: 'settled' }, { who: 'butler', text: `好，记进长期记忆了。以后再遇到「${sig}」类信号，我会先把这条拿出来参考。`, phase: 'settled' }]
        : d === 'skipped'
          ? [{ who: 'me', text: '不用记', phase: 'settled' }, { who: 'butler', text: '好，这条不记。', phase: 'settled' }]
          : [{ who: 'me', text: '知道了', phase: 'settled' }, { who: 'butler', text: '好。之后你想到什么，随时可以回来写给我。', phase: 'settled' }]
      setSaved((s) => ({
        ...s,
        reviewState: { ...s.reviewState, [j.id]: d },
        dialog: { ...s.dialog, [j.id]: [...(s.dialog[j.id] ?? []), ...turns] },
        lessons: d === 'kept' && j.review ? [{ id: `${Date.now()}`, jid: j.id, signal: j.anomaly.signal, code: j.code, text: j.review.lesson, by: 'butler', at: j.settledOn! }, ...s.lessons] : s.lessons,
      }))
    },
    forgetLesson: (id) => setSaved((s) => ({ ...s, lessons: s.lessons.filter((l) => l.id !== id) })),
    vote: (id, v, judgmentText, c) => {
      patch({ votes: { ...saved.votes, [id]: v } })
      remember({ kind: 'vote', code: c, text: `对「${judgmentText}」表态：${VOTE_LABEL[v]}` })
    },
    setPref: (c, p) => {
      patch({ prefs: { ...saved.prefs, [c]: p } })
      remember({ kind: 'pref', code: c, text: `${nameOf(c)}的提醒改为：${PREF_LABEL[p]}` })
    },
    setHoldings: (h, note) => { patch({ holdings: h }); remember({ kind: 'holding', text: note }) },
    hasHoldings,
    weightOf: (c) => (hasHoldings ? saved.holdings[c] ?? 0 : null),
    remember,
    forget: (id) => setSaved((s) => ({ ...s, memory: s.memory.filter((m) => m.id !== id) })),
    setOnboarded: (v) => patch({ onboarded: v }),
    setLlm: (l) => patch({ llm: l }),
    reset: () => setSaved(fresh(tick)),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
