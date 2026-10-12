/** 调仓做法（只在自选的个股详情里出现）：依据管家对这只股票的一条判断，列出三种做法和各自的代价，选一种记下来。只记录，不下单；到期后判断页会回头看这个做法的结果（见 choiceResult）。 */
import { useEffect, useState } from 'react'
import { stockOf, type Judgment } from './engine'
import { Button, cn, Tag } from './kit'
import { conflict, fitPlan, type PlanChoice } from './profile'
import { useStore } from './store'

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`

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

export function Planner({ j }: { j: Judgment }) {
  const { holdings, savePlan, plans, profile, openReview } = useStore()
  const s = stockOf(j.code)
  const w = holdings[j.code] ?? 0
  const post = j.status === 'hit'
  const [keep, setKeep] = useState(plans[j.id]?.keep ?? 1)
  const [saved, setSaved] = useState(!!plans[j.id])
  useEffect(() => setSaved(plans[j.id]?.keep === keep), [keep, plans, j.id])
  const drop = Math.abs(j.thr) / 100
  const list = j.up ? PLANS_UP : PLANS
  const fit = fitPlan(profile, j)
  const off = conflict(profile, keep, j)

  return (
    <div className="mt-2 rounded-lg border border-hairline bg-canvas">
      <div className="border-b border-hairline-soft px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-1.5"><Tag tone={post ? 'pink' : 'orange'}>{post ? `已经${j.up ? '涨过' : '跌破'}` : '还在等结果'}</Tag><span className="text-xs text-steel">依据管家的这条判断</span></div>
        <button type="button" onClick={() => openReview(j.id)} className="mt-1.5 block text-left text-[13px] leading-relaxed text-charcoal hover:text-link">{j.text}。<span className="text-link">看这条判断 →</span></button>
      </div>
      <div className="px-3.5 py-3">
        <div className="flex flex-col gap-1.5" role="group" aria-label="三种做法">
          {list.map((p) => (
            <button key={p.key} type="button" onClick={() => setKeep(p.keep)} aria-pressed={keep === p.keep}
              className={cn('rounded-md border px-3 py-2 text-left', keep === p.keep ? 'border-primary bg-tint-lavender' : 'border-hairline hover:bg-surface-soft')}>
              <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">{p.label}<span className="text-[13px] font-normal tabular-nums text-steel">{pct(w, 0)} → {pct(w * p.keep, 0)}</span>{fit === p.key ? <span className="rounded-xs bg-tint-lavender px-1.5 text-xs font-medium text-on-lavender">接近你的风格</span> : null}</span>
              <span className="mt-0.5 block text-[13px] text-slate">代价：{post ? p.after : p.before}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-charcoal">{j.up ? (post ? `如果再涨 ${Math.abs(j.thr)}%` : '如果管家说对了') : post ? `如果再跌 ${Math.abs(j.thr)}%` : '如果管家说对了'}，总资产{j.up ? '多' : '少'} <b className="font-semibold tabular-nums">{pct(w * keep * drop, 2)}</b>{keep !== 1 ? <span className="text-steel">（不动是 {pct(w * drop, 2)}）</span> : null}</p>
        {off ? <p className="mt-2 rounded-md bg-tint-yellow px-3 py-2 text-[13px] text-on-yellow">{off}决定仍然由你做。</p> : null}
        <Button variant="primary" className="mt-3 w-full" disabled={saved}
          onClick={() => savePlan(j.id, { keep, off: !!off }, `${s.name}（${post ? (j.up ? '已涨过后' : '已跌破后') : '等结果期间'}）选择了：${planLabel(j, keep)}${off ? '（和设定的风格不同）' : ''}`, j.code)}>{saved ? '已记下我的选择' : '记下我的选择'}</Button>
        <p className="mt-2 text-xs text-steel">只做记录，不会下单。出结果后，判断页会回头看这个做法带来了什么。</p>
      </div>
    </div>
  )
}
