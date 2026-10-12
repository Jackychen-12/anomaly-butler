/** 信号库：异动监测信息集。每类信号 = 内容（看什么、数据、规则）+ 评测（历史上表现如何）。 */
import { useMemo, useState, type ReactNode } from 'react'
import { MARKET_LABEL } from '../data/case'
import { SIGNAL_GROUPS, SIGNALS, type SignalDef } from '../data/signals'
import { evaluateSignal, fmtDate, signalsMarkdown, signed, signClass, stockOf, type SignalEval } from '../engine'
import { Button, cn, Tag } from '../kit'

const KIND: Record<SignalDef['kind'], { label: string; tone: 'green' | 'blue' | 'gray' }> = {
  rule: { label: '已接入 · 规则自动识别', tone: 'green' }, event: { label: '已接入 · 人工整理事件', tone: 'blue' }, planned: { label: '规划中', tone: 'gray' },
}

export function SignalsPage() {
  const evals = useMemo(() => Object.fromEntries(SIGNALS.map((s) => [s.id, evaluateSignal(s.id)])) as Record<string, SignalEval>, [])
  const live = SIGNALS.filter((s) => s.kind !== 'planned').length
  const download = () => {
    const url = URL.createObjectURL(new Blob([signalsMarkdown()], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = '异动监测信息集.md'; a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="mx-auto max-w-[960px] px-4 py-5 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight">信号库</h1>
          <p className="mt-0.5 text-sm text-steel">管家靠这些信号发现异动。每类信号都写明它看什么、怎样触发，以及在历史数据上准不准。共 {SIGNALS.length} 类，已接入 {live} 类。</p>
        </div>
        <Button onClick={download}>导出 Markdown</Button>
      </div>
      <p className="mt-3 rounded-md bg-surface px-3.5 py-2.5 text-[13px] text-slate">
        评测口径：规则类信号在 8 只自选股 2025 年 1–4 月的真实日线上回测；事件类信号统计本案例内的判断结果。样本都很小，而且这段时间市场大跌，数字只能参考。
      </p>
      {SIGNAL_GROUPS.map((g) => (
        <section key={g} className="mt-6">
          <h2 className="mb-2 text-base font-semibold">{g}</h2>
          <div className="flex flex-col gap-2.5">{SIGNALS.filter((s) => s.group === g).map((s) => <SignalCard key={s.id} s={s} e={evals[s.id]} />)}</div>
        </section>
      ))}
    </div>
  )
}

function SignalCard({ s, e }: { s: SignalDef; e: SignalEval }) {
  const [open, setOpen] = useState(false)
  return (
    <article className={cn('rounded-lg border border-hairline', s.kind === 'planned' && 'bg-surface-soft')}>
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5"><h3 className="text-[15px] font-semibold">{s.name}</h3><Tag tone={KIND[s.kind].tone}>{KIND[s.kind].label}</Tag></div>
          <p className="mt-1 text-sm text-charcoal">{s.define}</p>
          <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] text-charcoal">
            <dt className="text-steel">数据来源</dt><dd>{s.source}</dd>
            <dt className="text-steel">触发规则</dt><dd>{s.rule}</dd>
            <dt className="text-steel">适用市场</dt><dd>{s.markets.map((m) => MARKET_LABEL[m]).join('、')}</dd>
            <dt className="text-steel">触发后</dt><dd>{s.kind === 'planned' ? '—' : s.judges ? '管家给出判断，到期对答案' : '只提醒，不做判断'}</dd>
          </dl>
        </div>
        <div className="rounded-md bg-surface-soft p-3">
          <p className="eyebrow">评测</p>
          {!e ? <p className="mt-1.5 text-[13px] text-steel">{s.kind === 'planned' ? '数据接入后才有评测。' : '只提醒、不出判断，没有可对答案的样本。'}</p> : e.kind === 'rule' ? (
            <>
              <Stat label="回测触发" value={`${e.n} 次`} />
              <Stat label="之后 5 日内又跌 5% 以上" value={e.n ? `${e.cont} 次（${Math.round((e.cont / e.n) * 100)}%）` : '—'} />
              <Stat label="触发后 5 日平均涨跌" value={e.n ? <span className={signClass(e.avg5)}>{signed(e.avg5)}%</span> : '—'} />
              {e.n ? <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-2 text-[13px] text-link hover:underline">{open ? '收起样本' : `看全部 ${e.n} 个样本`}</button> : null}
            </>
          ) : (
            <>
              <Stat label="本案例内的判断" value={`${e.n} 条`} />
              <Stat label="说对 / 说错" value={`${e.hit} / ${e.miss}`} />
              <Stat label="作废 / 未到期" value={`${e.void} / ${e.pending}`} />
            </>
          )}
        </div>
      </div>
      {open && e?.kind === 'rule' ? (
        <div className="overflow-x-auto border-t border-hairline-soft">
          <table className="w-full min-w-[440px] border-collapse text-[13px]">
            <thead><tr className="text-left text-xs text-steel [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium"><th>股票</th><th>触发日</th><th className="text-right">当日涨跌</th><th className="text-right">之后 5 日最低</th><th className="text-right">5 日后</th></tr></thead>
            <tbody className="[&_td]:border-t [&_td]:border-hairline-soft [&_td]:px-4 [&_td]:py-1.5 [&_td]:tabular-nums">
              {e.samples.map((x) => (
                <tr key={x.code + x.d}><td>{stockOf(x.code).name}</td><td>{fmtDate(x.d)}</td>
                  <td className={cn('text-right', signClass(x.p))}>{signed(x.p)}%</td><td className={cn('text-right', signClass(x.fwdMin))}>{signed(x.fwdMin)}%</td><td className={cn('text-right', signClass(x.fwd5))}>{signed(x.fwd5)}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px]"><span className="text-steel">{label}</span><span className="font-medium tabular-nums text-ink">{value}</span></div>
}
