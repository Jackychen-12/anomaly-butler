/** 调仓做法的数据和算法：看跌和看涨的判断各有三种做法和各自的代价。在自选个股页的对话里选（见 stockchat.tsx），只记录、不下单；到期后判断页回头看这个做法的结果（见 choiceResult）。 */
import type { Judgment } from './engine'
import type { PlanChoice } from './profile'


const PLANS = [
  { key: 'hold', label: '不动', keep: 1, before: '如果管家说对了，你要承受全部跌幅。', after: '如果继续下跌，你要承受全部跌幅。' },
  { key: 'half', label: '减到一半', keep: 0.5, before: '如果管家说错了、股价反弹，你少赚一半；还有交易成本。', after: '如果之后反弹，你只能收回一半；还有交易成本。' },
  { key: 'exit', label: '全部卖出', keep: 0, before: '如果管家说错了、股价反弹，你完全错过；还有交易成本，之后还要决定何时买回。', after: '亏损就此确定，之后反弹与你无关；还要决定何时买回。' },
] as const
/** 看涨的判断：不动、先卖一半落袋、再加一些。同样只列做法和代价 */
const PLANS_UP = [
  { key: 'hold', label: '不动', keep: 1, before: '管家说对的话，你按现有仓位赚到涨幅；说错了也按现有仓位承受。', after: '已经涨到了管家说的价格，继续拿着有回落的可能。' },
  { key: 'half', label: '卖掉一半', keep: 0.5, before: '如果管家说对了、继续涨，你少赚一半；还有交易成本。', after: '一半利润落袋，如果继续涨，你少赚一半。' },
  { key: 'more', label: '加到一倍半', keep: 1.5, before: '如果管家说错了、反而下跌，你多亏一半；还会占用现金。', after: '在涨过之后追加，买得比之前贵，回落时亏得更多。' },
] as const

/** 一种做法叫什么：三种预设之一，或者「保留 x%」 */
export const planLabel = (j: Judgment, keep: number) => (j.up ? PLANS_UP : PLANS).find((p) => p.keep === keep)?.label ?? `保留 ${Math.round(keep * 100)}%`

/** 回头看一个做法的结果：和「不动」相比，总资产多了还是少了多少个百分点。还没有收盘数据时返回 null */
export function choiceResult(j: Judgment, c: PlanChoice, weight: number): { move: number; diff: number } | null {
  if (j.latest == null) return null
  return { move: j.latest, diff: weight * (c.keep - 1) * j.latest }
}

/** 一条判断对应的三种做法（看跌和看涨各一套） */
export const plansOf = (j: Judgment) => (j.up ? PLANS_UP : PLANS)
