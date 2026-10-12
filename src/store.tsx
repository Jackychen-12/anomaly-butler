/** 全局状态：时间刻度、表态、偏好、账户授权。表态与偏好存在浏览器本地。 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_TICK, SEED_VOTES, TICKS, type Vote } from './data/case'
import type { Pref } from './engine'

export type Page = 'watch' | 'verify' | 'rebalance'
type Store = {
  tick: string; setTick: (t: string) => void; prevTick: string | undefined
  page: Page; setPage: (p: Page) => void
  code: string | null; setCode: (c: string | null) => void
  votes: Record<string, Vote>; vote: (id: string, v: Vote) => void
  prefs: Record<string, Pref>; setPref: (code: string, p: Pref) => void
  authorized: boolean; setAuthorized: (a: boolean) => void
}
const Ctx = createContext<Store | null>(null)
export const useStore = () => useContext(Ctx)!

const KEY = 'anomaly-butler:v1'
function load(): { votes?: Record<string, Vote>; prefs?: Record<string, Pref>; authorized?: boolean } {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}
const pageFromHash = (): Page => {
  const h = location.hash.replace('#/', '')
  return h === 'verify' || h === 'rebalance' ? h : 'watch'
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const saved = useMemo(load, [])
  const [tick, setTick] = useState(DEFAULT_TICK)
  const [page, setPageState] = useState<Page>(pageFromHash)
  const [code, setCode] = useState<string | null>(null)
  const [votes, setVotes] = useState<Record<string, Vote>>(saved.votes ?? SEED_VOTES)
  const [prefs, setPrefs] = useState<Record<string, Pref>>(saved.prefs ?? {})
  const [authorized, setAuthorized] = useState(saved.authorized ?? false)

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ votes, prefs, authorized })) } catch { /* 存不了就只在本次生效 */ } }, [votes, prefs, authorized])
  useEffect(() => {
    const onHash = () => setPageState(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const value: Store = {
    tick, setTick, prevTick: TICKS[TICKS.indexOf(tick) - 1],
    page, setPage: (p) => { location.hash = `#/${p}`; setPageState(p) },
    code, setCode,
    votes, vote: (id, v) => setVotes((m) => ({ ...m, [id]: v })),
    prefs, setPref: (c, p) => setPrefs((m) => ({ ...m, [c]: p })),
    authorized, setAuthorized,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
