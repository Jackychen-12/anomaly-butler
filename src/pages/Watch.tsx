/** 自选页：行情列表是底，异动标在命中的那一行上。PC 三栏，手机先列表、点开看详情。 */
import { useEffect, useMemo, useState } from 'react'
import { MARKET_LABEL, STOCKS, type Market, type Stock } from '../data/case'
import { anomaliesOf, fmtDate, grade, isFresh, judgmentsOf, lastBar, type Anomaly, type Grade, type Judgment } from '../engine'
import { Button, cn, Dot, LevelDot, LevelTag, PctPill, Tag } from '../kit'
import { AnomalyBody, GradeBox, JudgmentCard, PriceChart } from '../parts'
import { useStore } from '../store'

type Row = { s: Stock; fresh: { a: Anomaly; g: Grade }[]; pending: Judgment[]; top: number }
type Filter = 'all' | Market | 'alert'

function useRows(): Row[] {
  const { tick, prevTick, prefs, holdings, weightOf } = useStore()
  return useMemo(() => STOCKS.map((s) => {
    const fresh = anomaliesOf(s.code, tick).filter((a) => isFresh(a, tick, prevTick))
      .map((a) => ({ a, g: grade(a.strength, weightOf(s.code), prefs[s.code] ?? 'normal') }))
      .sort((x, y) => y.g.score - x.g.score)
    // 这一刻刚发出的判断已经体现在新异动里，不重复计入待验证
    const pending = judgmentsOf(s.code, tick).filter((j) => j.status === 'pending' && j.issued !== tick)
    return { s, fresh, pending, top: fresh[0]?.g.score ?? (pending.length ? 1 : 0) }
    // weightOf 由 holdings 决定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tick, prevTick, holdings, prefs])
}

export function WatchPage() {
  const { code, setCode } = useStore()
  const rows = useRows()
  const [filter, setFilter] = useState<Filter>('all')
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setDesktop(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const alertCount = rows.filter((r) => r.fresh.length).length
  const shown = rows.filter((r) => filter === 'all' || (filter === 'alert' ? r.fresh.length > 0 : r.s.market === filter))
    .sort((a, b) => b.top - a.top)
  // PC 上没有选中时，默认打开最需要看的那一只
  const current = code ?? (desktop ? [...rows].sort((a, b) => b.top - a.top)[0].s.code : null)

  const list = (
    <div className="flex min-h-0 flex-col lg:border-r lg:border-hairline">
      <div className="flex items-center gap-0.5 px-3 pb-1.5 pt-3">
        {(['all', 'A', 'HK', 'US'] as Filter[]).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={cn('h-7 rounded-sm px-2.5 text-[13px] text-slate hover:bg-hover', filter === f && 'bg-hover font-medium text-ink')}>
            {f === 'all' ? `全部 ${rows.length}` : MARKET_LABEL[f as Market]}
          </button>
        ))}
        <button type="button" onClick={() => setFilter(filter === 'alert' ? 'all' : 'alert')} aria-pressed={filter === 'alert'}
          className={cn('ml-auto h-7 rounded-sm px-2.5 text-[13px] text-on-rose hover:bg-tint-rose', filter === 'alert' && 'bg-tint-rose font-medium')}>今天有新异动 {alertCount}</button>
      </div>
      <div className="grid grid-cols-[1fr_76px_72px] border-b border-hairline px-4 py-1 text-xs text-steel">
        <span>名称</span><span className="text-right">昨收</span><span className="text-right">涨跌</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {shown.map((r) => <StockRow key={r.s.code} r={r} selected={current === r.s.code} onPick={() => setCode(r.s.code)} />)}
        {shown.length === 0 ? <li className="px-4 py-8 text-sm text-steel">这一刻没有新异动。点上方的「下一天」往后看。</li> : null}
      </ul>
    </div>
  )

  if (!desktop) return current ? <Detail code={current} onBack={() => setCode(null)} /> : list
  return (
    <div className="grid h-full grid-cols-[372px_1fr]">
      {list}
      <div className="min-h-0 overflow-y-auto">{current ? <Detail code={current} /> : null}</div>
    </div>
  )
}

function StockRow({ r, selected, onPick }: { r: Row; selected: boolean; onPick: () => void }) {
  const { tick } = useStore()
  const bar = lastBar(r.s.code, tick)
  return (
    <li>
      <button type="button" onClick={onPick} aria-current={selected || undefined}
        className={cn('grid w-full grid-cols-[1fr_76px_72px] items-center border-b border-hairline-soft px-4 py-2.5 text-left hover:bg-surface-soft', selected && 'bg-surface hover:bg-surface')}>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{r.s.name}</span>
          <span className="block font-mono text-[11px] text-stone">{r.s.symbol}</span>
        </span>
        <span className="text-right text-sm tabular-nums">{bar.c.toFixed(2)}</span>
        <span className="text-right"><PctPill v={bar.p} /></span>
        {r.fresh.slice(0, 2).map(({ a, g }) => (
          <span key={a.id} className="col-span-3 mt-1.5 flex items-center gap-1.5 text-xs text-slate">
            <LevelDot level={g.level} /><b className="font-semibold text-ink">{g.level}</b><span className="truncate">{a.title}</span>
          </span>
        ))}
        {r.pending.length ? (
          <span className="col-span-3 mt-1.5 flex items-center gap-1.5 text-xs text-slate">
            <Dot tone="purple" />有 {r.pending.length} 条判断在等结果 · 最快 {Math.min(...r.pending.map((j) => j.n - j.elapsed))} 个交易日后对答案
          </span>
        ) : null}
      </button>
    </li>
  )
}

function Detail({ code, onBack }: { code: string; onBack?: () => void }) {
  const { tick, prevTick, prefs, setPage, weightOf, hasHoldings, openMe } = useStore()
  const w = weightOf(code)
  const s = STOCKS.find((x) => x.code === code)!
  const bar = lastBar(code, tick)
  const anomalies = anomaliesOf(code, tick)
  const judgments = judgmentsOf(code, tick)
  const [openId, setOpenId] = useState<string | null>(null)
  // 默认展开最新的一条；换股票或拨动时间后重新选
  useEffect(() => setOpenId(null), [code, tick])
  const open = anomalies.find((a) => a.id === openId) ?? anomalies[0]
  const focus = judgments.find((j) => j.anomaly.id === open?.id) ?? judgments.find((j) => j.status === 'pending') ?? judgments[0]
  const freshHigh = anomalies.filter((a) => isFresh(a, tick, prevTick)).length

  return (
    <div className="grid gap-0 xl:grid-cols-[1fr_340px]">
      <section className="min-w-0 px-4 py-4 lg:px-6">
        {onBack ? <Button size="xs" variant="ghost" className="-ml-2 mb-2" onClick={onBack}>← 自选</Button> : null}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight">{s.name}</h1>
          <span className="font-mono text-[13px] text-steel">{s.symbol}</span>
          <span className="text-lg font-semibold tabular-nums">{bar.c.toFixed(2)}</span>
          <PctPill v={bar.p} />
          <span className="text-xs text-steel">{fmtDate(bar.d)} 收盘 · 前复权</span>
          {freshHigh ? <Tag tone="pink" className="ml-auto">新异动 {freshHigh} 条</Tag> : null}
        </div>
        <div className="mt-3 rounded-lg border border-hairline p-3">
          <div className="mb-1 flex items-center text-xs text-steel">
            <span>近 40 个交易日收盘价</span>
            <span className="ml-auto"><span className="text-warning">▼</span> 出现异动的日子</span>
          </div>
          <PriceChart code={code} anomalies={anomalies} judgment={focus} />
        </div>

        <h2 className="eyebrow mb-1 mt-5">到现在为止的异动 · {anomalies.length} 条（点开看原因和证据）</h2>
        {anomalies.length === 0 ? <p className="rounded-lg bg-surface-soft px-4 py-6 text-sm text-steel">到这一刻为止没有异动。</p> : null}
        <ul>
          {anomalies.map((a) => {
            const g = grade(a.strength, w, prefs[code] ?? 'normal')
            const isOpen = open?.id === a.id
            return (
              <li key={a.id} className="border-t border-hairline-soft">
                <button type="button" onClick={() => setOpenId(a.id)} aria-expanded={isOpen} className="flex w-full items-start gap-3 py-2.5 text-left">
                  <LevelTag level={g.level} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm', isOpen ? 'font-semibold' : 'font-medium')}>{a.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-steel">
                      <span>{a.cat}</span><span>{a.when}</span>
                      {a.tone === 'relief' ? <span>好消息</span> : null}
                      {isFresh(a, tick, prevTick) ? <span className="font-medium text-on-rose">新</span> : null}
                    </span>
                  </span>
                </button>
                {isOpen ? <div className="mb-4 rounded-lg bg-surface-soft p-4"><AnomalyBody a={a} /></div> : null}
              </li>
            )
          })}
        </ul>
      </section>

      <aside className="border-t border-hairline bg-surface-soft px-4 py-4 xl:min-h-full xl:border-l xl:border-t-0">
        {open ? (
          <>
            <p className="eyebrow mb-2">这条异动有多重要</p>
            <GradeBox strength={open.strength} code={code} />
          </>
        ) : null}
        <p className="eyebrow mb-2 mt-5">管家怎么看</p>
        {focus ? <JudgmentCard j={focus} /> : <p className="rounded-lg border border-hairline bg-canvas px-3.5 py-4 text-[13px] text-steel">{open?.tone === 'relief' ? '这是缓解风险的消息，管家只提醒，不做涨跌判断。' : '影响还不够明确，管家先记下来，不做判断。'}</p>}
        {judgments.length > 1 ? <button type="button" onClick={() => setPage('review')} className="mt-2 text-[13px] text-link hover:underline">这只股票共有 {judgments.length} 条判断，去复盘页查看 →</button> : null}

        <p className="eyebrow mb-2 mt-5">和我的持仓有什么关系</p>
        <div className="rounded-lg border border-dashed border-hairline-strong p-3.5 text-[13px] text-slate">
          {!hasHoldings ? '你还没有告诉管家持有哪些股票。补充后，提醒会按你的仓位排序，并给出调仓的几种做法。'
            : w ? `${s.name}占你持仓的 ${(w * 100).toFixed(0)}%。${judgments.some((j) => j.status === 'pending') ? '管家对它有一条判断在等结果，可以看看有哪些做法。' : ''}`
            : `你没有持有${s.name}，不需要调仓。`}
          {hasHoldings && !w ? null : <div className="mt-2.5"><Button size="xs" variant="dark" onClick={() => openMe('holdings')}>{hasHoldings ? '看调仓方案' : '补充持仓'}</Button></div>}
        </div>
      </aside>
    </div>
  )
}
