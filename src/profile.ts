/**
 * 投资画像：管家对「你是什么样的投资者」的理解。
 * 一半是你告诉它的（承受多大跌幅、拿多久、大跌时怎么做、仓位上限、目标、经验、主要看什么、自己的原则），
 * 一半是它从长期记下的表态和调仓选择里观察到的（见 pages/Profile.tsx）。
 * 每一项都对应前面某个功能：提醒等级、判断旁的对照说明、调仓时的提示、持仓超限提醒、解释的多少。
 */
import type { SignalGroup } from './data/signals'
import type { Judgment } from './engine'

export type Focus = 'macro' | 'company' | 'tech'
export type Profile = {
  /** 单只股票最多能接受的跌幅（%） */
  tolerance: 10 | 20 | 30 | null
  horizon: 'short' | 'mid' | 'long' | null
  /** 遇到大跌时通常：先减仓 / 先观察 / 越跌越买 */
  reaction: 'cut' | 'hold' | 'add' | null
  /** 单只股票最多放多少仓位（%） */
  maxWeight: 10 | 20 | 30 | null
  /** 这笔钱的目标：保值 / 稳健增值 / 追求高收益 */
  goal: 'preserve' | 'steady' | 'growth' | null
  /** 投资经验：新手 / 一到三年 / 三年以上 */
  experience: 'new' | 'mid' | 'senior' | null
  /** 做决定时主要看什么（可多选） */
  focus: Focus[]
  /** 用户自己写的原则 */
  rules: string[]
}
export const EMPTY_PROFILE: Profile = { tolerance: null, horizon: null, reaction: null, maxWeight: null, goal: null, experience: null, focus: [], rules: [] }

export const HORIZON_LABEL = { short: '短线', mid: '中线', long: '长线' } as const
export const REACTION_LABEL = { cut: '先减仓', hold: '先不动，观察', add: '越跌越买' } as const
export const GOAL_LABEL = { preserve: '保值', steady: '稳健增值', growth: '追求高收益' } as const
export const EXPERIENCE_LABEL = { new: '新手', mid: '1–3 年', senior: '3 年以上' } as const
export const FOCUS_LABEL: Record<Focus, string> = { macro: '宏观政策', company: '公司事件', tech: '行情走势' }
const FOCUS_GROUPS: Record<Focus, SignalGroup[]> = { macro: ['宏观政策', '跨市场传导'], company: ['公司事件'], tech: ['价量', '资金'] }

/** 核心三项（承受跌幅、持有周期、大跌时的习惯）填了，画像就开始起作用 */
export const profileSet = (p: Profile) => p.tolerance != null && p.horizon != null && p.reaction != null
/** 一共 7 项可选，填了几项 */
export const filled = (p: Profile) => [p.tolerance, p.horizon, p.reaction, p.maxWeight, p.goal, p.experience, p.focus.length ? 1 : null].filter((x) => x != null).length
export const TOTAL = 7

/** 风险偏好 0–100：由承受跌幅、大跌时的习惯、投资目标三项平均得出；一项都没填返回 null */
export function riskScore(p: Profile): number | null {
  const parts = [
    p.tolerance == null ? null : { 10: 20, 20: 50, 30: 80 }[p.tolerance],
    p.reaction == null ? null : { cut: 20, hold: 50, add: 80 }[p.reaction],
    p.goal == null ? null : { preserve: 20, steady: 50, growth: 80 }[p.goal],
  ].filter((x): x is number => x != null)
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null
}
export const riskType = (score: number) => (score < 40 ? '保守' : score < 65 ? '稳健' : '积极')
export const profileLabel = (p: Profile) => (profileSet(p) ? `${riskType(riskScore(p)!)} · ${HORIZON_LABEL[p.horizon!]} · 最多接受跌 ${p.tolerance}%` : '')

/**
 * 画像对提醒等级的影响（一个系数）：
 * 持有周期——长线少提醒短期的行情和资金波动，短线多提醒；
 * 主要看什么——你看重的那几类信号上调，其余略下调。
 */
export function styleFactor(p: Profile, group: SignalGroup | undefined): number {
  if (!group) return 1
  const shortTerm = group === '价量' || group === '资金'
  const byHorizon = p.horizon === 'long' && shortTerm ? 0.7 : p.horizon === 'short' && shortTerm ? 1.2 : 1
  const cared = p.focus.some((f) => FOCUS_GROUPS[f].includes(group))
  const byFocus = p.focus.length ? (cared ? 1.15 : 0.9) : 1
  return Math.max(0.6, Math.min(1.4, Math.round(byHorizon * byFocus * 100) / 100))
}

/** 这条判断对「你」意味着什么：一句话，对照承受上限和持有周期 */
export function meaning(p: Profile, j: Judgment): string | null {
  if (!profileSet(p) || j.up) return null
  const drop = Math.abs(j.thr)
  if (drop >= p.tolerance!) return `这个跌幅（${drop}%）到了你设定的承受上限（${p.tolerance}%）。`
  if (p.horizon === 'long') return `你是长线，${drop}% 在你能接受的 ${p.tolerance}% 以内，通常不用动。`
  if (p.horizon === 'short') return `你做短线，${j.n} 个交易日正是你的操作周期。`
  return `${drop}% 在你能接受的 ${p.tolerance}% 以内，可以先观察。`
}

export type PlanKey = 'hold' | 'half' | 'exit'
/** 三种做法里，哪一种更接近用户设定的风格 */
export function fitPlan(p: Profile, j: Judgment): PlanKey | null {
  if (!profileSet(p) || j.up) return null
  if (p.reaction === 'add') return 'hold'
  if (p.reaction === 'cut') return 'half'
  return Math.abs(j.thr) >= p.tolerance! ? 'half' : 'hold'
}
/** 用户选的做法和设定的风格不一致时，提醒一句（不拦着） */
export function conflict(p: Profile, keep: number, j: Judgment): string | null {
  if (!profileSet(p) || j.up) return null
  if (p.horizon === 'long' && keep === 0) return '你设定的是长线，这次选择全部卖出，和平时的风格不一样。'
  if (p.reaction === 'add' && keep < 1) return '你设定的是越跌越买，这次选择减仓，和平时不一样。'
  if (p.reaction === 'cut' && keep === 1 && Math.abs(j.thr) >= p.tolerance!) return '跌幅已到你设定的承受上限，而你选择不动，和设定的做法不一样。'
  return null
}

/** 一次调仓选择：保留了多少仓位，是否和设定的风格不一样 */
export type PlanChoice = { keep: number; off: boolean }
