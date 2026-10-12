/**
 * 信号库：管家靠什么判断「这是异动」。左边按宏观、微观列出全部信号；右边是选中信号的判断逻辑、评测和积累的经验。
 * 行情指标类信号的阈值可以调（比如量比到多少才算放量），评测会跟着重算；每个已接入的信号都可以关掉。
 */
import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Download } from 'lucide-react'
import { MARKET_LABEL } from '../data/case'
import { GROUP_LABEL, SIGNAL_SECTIONS, SIGNALS, type SignalDef } from '../data/signals'
import { DEFAULT_RULES, evaluateSignal, HAS_TURNOVER, fmtDate, signalsMarkdown, signed, signClass, stockOf, suggestions, type Rules, type SignalEval } from '../engine'
import { Button, cn, Tag } from '../kit'
import { Split, useIsDesktop } from '../layout'
import { useStore } from '../store'

const KIND: Record<SignalDef['kind'], { label: string; tone: 'green' | 'blue' | 'gray'; dot: string }> = {
  rule: { label: '已接入 · 规则自动识别', tone: 'green', dot: 'bg-down' },
  event: { label: '已接入 · 人工整理事件', tone: 'blue', dot: 'bg-link' },
  planned: { label: '规划中', tone: 'gray', dot: 'bg-hairline-strong' },
}

export function SignalsPage() {
  const { tick, lessons, rules, agent } = useStore()
  const desktop = useIsDesktop()
  const [sel, setSel] = useState<string | null>(null)
  // 评测跟着规则重算
  const evals = useMemo(() => Object.fromEntries(SIGNALS.map((s) => [s.id, evaluateSignal(s.id, tick, rules)])) as Record<string, SignalEval>, [tick, rules])
  const tips = useMemo(() => (agent.tune ? suggestions(tick) : []), [tick, rules, agent.tune]) // eslint-disable-line react-hooks/exhaustive-deps
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
    if (s.id === 'turnover' && !HAS_TURNOVER) return '缺数据'
    if (!e) return s.kind === 'planned' ? '' : '只提醒'
    return e.kind === 'rule' ? `触发 ${e.n} 次` : `对 ${e.hit} · 错 ${e.miss}`
  }

  const list = (
    <>
      <div className="border-b border-hairline px-4 pb-3 pt-4">
        <h1 className="text-lg font-semibold tracking-tight">信号库</h1>
        <p className="mt-0.5 text-[13px] text-steel">管家靠这些规则判断「这是异动」。共 {SIGNALS.length} 类，已接入 {live} 类；行情指标的阈值可以自己调。</p>
        <Button size="xs" className="mt-2.5" onClick={download}><Download className="h-3.5 w-3.5" />导出 Markdown</Button>
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
                    const n = lessons.filter((l) => l.signal === x.id).length
                    const off = rules.off.includes(x.id)
                    return (
                      <li key={x.id}>
                        <button type="button" onClick={() => setSel(x.id)} aria-current={current?.id === x.id || undefined}
                          className={cn('flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-surface-soft', current?.id === x.id && 'bg-surface hover:bg-surface')}>
                          <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', off ? 'bg-hairline-strong' : KIND[x.kind].dot)} />
                          <span className={cn('min-w-0 flex-1 truncate text-sm', x.kind === 'planned' || off ? 'text-steel' : 'font-medium')}>{x.name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-steel">{off ? '已关掉' : brief(x)}{tips.some((t) => t.signal === x.id) ? ' · 有建议' : n ? ` · 经验 ${n}` : ''}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        ))}
        <p className="px-4 pb-4 pt-3 text-xs text-stone"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-down" />规则识别　<span className="mx-1 inline-block h-2 w-2 rounded-full bg-link" />人工事件　<span className="mx-1 inline-block h-2 w-2 rounded-full bg-hairline-strong" />规划中</p>
      </div>
    </>
  )

  return <Split list={list} showDetail={!!current && (desktop || !!sel)} detail={current ? <Detail key={current.id} s={current} e={evals[current.id]} onBack={desktop ? undefined : () => setSel(null)} /> : null} />
}

/** 每个可调阈值的说明：句子的前后半句、取值范围，或固定的几个选项 */
const PARAM: Record<NonNullable<SignalDef['param']>, { before: string; after: string; min?: number; max?: number; step?: number; options?: number[] }> = {
  pct: { before: '单日涨跌幅达到', after: '% 才算', min: 3, max: 15, step: 0.5 },
  vol: { before: '量比达到', after: '才算放量', min: 1.2, max: 5, step: 0.1 },
  ma: { before: '收盘价跌破', after: '日均线', options: [5, 10, 20] },
  turnover: { before: '换手率达到', after: '% 才算', min: 1, max: 20, step: 0.5 },
  streak: { before: '连续下跌', after: '天才算', min: 2, max: 6, step: 1 },
  low: { before: '收盘价创近', after: '个交易日新低或新高', options: [10, 20, 60] },
  cross: { before: '美股龙头单日涨跌幅达到', after: '% 才提醒', min: 3, max: 12, step: 0.5 },
}

/** 判断逻辑：一句带着可调数字的话 + 开关。改动立即生效，评测跟着重算 */
function Logic({ s }: { s: SignalDef }) {
  const { rules, setRules, tick } = useStore()
  const off = rules.off.includes(s.id)
  const toggle = () => setRules({ ...rules, off: off ? rules.off.filter((x) => x !== s.id) : [...rules.off, s.id] }, `${off ? '重新打开' : '关掉'}了信号「${s.name}」`)
  const key = s.param
  const meta = key ? PARAM[key] : null
  const value = key ? rules[key] : 0
  const set = (v: number) => { if (key && v !== value) setRules({ ...rules, [key]: v } as Rules, `「${s.name}」的阈值从 ${value} 改为 ${v}`) }
  const changed = key ? value !== DEFAULT_RULES[key] : false
  const base = key && changed ? evaluateSignal(s.id, tick, { ...rules, [key]: DEFAULT_RULES[key] } as Rules) : null
  return (
    <Block title="判断逻辑" className="mt-5">
      <p className="text-sm text-charcoal">{s.rule}</p>
      {meta && key ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-md bg-surface px-3 py-2.5 text-[15px]">
          <span>{meta.before}</span>
          {meta.options ? (
            <span className="flex gap-0.5 rounded-md border border-hairline-strong bg-canvas p-0.5" role="group" aria-label={`${s.name}的阈值`}>
              {meta.options.map((o) => <button key={o} type="button" aria-pressed={value === o} onClick={() => set(o)} className={cn('h-7 min-w-9 rounded-sm px-2 text-sm tabular-nums', value === o ? 'bg-ink font-medium text-canvas' : 'text-slate hover:bg-hover')}>{o}</button>)}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <input type="range" min={meta.min} max={meta.max} step={meta.step} value={value} onChange={(e) => set(Number(e.target.value))} aria-label={`${s.name}的阈值`} className="w-36 accent-[var(--primary)]" />
              <b className="min-w-10 text-center text-lg font-semibold tabular-nums">{value}</b>
            </span>
          )}
          <span>{meta.after}</span>
          {changed ? <Button size="xs" variant="ghost" onClick={() => set(DEFAULT_RULES[key])}>恢复默认（{DEFAULT_RULES[key]}）</Button> : null}
        </div>
      ) : s.kind === 'event' ? <p className="mt-2 text-[13px] text-steel">这类信号由人工整理的事件触发，没有可调的阈值。</p> : null}
      {s.id === 'turnover' && !HAS_TURNOVER ? <p className="mt-2 text-[13px] text-warning">这次没有取到换手率数据，这个信号暂时不会触发。</p> : null}
      {base?.kind === 'rule' ? <p className="mt-2 text-[13px] text-steel">默认设置（{DEFAULT_RULES[key!]}）下触发 {base.n} 次，其中 {base.cont} 次之后延续；你的设置见右侧评测。</p> : null}
      {s.kind === 'planned' ? null : (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!off} onChange={toggle} className="h-4 w-4 accent-[var(--primary)]" />
          用这个信号提醒我{off ? <span className="text-steel">（已关掉：不再出现在今日和自选里）</span> : null}
        </label>
      )}
    </Block>
  )
}

/** 管家的建议：它试了别的阈值，发现历史上更准的，提出来由用户决定 */
function Advice({ s }: { s: SignalDef }) {
  const { tick, rules, setRules, agent } = useStore()
  const t = agent.tune ? suggestions(tick).find((x) => x.signal === s.id) : undefined
  if (!t) return null
  const pctOf = (r: number) => `${Math.round(r * 100)}%`
  return (
    <div className="mt-5 rounded-lg bg-tint-lavender px-4 py-3 text-sm text-on-lavender">
      <p className="font-semibold">管家的建议</p>
      <p className="mt-1">我试了几个阈值：现在是 {t.from}，触发 {t.now.n} 次，其中 {pctOf(t.now.rate)} 之后同方向又走了 5% 以上；改成 {t.to} 的话，触发 {t.then.n} 次，这个比例是 {pctOf(t.then.rate)}。样本不多，仅供参考。</p>
      <Button size="xs" variant="dark" className="mt-2" onClick={() => setRules({ ...rules, [t.param]: t.to } as Rules, `采纳管家建议：「${s.name}」的阈值从 ${t.from} 改为 ${t.to}`)}>改成 {t.to}</Button>
    </div>
  )
}

function Detail({ s, e, onBack }: { s: SignalDef; e: SignalEval; onBack?: () => void }) {
  const { tick, lessons, openMe } = useStore()
  const mine = lessons.filter((l) => l.signal === s.id)
  return (
    <div className="mx-auto max-w-[860px] px-4 py-4 lg:px-8 lg:py-6">
      {onBack ? <button type="button" onClick={onBack} className="-ml-1 mb-2 flex h-8 items-center gap-1 rounded-sm px-1 text-[13px] text-slate hover:bg-hover"><ArrowLeft className="h-4 w-4" />全部信号</button> : null}
      <div className="flex flex-wrap items-center gap-1.5"><Tag>{GROUP_LABEL[s.group]}</Tag><Tag tone={KIND[s.kind].tone}>{KIND[s.kind].label}</Tag></div>
      <h2 className="mt-2 text-[22px] font-semibold tracking-tight">{s.name}</h2>
      <p className="mt-1 text-[15px] leading-relaxed text-charcoal">{s.define}</p>

      <Advice s={s} />
      <Logic s={s} />

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 @min-[720px]:grid-cols-2">
        <Block title="数据与范围">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm text-charcoal">
            <dt className="text-steel">数据来源</dt><dd>{s.source}</dd>
            <dt className="text-steel">适用市场</dt><dd>{s.markets.map((m) => MARKET_LABEL[m]).join('、')}</dd>
            <dt className="text-steel">触发后</dt><dd>{s.kind === 'planned' ? '—' : s.judges ? '管家给出判断，到期对答案' : '只提醒，不做判断'}</dd>
          </dl>
        </Block>
        <Block title={`评测 · 截至 ${fmtDate(tick)}`}>
          {!e ? <p className="text-sm text-steel">{s.kind === 'planned' ? '数据接入后才有评测。' : '只提醒、不出判断，没有可对答案的样本。'}</p> : e.kind === 'rule' ? (
            <>
              <Stat label="回测触发" value={`${e.n} 次`} />
              <Stat label={`之后 5 日内${s.dir === 'down' ? '又跌' : s.dir === 'up' ? '又涨' : '同方向再走'} 5% 以上`} value={e.n ? `${e.cont} 次（${Math.round((e.cont / e.n) * 100)}%）` : '—'} />
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
              <thead><tr className="text-left text-xs text-steel [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium"><th>股票</th><th>触发日</th><th className="text-right">当日涨跌</th><th className="text-right">{s.dir === 'down' ? '之后 5 日最低' : s.dir === 'up' ? '之后 5 日最高' : '之后 5 日同方向最远'}</th><th className="text-right">5 日后</th></tr></thead>
              <tbody className="[&_td]:border-t [&_td]:border-hairline-soft [&_td]:px-4 [&_td]:py-1.5 [&_td]:tabular-nums">
                {e.samples.map((x) => (
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
