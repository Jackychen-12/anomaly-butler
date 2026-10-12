/** 全局状态：表态、提醒偏好、持仓、长期记忆（经验）、复盘对话、设置（存在浏览器本地），以及当前页面与提问对话。 */
import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { Answer } from './assistant'
import { DEMO_HOLDINGS, SEED_REASONS, SEED_VOTES, STOCKS, TICKS, TODAY, type Vote } from './data/case'
import { signalOf } from './data/signals'
import { highAllowed } from './digest'
import { DEFAULT_LLM, type Llm } from './llm'
import { configure, DEFAULT_RULES, grade, judgmentsAt, PREF_LABEL, type Anomaly, type Grade, type Judgment, type Pref, type Rules } from './engine'
import { EMPTY_PROFILE, styleFactor, type PlanChoice, type Profile } from './profile'

export type Page = 'today' | 'watch' | 'review' | 'signals' | 'me'
const PAGES: Page[] = ['today', 'watch', 'review', 'signals', 'me']
export type MeTab = 'settings' | 'profile' | 'holdings' | 'memory' | 'plan'
/**
 * 管家设置：这个助理被允许做什么。
 * memory：要不要记下我的表态、理由和选择；tune：要不要自己试更准的阈值并提建议；notify：哪些事可以主动提醒我。
 */
export type Agent = { memory: boolean; tune: boolean; notify: { review: boolean; holdings: boolean; focus: boolean }; /** 打扰预算：每天最多几件事可以标成「高」 */ budget: number }
export const DEFAULT_AGENT: Agent = { memory: true, tune: true, notify: { review: true, holdings: true, focus: true }, budget: 3 }
/**
 * 订阅（演示，不扣费），参考 Claude 的订阅制：各档能用的功能基本一样，差的是模型用量。
 * tier：免费版、Pro、Max（用量是 Pro 的 5 倍或 20 倍）；cycle：月付还是年付；until：到期或下次续费的日期（演示数据里的日期）；
 * extra：用量用完后按 token 计费接着用（额外用量），只有付费档能开。
 */
export type Sub = { tier: 'free' | 'pro' | 'max5' | 'max20'; cycle: 'month' | 'year' | null; until: string | null; extra: boolean }
export const FREE_SUB: Sub = { tier: 'free', cycle: null, until: null, extra: false }
/** 存下来的订阅不是现在认识的样子时，回到免费版 */
const subOf = (s: Partial<Sub> | undefined): Sub =>
  s && ['pro', 'max5', 'max20'].includes(s.tier ?? '') && (s.cycle === 'month' || s.cycle === 'year') && s.until ? { tier: s.tier!, cycle: s.cycle, until: s.until, extra: !!s.extra } : FREE_SUB

export const VOTE_LABEL: Record<Vote, string> = { agree: '我也这么看', disagree: '我不这么看', watch: '先不表态' }
/** 管家记下的一件事。day 是记录时演示数据里的日期。 */
export type Memory = { id: string; day: string; kind: 'own' | 'vote' | 'note' | 'pref' | 'plan' | 'ask' | 'holding' | 'profile' | 'rule'; text: string; code?: string }
/**
 * 一条经验（长期记忆）：从一条有结果的判断里总结出来，按信号归类，以后同类信号出现时拿出来参考。
 * by：管家总结的还是用户自己写的；at：来源判断出结果的日期；seed：演示预置。
 */
export type Lesson = { id: string; jid: string; signal: string; code: string; text: string; by: 'butler' | 'me'; at: string; seed?: boolean }
/** 复盘对话里的一句话。phase 记录它发生在判断出结果之前还是之后 */
export type Turn = { who: 'me' | 'butler'; text: string; phase: 'pending' | 'settled' }
/** 一条判断复盘后的结论：记下了管家的经验 / 不记 / 没有可记的经验、只是看过 */
export type ReviewState = 'kept' | 'skipped' | 'ack'
export type { Llm } from './llm'
/** 一轮提问：a 为空表示还在等回答 */
export type ChatMsg = { q: string; a?: Answer; error?: string }

type Saved = {
  votes: Record<string, Vote>; prefs: Record<string, Pref>; holdings: Record<string, number>; memory: Memory[]; onboarded: boolean; llm: Llm
  lessons: Lesson[]; reviewState: Record<string, ReviewState>; dialog: Record<string, Turn[]>
  profile: Profile
  /** 表态时选的理由：同意或不同意的是哪一环（见 review.ts 的 REASONS）。key 是判断 id */
  reasons: Record<string, string>
  /** 微观指标的阈值和开关，用户可以在信号库里调 */
  rules: Rules
  /** 每条判断上记下的调仓选择。key 是判断 id */
  plans: Record<string, PlanChoice>
  agent: Agent
  sub: Sub
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
  /** 记下表态的理由（选的是哪一环）。label 写进记忆 */
  setReason: (j: Judgment, key: string, label: string) => void
  /** note 写进记忆，说明改了什么 */
  setRules: (r: Rules, note: string) => void
  /** 记下一次调仓选择，note 写进记忆 */
  savePlan: (jid: string, c: PlanChoice, note: string, code: string) => void
  setAgent: (a: Agent) => void
  setSub: (s: Sub) => void
  /** judgmentText 用于写进记忆，让用户日后看得懂当时表态的是哪一条 */
  vote: (id: string, v: Vote, judgmentText: string, code: string) => void
  setPref: (code: string, p: Pref) => void
  setHoldings: (h: Record<string, number>, note: string) => void
  /** 用户是否补充过持仓；没有时等级不按仓位调整 */
  hasHoldings: boolean
  weightOf: (code: string) => number | null
  /** 一条异动对某只股票的等级：事件影响 × 仓位 × 提醒偏好 × 投资风格 */
  gradeOf: (a: Anomaly, code: string) => Grade
  /** 改画像里的某几项（其余不变），note 写进记忆 */
  setProfile: (p: Partial<Profile>, note: string) => void
  remember: (m: Omit<Memory, 'id' | 'day'>) => void
  forget: (id: string) => void
  setOnboarded: (v: boolean) => void
  setLlm: (l: Llm) => void
  reset: () => void
}
const Ctx = createContext<Store | null>(null)
export const useStore = () => useContext(Ctx)!

const KEY = 'anomaly-butler:v10'
/** 演示预置：三条较早的判断已经复盘过，管家的经验已记进长期记忆。只在与实际结算结果一致时预置。 */
const SEED_REVIEWED = ['j-xm-place', 'j-nv-energy', 'j-xm-su7']
function fresh(tick: string): Saved {
  configure(DEFAULT_RULES)
  const done = judgmentsAt(tick).filter((j) => SEED_REVIEWED.includes(j.id) && j.review)
  return {
    votes: SEED_VOTES, prefs: {}, holdings: DEMO_HOLDINGS, memory: [], onboarded: false, llm: DEFAULT_LLM,
    lessons: done.map((j) => ({ id: `seed-${j.id}`, jid: j.id, signal: j.anomaly.signal, code: j.code, text: j.review!.lesson, by: 'butler' as const, at: j.settledOn!, seed: true })),
    reviewState: Object.fromEntries(done.map((j) => [j.id, 'kept' as const])), dialog: {},
    profile: EMPTY_PROFILE, reasons: SEED_REASONS, rules: DEFAULT_RULES, plans: {}, agent: DEFAULT_AGENT, sub: FREE_SUB,
  }
}
function load(tick: string): Saved {
  try {
    const base = fresh(tick), got = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>
    // 新加的设置项用默认值补上
    return { ...base, ...got, rules: { ...base.rules, ...got.rules }, agent: { ...base.agent, ...got.agent, notify: { ...base.agent.notify, ...got.agent?.notify } }, profile: { ...base.profile, ...got.profile }, sub: subOf(got.sub), llm: got.llm?.url ? got.llm : base.llm }
  } catch { return fresh(tick) }
}
const pageFromHash = (): Page => {
  const h = location.hash.replace('#/', '').split('/')[0] as Page
  return PAGES.includes(h) ? h : 'today'
}
const hashArg = (): string | undefined => location.hash.replace('#/', '').split('/')[1] || undefined
/** 「我的」的子页也写进网址（#/me/memory），可以直接打开某一页 */
const ME_TABS: MeTab[] = ['settings', 'plan', 'profile', 'holdings', 'memory']
const meTabFromHash = (): MeTab => { const t = location.hash.replace('#/', '').split('/')[1] as MeTab; return ME_TABS.includes(t) ? t : 'settings' }
/** 默认用 TODAY；网址带 ?date= 且是演示数据里的交易日时用它（汇报时换一天验证用） */
function initialTick() {
  const d = new URLSearchParams(location.search).get('date')
  return d && TICKS.includes(d) ? d : TODAY
}
const nameOf = (code: string) => STOCKS.find((s) => s.code === code)?.name ?? code

export function StoreProvider({ children }: { children: ReactNode }) {
  const tick = useMemo(initialTick, [])
  const [saved, setSaved] = useState<Saved>(() => load(tick))
  // 引擎按当前规则识别异动；放在渲染里同步应用，保证下面的页面读到的是新规则的结果
  configure(saved.rules)
  const [page, setPageState] = useState<Page>(pageFromHash)
  const [meTab, setMeTab] = useState<MeTab>(meTabFromHash)
  const [code, setCode] = useState<string | null>(() => (pageFromHash() === 'watch' ? STOCKS.find((s) => s.code === hashArg())?.code ?? null : null))
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [reviewId, setReviewId] = useState<string | null>(() => (pageFromHash() === 'review' ? hashArg() ?? null : null))

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(saved)) } catch { /* 存不了就只在本次生效 */ } }, [saved])
  useEffect(() => {
    const onHash = () => { setPageState(pageFromHash()); if (pageFromHash() === 'me') setMeTab(meTabFromHash()) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const patch = (p: Partial<Saved>) => setSaved((s) => ({ ...s, ...p }))
  const setPage = (p: Page) => { location.hash = `#/${p}`; setPageState(p) }
  // 用户关掉「记住我的操作」后不再往记录里写
  const remember: Store['remember'] = (m) => setSaved((s) => !s.agent.memory ? s : ({ ...s, memory: [{ ...m, id: `${Date.now()}-${s.memory.length}`, day: tick }, ...s.memory].slice(0, 200) }))
  const hasHoldings = Object.values(saved.holdings).some((w) => w > 0)
  const i = TICKS.indexOf(tick)
  // 等级：先按强度 × 仓位 × 偏好 × 画像算，再按打扰预算限制「高」的数量（每天最多几件事）
  const rawGrade = (a: Anomaly, c: string) => grade(a.strength, hasHoldings ? saved.holdings[c] ?? 0 : null, saved.prefs[c] ?? 'normal', styleFactor(saved.profile, signalOf(a.signal)?.group))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allowHigh = useMemo(() => highAllowed(tick, (a, c) => rawGrade(a, c).score, saved.agent.budget), [tick, saved.holdings, saved.prefs, saved.profile, saved.agent.budget, saved.rules])

  const value: Store = {
    ...saved,
    tick, prevTick: TICKS[i - 1],
    page, setPage,
    meTab, openMe: (t) => { setMeTab(t); location.hash = `#/me/${t}`; setPageState('me') },
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
    savePlan: (jid, c, note, code) => { patch({ plans: { ...saved.plans, [jid]: c } }); remember({ kind: 'plan', code, text: note }) },
    setRules: (r, note) => { patch({ rules: r }); remember({ kind: 'rule', text: note }) },
    setReason: (j, key, label) => {
      patch({ reasons: { ...saved.reasons, [j.id]: key } })
      remember({ kind: 'note', code: j.code, text: `对「${j.text}」的理由：${label}` })
    },
    vote: (id, v, judgmentText, c) => {
      const { [id]: _dropped, ...rest } = saved.reasons
      patch({ votes: { ...saved.votes, [id]: v }, reasons: saved.votes[id] === v ? saved.reasons : rest })
      remember({ kind: 'vote', code: c, text: `对「${judgmentText}」表态：${VOTE_LABEL[v]}` })
    },
    setPref: (c, p) => {
      patch({ prefs: { ...saved.prefs, [c]: p } })
      remember({ kind: 'pref', code: c, text: `${nameOf(c)}的提醒改为：${PREF_LABEL[p]}` })
    },
    setHoldings: (h, note) => { patch({ holdings: h }); remember({ kind: 'holding', text: note }) },
    hasHoldings,
    weightOf: (c) => (hasHoldings ? saved.holdings[c] ?? 0 : null),
    gradeOf: (a, c) => { const g = rawGrade(a, c); return g.level === '高' && !allowHigh.has(a.id) ? { ...g, level: '中' as const, capped: true } : g },
    setProfile: (p, note) => { setSaved((s) => ({ ...s, profile: { ...s.profile, ...p } })); remember({ kind: 'profile', text: note }) },
    remember,
    forget: (id) => setSaved((s) => ({ ...s, memory: s.memory.filter((m) => m.id !== id) })),
    setAgent: (a) => patch({ agent: a }),
    setSub: (s) => patch({ sub: s }),
    setOnboarded: (v) => patch({ onboarded: v }),
    setLlm: (l) => patch({ llm: l }),
    reset: () => setSaved(fresh(tick)),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
