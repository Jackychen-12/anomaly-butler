/** 全局状态：回放日期、表态、提醒偏好、持仓、管家的记忆、设置。除回放日期外都存在浏览器本地。 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_TICK, SEED_VOTES, STOCKS, TICKS, type Vote } from './data/case'
import { PREF_LABEL, type Pref } from './engine'

export type Page = 'today' | 'watch' | 'review' | 'signals' | 'me'
const PAGES: Page[] = ['today', 'watch', 'review', 'signals', 'me']
export type MeTab = 'holdings' | 'memory' | 'settings'

export const VOTE_LABEL: Record<Vote, string> = { agree: '我也这么看', disagree: '我不这么看', watch: '先不表态' }
/** 管家记下的一件事。day 是记录时的回放日期。 */
export type Memory = { id: string; day: string; kind: 'vote' | 'pref' | 'plan' | 'ask' | 'holding'; text: string; code?: string }
export type Llm = { on: boolean; url: string; key: string; model: string }

type Saved = { votes: Record<string, Vote>; prefs: Record<string, Pref>; holdings: Record<string, number>; memory: Memory[]; onboarded: boolean; llm: Llm }
type Store = Saved & {
  tick: string; setTick: (t: string) => void; prevTick: string | undefined; nextTick: string | undefined
  page: Page; setPage: (p: Page) => void
  meTab: MeTab; openMe: (t: MeTab) => void
  code: string | null; setCode: (c: string | null) => void
  /** 打开某只股票的详情 */
  openStock: (code: string) => void
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

const KEY = 'anomaly-butler:v2'
const FRESH: Saved = { votes: SEED_VOTES, prefs: {}, holdings: {}, memory: [], onboarded: false, llm: { on: false, url: '', key: '', model: '' } }
function load(): Saved {
  try { return { ...FRESH, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return FRESH }
}
const pageFromHash = (): Page => {
  const h = location.hash.replace('#/', '') as Page
  return PAGES.includes(h) ? h : 'today'
}
const nameOf = (code: string) => STOCKS.find((s) => s.code === code)?.name ?? code

export function StoreProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(load, [])
  const [saved, setSaved] = useState<Saved>(initial)
  const [tick, setTick] = useState(DEFAULT_TICK)
  const [page, setPageState] = useState<Page>(pageFromHash)
  const [meTab, setMeTab] = useState<MeTab>('holdings')
  const [code, setCode] = useState<string | null>(null)

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
    tick, setTick, prevTick: TICKS[i - 1], nextTick: TICKS[i + 1],
    page, setPage,
    meTab, openMe: (t) => { setMeTab(t); setPage('me') },
    code, setCode,
    openStock: (c) => { setCode(c); setPage('watch') },
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
    reset: () => setSaved({ ...FRESH }),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
