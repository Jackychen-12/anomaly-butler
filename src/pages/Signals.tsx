/**
 * 信号库：异动监测信息集的 38 项指标。左边按宏观、微观、门槛与个人列出全部指标和接入状态；
 * 右边是选中指标的三档提醒门槛（可以逐项切换）、固定等级、可能影响、例子、误报排除、计算口径和评测。
 * 默认档位在左上角选，画像设好后会给出建议；推送时按每项所选的档位判断要不要提醒。
 */
import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Download } from 'lucide-react'
import { GROUP_LABEL, POLICIES, SIGNAL_SECTIONS, SIGNALS, TIER_HINT, TIER_LABEL, type SignalDef, type Tier } from '../data/signals'
import { evaluateSignal, fmtDate, signalsMarkdown, signed, signClass, stockOf, tierOf, type SignalEval } from '../engine'
import { Button, cn, Tag } from '../kit'
import { Split, useIsDesktop } from '../layout'
import { riskScore, riskType } from '../profile'
import { useStore } from '../store'

const TIERS: Tier[] = ['steady', 'balanced', 'aggressive']
const DOT: Record<SignalDef['kind'], string> = { rule: 'bg-down', event: 'bg-link', planned: 'bg-hairline-strong' }
const STATUS: Record<SignalDef['kind'], string> = { rule: '已接入 · 用日线计算', event: '已接入 · 人工整理事件', planned: '未接入' }

/** 开关：这项指标要不要用来提醒 */
function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', on ? 'bg-primary' : 'bg-hairline-strong')}>
      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-canvas shadow-subtle transition-[left]', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}
const toggled = (rules: { off: string[] }, id: string) => (rules.off.includes(id) ? rules.off.filter((x) => x !== id) : [...rules.off, id])

export function SignalsPage() {
  const { tick, lessons, rules, setRules, profile } = useStore()
  const desktop = useIsDesktop()
  const [sel, setSel] = useState<string | null>(null)
  const evals = useMemo(() => Object.fromEntries(SIGNALS.map((s) => [s.id, evaluateSignal(s.id, tick, rules)])) as Record<string, SignalEval>, [tick, rules])
  const live = SIGNALS.filter((s) => s.kind !== 'planned').length
  const current = SIGNALS.find((s) => s.id === sel) ?? (desktop ? SIGNALS.find((s) => s.id === 'P10') : undefined)
  // 画像的风险类型对应一个建议的默认档位；用不用由用户定
  const score = riskScore(profile)
  const suggest: Tier | null = score == null ? null : ({ 保守: 'steady', 稳健: 'balanced', 积极: 'aggressive' } as const)[riskType(score)]
  const base = rules.base ?? 'balanced'
  const download = () => {
    const url = URL.createObjectURL(new Blob([signalsMarkdown(tick)], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = '异动监测信息集.md'; a.click()
    URL.revokeObjectURL(url)
  }

  const list = (
    <>
      <div className="border-b border-hairline px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2"><h1 className="text-lg font-semibold tracking-tight">信号库</h1><Button size="xs" onClick={download}><Download className="h-3.5 w-3.5" />导出</Button></div>
        <p className="mt-0.5 text-[13px] text-steel">共 {SIGNALS.length} 项指标，已接入 {live} 项。每项都能开关，点进去看解释、选提醒档位。</p>
        <p className="mb-1 mt-3 text-xs text-steel">默认档位</p>
        <div className="flex gap-0.5 rounded-md border border-hairline-strong p-0.5" role="group" aria-label="默认提醒档位">
          {TIERS.map((t) => (
            <button key={t} type="button" aria-pressed={base === t} onClick={() => setRules({ ...rules, base: t }, `默认提醒档位改为${TIER_LABEL[t]}`)}
              className={cn('h-8 flex-1 rounded-sm text-[13px]', base === t ? 'bg-ink font-medium text-canvas' : 'text-slate hover:bg-hover')}>{TIER_LABEL[t]}</button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-steel">{suggest ? (suggest === base ? `和你的画像（${riskType(score!)}）一致。` : <>按你的画像（{riskType(score!)}），建议用{TIER_LABEL[suggest]}。<button type="button" onClick={() => setRules({ ...rules, base: suggest }, `按画像把默认档位设为${TIER_LABEL[suggest]}`)} className="ml-1 text-link hover:underline">采用</button></>) : '设好投资画像后，这里会给出建议。'}</p>
      </div>
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {SIGNAL_SECTIONS.map((sec) => (
          <div key={sec.name}>
            <h2 className="border-b border-hairline-soft bg-surface-soft px-4 py-1.5 text-xs font-semibold text-slate">{sec.name}</h2>
            {sec.groups.map((g) => (
              <section key={g}>
                <h3 className="eyebrow px-4 pb-1 pt-3">{GROUP_LABEL[g]}</h3>
                <ul>
                  {SIGNALS.filter((x) => x.group === g).map((x) => {
                    const off = rules.off.includes(x.id), own = rules.tiers?.[x.id], e = evals[x.id]
                    return (
                      <li key={x.id} className={cn('flex items-center gap-2 pr-4 hover:bg-surface-soft', current?.id === x.id && 'bg-surface hover:bg-surface')}>
                        <button type="button" onClick={() => setSel(x.id)} aria-current={current?.id === x.id || undefined}
                          className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-4 text-left">
                          <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', off ? 'bg-hairline-strong' : DOT[x.kind])} />
                          <span className="w-8 shrink-0 font-mono text-[11px] text-stone">{x.id}</span>
                          <span className={cn('min-w-0 flex-1 truncate text-sm', x.kind === 'planned' || off ? 'text-steel' : 'font-medium')}>{x.name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-steel">{off ? '' : own ? TIER_LABEL[own].slice(0, 2) : e?.kind === 'rule' ? `${e.n} 次` : e?.kind === 'event' ? `${e.n} 条` : ''}</span>
                        </button>
                        <Switch on={!off} label={`用「${x.name}」提醒我`} onChange={() => setRules({ ...rules, off: toggled(rules, x.id) }, `${off ? '重新打开' : '关掉'}了指标「${x.name}」`)} />
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        ))}
        <p className="px-4 pb-4 pt-3 text-xs text-stone"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-down" />日线计算　<span className="mx-1 inline-block h-2 w-2 rounded-full bg-link" />人工事件　<span className="mx-1 inline-block h-2 w-2 rounded-full bg-hairline-strong" />未接入</p>
      </div>
    </>
  )

  return <Split list={list} showDetail={!!current && (desktop || !!sel)} detail={current ? <Detail key={current.id} s={current} e={evals[current.id]} lessons={lessons.filter((l) => l.signal === current.id).length} onBack={desktop ? undefined : () => setSel(null)} /> : null} />
}

/** 每次触发之后 5 个交易日的涨跌：一根一次，按时间排。高矮一眼能看出这项指标触发后是继续走还是反弹 */
function FwdChart({ samples }: { samples: { code: string; d: string; p: number; fwd5: number }[] }) {
  const list = [...samples].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-40)
  const max = Math.max(5, ...list.map((x) => Math.abs(x.fwd5)))
  return (
    <div className="border-b border-hairline-soft px-4 pb-3 pt-3">
      <p className="mb-2 flex flex-wrap items-center gap-x-3 text-xs text-steel"><span>每次触发之后 5 个交易日的涨跌</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-xs bg-up" />涨</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-xs bg-down" />跌</span><span className="ml-auto tabular-nums">±{max.toFixed(0)}%</span></p>
      <div className="relative flex h-24 items-stretch gap-[3px]" role="img" aria-label={`${list.length} 次触发后 5 日涨跌的条形图`}>
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-hairline-strong" />
        {list.map((x) => (
          <span key={x.code + x.d} title={`${stockOf(x.code).name} ${fmtDate(x.d)}：当日 ${signed(x.p)}%，5 日后 ${signed(x.fwd5)}%`} className="relative min-w-[3px] max-w-[18px] flex-1">
            <span className={cn('absolute inset-x-0', x.fwd5 >= 0 ? 'bottom-1/2 rounded-t-[3px] bg-up' : 'top-1/2 rounded-b-[3px] bg-down')} style={{ height: `${Math.max(2, (Math.abs(x.fwd5) / max) * 50)}%` }} />
          </span>
        ))}
      </div>
    </div>
  )
}

function Detail({ s, e, onBack }: { s: SignalDef; e: SignalEval; lessons: number; onBack?: () => void }) {
  const { tick, rules, setRules, lessons, openMe } = useStore()
  const c = s.spec
  const tier = tierOf(s.id, rules), own = rules.tiers?.[s.id]
  const off = rules.off.includes(s.id)
  const mine = lessons.filter((l) => l.signal === s.id)
  const setTier = (t: Tier) => setRules({ ...rules, tiers: { ...rules.tiers, [s.id]: t } }, `「${s.name}」的提醒档位改为${TIER_LABEL[t]}`)
  const reset = () => { const { [s.id]: _drop, ...rest } = rules.tiers ?? {}; setRules({ ...rules, tiers: rest }, `「${s.name}」改回跟随默认档位`) }
  return (
    <div className="mx-auto max-w-[900px] px-4 py-4 lg:px-8 lg:py-6">
      {onBack ? <button type="button" onClick={onBack} className="-ml-1 mb-2 flex h-8 items-center gap-1 rounded-sm px-1 text-[13px] text-slate hover:bg-hover"><ArrowLeft className="h-4 w-4" />全部指标</button> : null}
      <div className="flex flex-wrap items-center gap-1.5"><Tag>{c.layer}</Tag><Tag tone={s.kind === 'rule' ? 'green' : s.kind === 'event' ? 'blue' : 'gray'}>{STATUS[s.kind]}</Tag>{s.need ? <span className="text-xs text-steel">{s.need}</span> : null}</div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <h2 className="text-[22px] font-semibold tracking-tight"><span className="mr-2 font-mono text-base font-normal text-stone">{s.id}</span>{s.name}</h2>
        <label className="flex shrink-0 items-center gap-2 text-[13px] text-slate">{off ? '已关闭' : '提醒我'}<Switch on={!off} label={`用「${s.name}」提醒我`} onChange={() => setRules({ ...rules, off: toggled(rules, s.id) }, `${off ? '重新打开' : '关掉'}了指标「${s.name}」`)} /></label>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-charcoal">{s.intro}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-steel"><span className="mr-1.5 text-stone">可能的影响</span>{c.impact}</p>

      <Block title="什么时候提醒我 · 三档可选" className="mt-5">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 @min-[720px]:grid-cols-3" role="group" aria-label={`${s.name}的提醒档位`}>
          {TIERS.map((t) => (
            <button key={t} type="button" aria-pressed={tier === t} onClick={() => setTier(t)}
              className={cn('rounded-lg border px-3.5 py-3 text-left transition-colors', tier === t ? 'border-primary bg-tint-lavender' : 'border-hairline hover:bg-surface-soft')}>
              <span className="flex items-baseline gap-2 text-sm font-semibold">{TIER_LABEL[t]}<span className="text-xs font-normal text-steel">{TIER_HINT[t]}</span>{tier === t ? <span className="ml-auto text-xs font-normal text-on-lavender">{own ? '已选' : '跟随默认'}</span> : null}</span>
              <span className="mt-1.5 block text-[13px] leading-relaxed text-charcoal">{c[t]}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
          {off ? <span className="text-steel">这项已关闭，不会用它提醒你。</span> : null}
          {own ? <button type="button" onClick={reset} className="text-link hover:underline">改回跟随默认档位</button> : null}
          {s.kind === 'planned' ? <span className="text-steel">这项还没接入数据，档位先记下，接入后生效。</span> : null}
        </div>
      </Block>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 @min-[720px]:grid-cols-2">
        <Block title="异动等级 · 不随档位变"><p className="text-sm leading-relaxed text-charcoal">{c.levels}</p></Block>
        <Block title={`评测 · 截至 ${fmtDate(tick)}`}>
          {!e ? <p className="text-sm text-steel">{s.need ?? '接入数据后才有评测。'}</p> : e.kind === 'rule' ? (
            <>
              <Stat label={`按${TIER_LABEL[tier]}门槛回测触发`} value={`${e.n} 次`} />
              <Stat label="之后 5 日同方向再走 5% 以上" value={e.n ? `${e.cont} 次（${Math.round((e.cont / e.n) * 100)}%）` : '—'} />
              <Stat label="触发后 5 日平均涨跌" value={e.n ? <span className={signClass(e.avg5)}>{signed(e.avg5)}%</span> : '—'} />
              <p className="mt-2 text-xs text-steel">8 只自选股 2025 年以来的日线。阈值未校准，样本小。</p>
            </>
          ) : (
            <>
              <Stat label="已发出的判断" value={`${e.n} 条`} />
              <Stat label="说对 / 说错" value={`${e.hit} / ${e.miss}`} />
              <Stat label="作废 / 在等结果" value={`${e.void} / ${e.pending}`} />
            </>
          )}
        </Block>
        <Block title="例子（合成）"><p className="text-sm leading-relaxed text-charcoal">{c.example}</p></Block>
        <Block title="反例与误报排除"><p className="text-sm leading-relaxed text-charcoal">{c.exclude}</p></Block>
      </div>

      <Block title="怎么算的" className="mt-5">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm text-charcoal">
          <dt className="text-steel">输入</dt><dd>{c.inputs}</dd>
          <dt className="text-steel">公式</dt><dd>{c.formula}</dd>
          <dt className="text-steel">数据</dt><dd>{c.source}</dd>
          {s.kind === 'rule' && s.id !== 'I03' ? <><dt className="text-steel">演示口径</dt><dd>只有日线，按收盘后的全日数据计算；表里的分钟级条件（如连续 2 次分钟快照）没有用到。</dd></> : null}
          {s.id === 'I03' ? <><dt className="text-steel">演示口径</dt><dd>用美股龙头隔夜涨跌幅触发，映射关系人工指定（目前只有苹果 → 立讯精密、小米），占比未核实。</dd></> : null}
        </dl>
      </Block>

      {s.id === 'M03' ? (
        <Block title="八类政策" className="mt-5" flush>
          <ul>{POLICIES.map((p) => <li key={p.id} className="border-b border-hairline-soft px-4 py-2.5 text-sm last:border-b-0"><p className="font-medium">{p.name}<span className="ml-2 font-mono text-[11px] font-normal text-stone">{p.id}</span></p><p className="mt-0.5 text-[13px] text-slate">{p.trigger}</p></li>)}</ul>
        </Block>
      ) : null}

      {mine.length ? (
        <Block title={`积累的经验 · ${mine.length} 条`} className="mt-5">
          <ul className="flex flex-col gap-2 text-sm text-charcoal">{mine.map((l) => <li key={l.id} className="flex gap-2"><span className="shrink-0 text-steel">{l.by === 'me' ? '我' : '管家'}</span><span>{l.text}</span></li>)}</ul>
          <button type="button" onClick={() => openMe('memory')} className="mt-2 text-[13px] text-link hover:underline">在长期记忆里管理 →</button>
        </Block>
      ) : null}

      {e?.kind === 'rule' && e.n ? (
        <Block title={`回测样本 · ${e.n} 个`} className="mt-5" flush>
          <FwdChart samples={e.samples} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-[13px]">
              <thead><tr className="text-left text-xs text-steel [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium"><th>股票</th><th>触发日</th><th className="text-right">当日涨跌</th><th className="text-right">之后 5 日同方向最远</th><th className="text-right">5 日后</th></tr></thead>
              <tbody className="[&_td]:border-t [&_td]:border-hairline-soft [&_td]:px-4 [&_td]:py-1.5 [&_td]:tabular-nums">
                {e.samples.slice(0, 30).map((x) => (
                  <tr key={x.code + x.d}><td>{stockOf(x.code).name}</td><td>{fmtDate(x.d)}</td>
                    <td className={cn('text-right', signClass(x.p))}>{signed(x.p)}%</td><td className={cn('text-right', signClass(x.ext))}>{signed(x.ext)}%</td><td className={cn('text-right', signClass(x.fwd5))}>{signed(x.fwd5)}%</td></tr>
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
