/** 调仓做法：看跌和看涨的判断各有三种做法；判断还在等结果（事前）和已经到价（事后）共用。三种做法 + 自己拖比例，实时看到变化；只记录，不下单。 */
import { useEffect, useState } from 'react'
import { fmtDate, stockOf, type Judgment } from './engine'
import { Button, cn, Tag } from './kit'
import { conflict, fitPlan, profileSet } from './profile'
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

export function Planner({ j }: { j: Judgment }) {
  const { holdings, savePlan, plans, profile, openMe } = useStore()
  const s = stockOf(j.code)
  const w = holdings[j.code] ?? 0
  const post = j.status === 'hit'
  const [keep, setKeep] = useState(plans[j.id]?.keep ?? 1)
  const [saved, setSaved] = useState(!!plans[j.id])
  useEffect(() => setSaved(plans[j.id]?.keep === keep), [keep, plans, j.id])
  const after = w * keep
  const drop = Math.abs(j.thr) / 100
  const cash = 1 - Object.values(holdings).reduce((a, b) => a + b, 0)
  const list = j.up ? PLANS_UP : PLANS
  const plan = list.find((p) => p.keep === keep)
  const fit = fitPlan(profile, j)
  const off = conflict(profile, keep, j)

  return (
    <div className="@container mt-3 rounded-lg border border-hairline">
      <div className="border-b border-hairline px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-1.5"><Tag tone={post ? 'pink' : 'orange'}>{post ? `事后 · 已经${j.up ? '涨过' : '跌破'}` : '事前 · 还在等结果'}</Tag><span className="text-xs text-steel">{post ? `${fmtDate(j.settledOn!)} 跌破` : j.dueDate ? `${fmtDate(j.dueDate)} 对答案` : ''}</span></div>
        <p className="mt-1.5 text-[15px] font-semibold">{j.anomaly.title}</p>
        <p className="mt-0.5 text-sm text-slate">管家认为：{j.text}。{post ? `这个价格已经${j.up ? '涨过' : '跌破'}了。` : ''}</p>
      </div>
      <div className="grid gap-5 px-4 py-4 @min-[600px]:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          {profile.rules.length ? (
            <div className="mb-3 rounded-md bg-surface px-3 py-2 text-[13px] text-charcoal">
              <p className="text-xs text-steel">动手前对照一下你的原则</p>
              <ul className="mt-1 list-disc pl-4">{profile.rules.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          ) : null}
          <p className="eyebrow mb-2">三种做法</p>
          <div className="flex flex-col gap-2">
            {list.map((p) => (
              <button key={p.key} type="button" onClick={() => setKeep(p.keep)} aria-pressed={keep === p.keep}
                className={cn('rounded-md border px-3.5 py-2.5 text-left', keep === p.keep ? 'border-primary bg-tint-lavender' : 'border-hairline hover:bg-surface-soft')}>
                <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">{p.label}<span className="text-[13px] font-normal tabular-nums text-steel">{s.name} {pct(w, 0)} → {pct(w * p.keep, 0)}</span>{fit === p.key ? <span className="rounded-xs bg-tint-lavender px-1.5 text-xs font-medium text-on-lavender">更接近你的风格</span> : null}</span>
                <span className="mt-0.5 block text-[13px] text-slate">代价：{post ? p.after : p.before}</span>
              </button>
            ))}
          </div>
          <label className="mt-4 block text-[13px] text-steel" htmlFor="keep">或者自己定：保留 <b className="font-medium tabular-nums text-ink">{Math.round(keep * 100)}%</b> 的{s.name}仓位</label>
          <input id="keep" type="range" min={0} max={j.up ? 150 : 100} step={5} value={Math.round(keep * 100)} onChange={(e) => setKeep(Number(e.target.value) / 100)} className="mt-1.5 w-full accent-[var(--primary)]" />
          {off ? <p className="mt-2 rounded-md bg-tint-yellow px-3 py-2 text-[13px] text-on-yellow">{off}决定仍然由你做，记下选择时我会一并记下这次和平时不同。</p> : null}
          {profileSet(profile) ? null : <button type="button" onClick={() => openMe('profile')} className="mt-2 text-[13px] text-link hover:underline">设置投资画像后，会标出更接近你风格的做法 →</button>}
        </div>
        <div className="rounded-lg bg-surface-soft p-4">
          <p className="eyebrow">这样调整之后</p>
          <Delta label={`${s.name}占总资产`} before={pct(w)} after={pct(after)} changed={keep !== 1} />
          <Delta label={j.up ? (post ? `如果再涨 ${Math.abs(j.thr)}%，总资产再多` : '如果管家说对了，总资产至少多') : post ? `如果再跌 ${Math.abs(j.thr)}%，总资产再少` : '如果管家说对了，总资产至少少'} before={pct(w * drop, 2)} after={pct(after * drop, 2)} changed={keep !== 1} />
          <Delta label="现金及其他" before={pct(cash)} after={pct(cash + w - after)} changed={keep !== 1} />
          <p className="mt-3 text-xs text-steel">{post ? `「再${j.up ? '涨' : '跌'}」只是一个假设的幅度，用来比较不同做法。` : `按管家说的幅度（${Math.abs(j.thr)}%）估算，这是说对时的最小变化，实际可能更大。`}</p>
          <Button variant="primary" className="mt-3 w-full" disabled={saved}
            onClick={() => savePlan(j.id, { keep, off: !!off }, `${s.name}（${post ? (j.up ? '已涨过后' : '已跌破后') : '等结果期间'}）选择了：${plan ? plan.label : `保留 ${Math.round(keep * 100)}%`}${off ? '（和设定的风格不同）' : ''}`, j.code)}>{saved ? '已记下我的选择' : '记下我的选择'}</Button>
          <p className="mt-2 text-xs text-steel">只做记录，方便日后回头看，不会下单。</p>
        </div>
      </div>
    </div>
  )
}

function Delta({ label, before, after, changed }: { label: string; before: string; after: string; changed: boolean }) {
  return (
    <div className="mt-3">
      <p className="text-[13px] text-steel">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
        {changed ? <><span className="font-normal text-stone line-through">{before}</span><span className="mx-1.5 text-stone">→</span></> : null}{after}
      </p>
    </div>
  )
}

