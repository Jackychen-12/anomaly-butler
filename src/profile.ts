/** 投资画像：风险承受、持有周期、遇到大跌时的习惯，以及用户自己的原则。管家按它调整提醒，并在做选择时对照提醒。 */
import type { SignalGroup } from './data/signals'
import type { Judgment } from './engine'

export type Profile = {
  /** 单只股票最多能接受的跌幅（%） */
  tolerance: 10 | 20 | 30 | null
  horizon: 'short' | 'mid' | 'long' | null
  /** 遇到大跌时通常：先减仓 / 先观察 / 越跌越买 */
  reaction: 'cut' | 'hold' | 'add' | null
  /** 单只股票最多放多少仓位（%） */
  maxWeight: 10 | 20 | 30 | null
  /** 用户自己写的原则 */
  rules: string[]
}
export const EMPTY_PROFILE: Profile = { tolerance: null, horizon: null, reaction: null, maxWeight: null, rules: [] }
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

/** 一次调仓选择：保留了多少仓位，是否和设定的风格不一样 */
export type PlanChoice = { keep: number; off: boolean }
/**
 * 管家从行为里观察到的你：画像不只是自己填的那几项，也来自长期记下的表态和调仓选择。
 * 设定和实际对不上时，给出一句提醒（mismatch）。
 */
export function observed(p: Profile, plans: Record<string, PlanChoice>, stats: { disagree: number; disagreeRight: number; votes: number }, holdings: Record<string, number>, nameOf: (code: string) => string): { facts: string[]; mismatch: string | null } {
  const facts: string[] = []
  const choices = Object.values(plans)
  const cut = choices.filter((c) => c.keep < 1).length
  if (choices.length) facts.push(`记下过 ${choices.length} 次调仓选择：${choices.length - cut} 次不动，${cut} 次减仓或卖出。`)
  if (stats.votes) facts.push(`表过 ${stats.votes} 次态${stats.disagree ? `；${stats.disagree} 次和管家意见不同，其中 ${stats.disagreeRight} 次你对` : ''}。`)
  const over = p.maxWeight ? Object.entries(holdings).filter(([, w]) => w * 100 > p.maxWeight!).map(([c]) => nameOf(c)) : []
  if (over.length) facts.push(`${over.join('、')}的仓位超过了你设的单只上限（${p.maxWeight}%）。`)
  let mismatch: string | null = null
  const off = choices.filter((c) => c.off).length
  if (off >= 2) mismatch = `有 ${off} 次选择和设定的风格不一样。也许实际的你和设定的不同，可以考虑改一下画像。`
  else if (p.reaction === 'hold' && choices.length >= 2 && cut / choices.length > 0.6) mismatch = '你设定的是「先不动，观察」，但实际多数时候选择了减仓。'
  return { facts, mismatch }
}
