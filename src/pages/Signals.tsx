/** 信号库：异动监测信息集。左边是全部信号，右边是选中信号的内容（看什么、数据、规则）、评测和积累的经验。 */
import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Download } from 'lucide-react'
import { MARKET_LABEL } from '../data/case'
import { SIGNAL_GROUPS, SIGNALS, type SignalDef } from '../data/signals'
import { evaluateSignal, fmtDate, signalsMarkdown, signed, signClass, stockOf, type SignalEval } from '../engine'
import { Button, cn, Tag } from '../kit'
import { Split, useIsDesktop } from '../layout'
import { useStore } from '../store'

const KIND: Record<SignalDef['kind'], { label: string; tone: 'green' | 'blue' | 'gray'; dot: string }> = {
  rule: { label: '已接入 · 规则自动识别', tone: 'green', dot: 'bg-down' },
  event: { label: '已接入 · 人工整理事件', tone: 'blue', dot: 'bg-link' },
  planned: { label: '规划中', tone: 'gray', dot: 'bg-hairline-strong' },
}

export function SignalsPage() {
  const { tick, lessons } = useStore()
  const desktop = useIsDesktop()
  const [sel, setSel] = useState<string | null>(null)
  const evals = useMemo(() => Object.fromEntries(SIGNALS.map((s) => [s.id, evaluateSignal(s.id, tick)])) as Record<string, SignalEval>, [tick])
  const live = SIGNALS.filter((s) => s.kind !== 'planned').length
  const current = SIGNALS.find((s) => s.id === sel) ?? (desktop ? SIGNALS[0] : undefined)
  const download = () => {
    const url = URL.createObjectURL(new Blob([signalsMarkdown(tick)], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = '异动监测信息集.md'; a.click()
    URL.revokeObjectURL(url)
  }
  const brief = (s: SignalDef) => {
    const e = evals[s.id]
    if (!e) return s.kind === 'planned' ? '' : '只提醒'
    return e.kind === 'rule' ? `触发 ${e.n} 次` : `对 ${e.hit} · 错 ${e.miss}`
  }

  const list = (
    <>
      <div className="border-b border-hairline px-4 pb-3 pt-4">
        <h1 className="text-lg font-semibold tracking-tight">信号库</h1>
        <p className="mt-0.5 text-[13px] text-steel">管家靠这些信号发现异动。共 {SIGNALS.length} 类，已接入 {live} 类。每类都写明看什么、怎样触发、历史上准不准。</p>
        <Button size="xs" className="mt-2.5" onClick={download}><Download className="h-3.5 w-3.5" />导出 Markdown</Button>
      </div>
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {SIGNAL_GROUPS.map((g) => (
          <section key={g}>
            <h2 className="eyebrow px-4 pb-1 pt-3.5">{g}</h2>
            <ul>
              {SIGNALS.filter((s) => s.group === g).map((s) => {
                const n = lessons.filter((l) => l.signal === s.id).length
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => setSel(s.id)} aria-current={current?.id === s.id || undefined}
                      className={cn('flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-surface-soft', current?.id === s.id && 'bg-surface hover:bg-surface')}>
                      <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', KIND[s.kind].dot)} />
                      <span className={cn('min-w-0 flex-1 truncate text-sm', s.kind === 'planned' ? 'text-steel' : 'font-medium')}>{s.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-steel">{brief(s)}{n ? ` · 经验 ${n}` : ''}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        <p className="px-4 pb-4 pt-3 text-xs text-stone"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-down" />规则识别　<span className="mx-1 inline-block h-2 w-2 rounded-full bg-link" />人工事件　<span className="mx-1 inline-block h-2 w-2 rounded-full bg-hairline-strong" />规划中</p>
      </div>
    </>
  )

  return <Split list={list} showDetail={!!current && (desktop || !!sel)} detail={current ? <Detail key={current.id} s={current} e={evals[current.id]} onBack={desktop ? undefined : () => setSel(null)} /> : null} />
}

function Detail({ s, e, onBack }: { s: SignalDef; e: SignalEval; onBack?: () => void }) {
  const { tick, lessons, openMe } = useStore()
  const mine = lessons.filter((l) => l.signal === s.id)
  return (
    <div className="mx-auto max-w-[860px] px-4 py-4 lg:px-8 lg:py-6">
      {onBack ? <button type="button" onClick={onBack} className="-ml-1 mb-2 flex h-8 items-center gap-1 rounded-sm px-1 text-[13px] text-slate hover:bg-hover"><ArrowLeft className="h-4 w-4" />全部信号</button> : null}
      <div className="flex flex-wrap items-center gap-1.5"><Tag>{s.group}</Tag><Tag tone={KIND[s.kind].tone}>{KIND[s.kind].label}</Tag></div>
      <h2 className="mt-2 text-[22px] font-semibold tracking-tight">{s.name}</h2>
      <p className="mt-1 text-[15px] leading-relaxed text-charcoal">{s.define}</p>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 @min-[720px]:grid-cols-2">
        <Block title="内容">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm text-charcoal">
            <dt className="text-steel">数据来源</dt><dd>{s.source}</dd>
            <dt className="text-steel">触发规则</dt><dd>{s.rule}</dd>
            <dt className="text-steel">适用市场</dt><dd>{s.markets.map((m) => MARKET_LABEL[m]).join('、')}</dd>
            <dt className="text-steel">触发后</dt><dd>{s.kind === 'planned' ? '—' : s.judges ? '管家给出判断，到期对答案' : '只提醒，不做判断'}</dd>
          </dl>
        </Block>
        <Block title={`评测 · 截至 ${fmtDate(tick)}`}>
          {!e ? <p className="text-sm text-steel">{s.kind === 'planned' ? '数据接入后才有评测。' : '只提醒、不出判断，没有可对答案的样本。'}</p> : e.kind === 'rule' ? (
            <>
              <Stat label="回测触发" value={`${e.n} 次`} />
              <Stat label="之后 5 日内又跌 5% 以上" value={e.n ? `${e.cont} 次（${Math.round((e.cont / e.n) * 100)}%）` : '—'} />
              <Stat label="触发后 5 日平均涨跌" value={e.n ? <span className={signClass(e.avg5)}>{signed(e.avg5)}%</span> : '—'} />
              <p className="mt-2 text-xs text-steel">在 8 只自选股 2025 年以来的日线上回测。样本小，只能看倾向。</p>
            </>
          ) : (
            <>
              <Stat label="已发出的判断" value={`${e.n} 条`} />
              <Stat label="说对 / 说错" value={`${e.hit} / ${e.miss}`} />
              <Stat label="作废 / 在等结果" value={`${e.void} / ${e.pending}`} />
              <p className="mt-2 text-xs text-steel">样本很少，只能看倾向。</p>
            </>
          )}
        </Block>
      </div>

      <Block title={`积累的经验 · ${mine.length} 条`} className="mt-5">
        {mine.length ? (
          <ul className="flex flex-col gap-2 text-sm text-charcoal">
            {mine.map((l) => <li key={l.id} className="flex gap-2"><span className="shrink-0 text-steel">{l.by === 'me' ? '我' : '管家'}</span><span>{l.text}<span className="ml-2 text-xs text-stone">来自{stockOf(l.code).name}那条判断</span></span></li>)}
          </ul>
        ) : <p className="text-sm text-steel">{s.kind === 'planned' ? '接入后，每次对完答案都会在这里积累经验。' : '还没有。这类信号的判断出结果后，去复盘里和管家聊一遍，经验会记到这里。'}</p>}
        {mine.length ? <button type="button" onClick={() => openMe('memory')} className="mt-2 text-[13px] text-link hover:underline">在长期记忆里管理 →</button> : null}
      </Block>

      {e?.kind === 'rule' && e.n ? (
        <Block title={`回测样本 · ${e.n} 个`} className="mt-5" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-[13px]">
              <thead><tr className="text-left text-xs text-steel [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium"><th>股票</th><th>触发日</th><th className="text-right">当日涨跌</th><th className="text-right">之后 5 日最低</th><th className="text-right">5 日后</th></tr></thead>
              <tbody className="[&_td]:border-t [&_td]:border-hairline-soft [&_td]:px-4 [&_td]:py-1.5 [&_td]:tabular-nums">
                {e.samples.map((x) => (
                  <tr key={x.code + x.d}><td>{stockOf(x.code).name}</td><td>{fmtDate(x.d)}</td>
                    <td className={cn('text-right', signClass(x.p))}>{signed(x.p)}%</td><td className={cn('text-right', signClass(x.fwdMin))}>{signed(x.fwdMin)}%</td><td className={cn('text-right', signClass(x.fwd5))}>{signed(x.fwd5)}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      ) : null}
    </div>
  )
}

function Block({ title, children, className, flush }: { title: string; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cn('overflow-hidden rounded-lg border border-hairline', className)}>
      <h3 className="eyebrow border-b border-hairline-soft bg-surface-soft px-4 py-2">{title}</h3>
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-1 text-sm"><span className="text-steel">{label}</span><span className="font-medium tabular-nums text-ink">{value}</span></div>
}
