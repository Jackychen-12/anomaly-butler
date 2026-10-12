/** 调仓页：授权后按持仓给出几个方案，用户自己选或自己调，实时看到风险暴露的变化。 */
import { useEffect, useState } from 'react'
import { CASH_WEIGHT, STOCKS } from '../data/case'
import { fmtDate, grade, judgmentsAt, stockOf, type Judgment } from '../engine'
import { Button, cn, LevelTag, Tag } from '../kit'
import { useStore } from '../store'

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`

export function RebalancePage({ onAuthorize }: { onAuthorize: () => void }) {
  const { authorized, setAuthorized } = useStore()
  return (
    <div className="mx-auto max-w-[960px] px-4 py-5 lg:px-6">
      <h1 className="text-[22px] font-semibold tracking-tight">调仓</h1>
      <p className="mt-0.5 text-sm text-steel">管家给出方案和代价，决定由你来做。这里不会下单。</p>
      {authorized ? <Authorized onRevoke={() => setAuthorized(false)} /> : (
        <div className="mt-5 rounded-lg border border-dashed border-hairline-strong p-6">
          <p className="text-base font-semibold">授权证券账户后可用</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-charcoal">
            <li>按持仓权重重新计算每条异动的等级，重仓股的异动优先提醒</li>
            <li>针对待验证的判断给出 2–3 个调仓方案，写明各自的代价</li>
            <li>拖动仓位，实时看到组合对这条风险的暴露变化</li>
          </ul>
          <Button variant="primary" size="md" className="mt-4" onClick={onAuthorize}>授权证券账户</Button>
          <p className="mt-3 text-xs text-steel">演示流程，载入的是模拟持仓。调仓方案属于投资顾问服务，正式产品中需由持牌机构提供。</p>
        </div>
      )}
    </div>
  )
}

function Authorized({ onRevoke }: { onRevoke: () => void }) {
  const { tick, prefs } = useStore()
  const held = STOCKS.filter((s) => s.weight > 0)
  // 只针对持仓股上还没结算的判断给方案
  const targets = judgmentsAt(tick).filter((j) => j.status === 'pending' && stockOf(j.code).weight > 0)
  const [jid, setJid] = useState<string | null>(null)
  const j = targets.find((x) => x.id === jid) ?? targets[0]

  return (
    <>
      <section className="mt-5">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-base font-semibold">持仓 <span className="text-[13px] font-normal text-steel">模拟数据</span></h2>
          <Button size="xs" variant="ghost" onClick={onRevoke}>取消授权</Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-hairline">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead><tr className="text-left text-xs text-steel [&>th]:border-b [&>th]:border-hairline [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
              <th>标的</th><th className="text-right">占比</th><th>待验证的判断</th><th>加权后等级</th></tr></thead>
            <tbody className="[&>tr:last-child>td]:border-b-0 [&_td]:border-b [&_td]:border-hairline-soft [&_td]:px-3 [&_td]:py-2.5">
              {held.map((s) => {
                const tj = targets.find((x) => x.code === s.code)
                return (
                  <tr key={s.code}>
                    <td className="font-medium">{s.name}<span className="ml-2 font-mono text-[11px] font-normal text-stone">{s.symbol}</span></td>
                    <td className="text-right tabular-nums">{pct(s.weight, 0)}</td>
                    <td className="text-slate">{tj ? tj.anomaly.title : <span className="text-stone">—</span>}</td>
                    <td>{tj ? <LevelTag level={grade(tj.anomaly.strength, s.code, true, prefs[s.code] ?? 'normal').level} /> : <span className="text-stone">—</span>}</td>
                  </tr>
                )
              })}
              <tr><td className="text-steel">现金</td><td className="text-right tabular-nums">{pct(CASH_WEIGHT, 0)}</td><td /><td /></tr>
            </tbody>
          </table>
        </div>
      </section>

      {j ? (
        <>
          {targets.length > 1 ? (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {targets.map((t) => (
                <button key={t.id} type="button" onClick={() => setJid(t.id)} aria-pressed={t.id === j.id}
                  className={cn('h-8 rounded-md border px-3 text-[13px]', t.id === j.id ? 'border-primary bg-tint-lavender font-medium text-on-lavender' : 'border-hairline text-slate hover:bg-surface')}>{stockOf(t.code).name}</button>
              ))}
            </div>
          ) : null}
          <Planner key={j.id} j={j} />
        </>
      ) : (
        <p className="mt-5 rounded-lg bg-surface-soft px-4 py-6 text-sm text-steel">这一刻你的持仓股上没有待验证的判断，不需要调仓。往后拖动时间机器，或回到自选页查看。</p>
      )}
    </>
  )
}

const PLANS = [
  { key: 'hold', label: '不动', keep: 1, cost: '判断成立时承受全部回撤。' },
  { key: 'half', label: '减到一半', keep: 0.5, cost: '判断不成立且股价反弹时，少赚一半；另有交易成本。' },
  { key: 'exit', label: '全部卖出', keep: 0, cost: '判断不成立且股价反弹时，完全踏空；另有交易成本，之后还要决定何时买回。' },
] as const

function Planner({ j }: { j: Judgment }) {
  const s = stockOf(j.code)
  const [keep, setKeep] = useState(1)
  const [saved, setSaved] = useState(false)
  useEffect(() => setSaved(false), [keep])
  const after = s.weight * keep
  const lossBefore = s.weight * Math.abs(j.thr) / 100
  const lossAfter = after * Math.abs(j.thr) / 100
  const plan = PLANS.find((p) => p.keep === keep)

  return (
    <section className="mt-5 rounded-lg border border-hairline">
      <div className="border-b border-hairline px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-1.5"><Tag tone="pink">待验证</Tag><Tag>{j.anomaly.cat}</Tag><span className="text-xs text-steel">{j.dueDate ? `${fmtDate(j.dueDate)} 结算` : ''}</span></div>
        <p className="mt-1.5 text-[15px] font-semibold">{j.anomaly.title}</p>
        <p className="mt-0.5 text-sm text-slate">管家判断：{j.text}。</p>
      </div>
      <div className="grid gap-5 px-4 py-4 md:grid-cols-[1fr_300px]">
        <div>
          <p className="eyebrow mb-2">方案</p>
          <div className="flex flex-col gap-2">
            {PLANS.map((p) => (
              <button key={p.key} type="button" onClick={() => setKeep(p.keep)} aria-pressed={keep === p.keep}
                className={cn('rounded-md border px-3.5 py-2.5 text-left', keep === p.keep ? 'border-primary bg-tint-lavender' : 'border-hairline hover:bg-surface-soft')}>
                <span className="flex items-baseline gap-2 text-sm font-semibold">{p.label}<span className="text-[13px] font-normal tabular-nums text-steel">{s.name} {pct(s.weight, 0)} → {pct(s.weight * p.keep, 0)}</span></span>
                <span className="mt-0.5 block text-[13px] text-slate">代价：{p.cost}</span>
              </button>
            ))}
          </div>
          <label className="mt-4 block text-[13px] text-steel" htmlFor="keep">或者自己定：保留 <b className="font-medium tabular-nums text-ink">{Math.round(keep * 100)}%</b> 的{s.name}仓位{plan ? '' : '（自定义）'}</label>
          <input id="keep" type="range" min={0} max={100} step={5} value={Math.round(keep * 100)} onChange={(e) => setKeep(Number(e.target.value) / 100)} className="mt-1.5 w-full accent-[var(--primary)]" />
        </div>
        <div className="rounded-lg bg-surface-soft p-4">
          <p className="eyebrow">调整后的变化</p>
          <Delta label={`${s.name}占比`} before={pct(s.weight)} after={pct(after)} changed={keep !== 1} />
          <Delta label="判断成立时，组合至少回撤" before={`−${pct(lossBefore, 2)}`} after={`−${pct(lossAfter, 2)}`} changed={keep !== 1} />
          <Delta label="现金占比" before={pct(CASH_WEIGHT)} after={pct(CASH_WEIGHT + s.weight - after)} changed={keep !== 1} />
          <p className="mt-3 text-xs text-steel">回撤按触发线（{j.thr}%）估算，是判断成立时的下限，实际可能更大。</p>
          <Button variant="primary" size="sm" className="mt-3 w-full" disabled={saved} onClick={() => setSaved(true)}>{saved ? '已记录我的选择' : '记录我的选择'}</Button>
          <p className="mt-2 text-xs text-steel">只做记录，用于日后复盘，不会下单。</p>
        </div>
      </div>
    </section>
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
