/** 投资画像：风险承受、持有周期、遇到大跌时的习惯，以及用户自己的原则。管家按它调整提醒，并在做选择时对照提醒。 */
import type { SignalGroup } from './data/signals'
import type { Judgment } from './engine'

export type Profile = {
  /** 单只股票最多能接受的跌幅（%） */
  tolerance: 10 | 20 | 30 | null
  horizon: 'short' | 'mid' | 'long' | null
  /** 遇到大跌时通常：先减仓 / 先观察 / 越跌越买 */
  reaction: 'cut' | 'hold' | 'add' | null
  /** 用户自己写的原则 */
  rules: string[]
}
export const EMPTY_PROFILE: Profile = { tolerance: null, horizon: null, reaction: null, rules: [] }
export const HORIZON_LABEL = { short: '短线', mid: '中线', long: '长线' } as const
export const RISK_LABEL = { cut: '保守', hold: '稳健', add: '积极' } as const
export const profileSet = (p: Profile) => p.tolerance != null && p.horizon != null && p.reaction != null
export const profileLabel = (p: Profile) => (profileSet(p) ? `${RISK_LABEL[p.reaction!]} · ${HORIZON_LABEL[p.horizon!]} · 最多接受跌 ${p.tolerance}%` : '')

/** 按持有周期调整提醒：长线少提醒短期的价量和资金波动，短线多提醒 */
export function styleFactor(p: Profile, group: SignalGroup | undefined): number {
  if (!p.horizon || !group) return 1
  const shortTerm = group === '价量' || group === '资金'
  if (p.horizon === 'long') return shortTerm ? 0.7 : 1
  if (p.horizon === 'short') return shortTerm ? 1.2 : 1
  return 1
}

/** 这条判断对「你」意味着什么：一句话，对照承受上限和持有周期 */
export function meaning(p: Profile, j: Judgment): string | null {
  if (!profileSet(p)) return null
  const drop = Math.abs(j.thr)
  if (drop >= p.tolerance!) return `这个跌幅（${drop}%）到了你设定的承受上限（${p.tolerance}%）。`
  if (p.horizon === 'long') return `你是长线，${drop}% 在你能接受的 ${p.tolerance}% 以内，通常不用动。`
  if (p.horizon === 'short') return `你做短线，${j.n} 个交易日正是你的操作周期。`
  return `${drop}% 在你能接受的 ${p.tolerance}% 以内，可以先观察。`
}

export type PlanKey = 'hold' | 'half' | 'exit'
/** 三种做法里，哪一种更接近用户设定的风格 */
export function fitPlan(p: Profile, j: Judgment): PlanKey | null {
  if (!profileSet(p)) return null
  if (p.reaction === 'add') return 'hold'
  if (p.reaction === 'cut') return 'half'
  return Math.abs(j.thr) >= p.tolerance! ? 'half' : 'hold'
}
/** 用户选的做法和设定的风格不一致时，提醒一句（不拦着） */
export function conflict(p: Profile, keep: number, j: Judgment): string | null {
  if (!profileSet(p)) return null
  if (p.horizon === 'long' && keep === 0) return '你设定的是长线，这次选择全部卖出，和平时的风格不一样。'
  if (p.reaction === 'add' && keep < 1) return '你设定的是越跌越买，这次选择减仓，和平时不一样。'
  if (p.reaction === 'cut' && keep === 1 && Math.abs(j.thr) >= p.tolerance!) return '跌幅已到你设定的承受上限，而你选择不动，和设定的做法不一样。'
  return null
}
