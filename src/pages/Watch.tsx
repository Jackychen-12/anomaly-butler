/** 自选页：左边的行情列表按今天的重要程度分组（重要、留意、轻微、平静），异动标在命中的那一行上；右边是选中股票的走势、异动和管家的判断。手机先列表、点开看详情。 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { MARKET_LABEL, STOCKS, type Market, type Stock } from '../data/case'
import { anomaliesOf, fmtDate, isFresh, judgmentsOf, type Level, lastBar, stockOf, type Anomaly, type Grade, type Judgment } from '../engine'
import { Button, cn, Dot, LevelDot, LevelTag, PctPill, Tag } from '../kit'
import { AnomalyBody, GradeBox, JudgmentCard, PriceChart } from '../parts'
import { Split, useIsDesktop } from '../layout'
import { Planner } from '../planner'
import { useStore } from '../store'

type Row = { s: Stock; fresh: { a: Anomaly; g: Grade }[]; pending: Judgment[]; top: number }
type Filter = 'all' | Market | 'alert'

function useRows(): Row[] {
  const { tick, prevTick, prefs, holdings, profile, gradeOf } = useStore()
  return useMemo(() => STOCKS.map((s) => {
    const fresh = anomaliesOf(s.code, tick).filter((a) => isFresh(a, tick, prevTick))
      .map((a) => ({ a, g: gradeOf(a, s.code) }))
      .sort((x, y) => y.g.score - x.g.score)
    // 这一刻刚发出的判断已经体现在新异动里，不重复计入待验证
    const pending = judgmentsOf(s.code, tick).filter((j) => j.status === 'pending' && j.issued !== tick)
    return { s, fresh, pending, top: fresh[0]?.g.score ?? (pending.length ? 1 : 0) }
    // gradeOf 由 holdings、prefs、profile 决定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tick, prevTick, holdings, prefs, profile])
}

export function WatchPage() {
  const { code, setCode } = useStore()
  const rows = useRows()
  const [filter, setFilter] = useState<Filter>('all')
  const desktop = useIsDesktop()

  const alertCount = rows.filter((r) => r.fresh.length).length
  const shown = rows.filter((r) => filter === 'all' || (filter === 'alert' ? r.fresh.length > 0 : r.s.market === filter))
    .sort((a, b) => b.top - a.top)
  // PC 上没有选中时，默认打开最需要看的那一只
  const current = code ?? (desktop ? [...rows].sort((a, b) => b.top - a.top)[0].s.code : null)

  const list = (
    <>
      <div className="px-4 pb-1 pt-4">
        <h1 className="text-lg font-semibold tracking-tight">自选</h1>
      </div>
      <div className="flex items-center gap-0.5 px-3 pb-1.5 pt-1.5">
        {(['all', 'A', 'HK', 'US'] as Filter[]).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={cn('h-7 rounded-sm px-2.5 text-[13px] text-slate hover:bg-hover', filter === f && 'bg-hover font-medium text-ink')}>
            {f === 'all' ? '全部' : MARKET_LABEL[f as Market]}
          </button>
        ))}
        <button type="button" onClick={() => setFilter(filter === 'alert' ? 'all' : 'alert')} aria-pressed={filter === 'alert'}
          className={cn('ml-auto h-7 rounded-sm px-2.5 text-[13px] text-on-rose hover:bg-tint-rose', filter === 'alert' && 'bg-tint-rose font-medium')}>新异动 {alertCount}</button>
      </div>
      <div className="grid grid-cols-[1fr_76px_72px] border-b border-hairline px-4 py-1 text-xs text-steel">
        <span>名称</span><span className="text-right">昨收</span><span className="text-right">涨跌</span>
      </div>
      <ul className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {GROUPS.map((g) => {
          const list = shown.filter((r) => groupOf(r) === g.key)
          return list.length ? (
            <li key={g.key}>
              <h2 className="flex items-center gap-2 bg-surface-soft px-4 py-1.5 text-xs font-medium text-slate">{g.dot ? <LevelDot level={g.dot} /> : null}{g.label}<span className="font-normal text-stone">{list.length} 只 · {g.hint}</span></h2>
              <ul>{list.map((r) => <StockRow key={r.s.code} r={r} selected={current === r.s.code} onPick={() => setCode(r.s.code)} />)}</ul>
            </li>
          ) : null
        })}
        {shown.length === 0 ? <li className="px-4 py-8 text-sm text-steel">今天没有新异动。</li> : null}
      </ul>
    </>
  )

  return <Split list={list} showDetail={!!current} detail={current ? <Detail code={current} onBack={desktop ? undefined : () => setCode(null)} /> : null} />
}

/** 按今天最高的异动等级把自选股分成四组 */
const GROUPS: { key: Level | 'calm'; label: string; hint: string; dot?: Level }[] = [
  { key: '高', label: '重要', hint: '今天先看', dot: '高' }, { key: '中', label: '留意', hint: '有空看', dot: '中' },
  { key: '低', label: '轻微', hint: '知道就行', dot: '低' }, { key: 'calm', label: '平静', hint: '今天没有新异动' },
]
const groupOf = (r: Row): Level | 'calm' => r.fresh[0]?.g.level ?? 'calm'

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
            <LevelDot level={g.level} /><b className="font-semibold text-ink">{g.level}</b><span className="truncate">{a.indicators ? a.indicators.map((h) => h.label).join(' · ') : a.title}</span>
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
  const { tick, prevTick, weightOf, hasHoldings, openMe, openReview, gradeOf } = useStore()
  const w = weightOf(code)
  const s = STOCKS.find((x) => x.code === code)!
  const bar = lastBar(code, tick)
  const anomalies = anomaliesOf(code, tick)
  const judgments = judgmentsOf(code, tick)
  const [openId, setOpenId] = useState<string | null>(null)
  // 默认展开最新的一条；换股票后重新选
  useEffect(() => setOpenId(null), [code])
  const open = anomalies.find((a) => a.id === openId) ?? anomalies[0]
  // 选中的这条异动里，管家针对这只股票的判断（可能没有：判断落在别的股票上，或者这条异动不出判断）
  const focus = judgments.find((j) => j.anomaly.id === open?.id)
  const others = judgments.filter((j) => j.id !== focus?.id)
  const elsewhere = open ? open.judgments.filter((d) => d.code !== code).map((d) => stockOf(d.code).name) : []
  // 持有这只股票时，直接在这里列出调仓做法：优先用选中异动的判断，其次是在等结果的、已经到价的
  const actionable = (j: Judgment) => j.status === 'pending' || j.status === 'hit'
  const plan = w ? [focus, ...judgments].find((j): j is Judgment => !!j && actionable(j)) : undefined
  const freshHigh = anomalies.filter((a) => isFresh(a, tick, prevTick)).length

  return (
    <div className="grid min-h-full grid-cols-[minmax(0,1fr)] gap-0 @min-[860px]:grid-cols-[minmax(0,1fr)_348px]">
      <section className="min-w-0 px-4 py-4 lg:px-6 lg:py-5">
        {onBack ? <button type="button" onClick={onBack} className="-ml-1 mb-2 flex h-8 items-center gap-1 rounded-sm px-1 text-[13px] text-slate hover:bg-hover"><ArrowLeft className="h-4 w-4" />自选</button> : null}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[22px] font-semibold tracking-tight">{s.name}</h2>
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
          <PriceChart code={code} anomalies={anomalies} judgment={focus ?? judgments.find((j) => j.status === 'pending')} />
        </div>

        <h3 className="eyebrow mb-1 mt-5">到现在为止的异动 · {anomalies.length} 条（点开看原因和证据）</h3>
        {anomalies.length === 0 ? <p className="rounded-lg bg-surface-soft px-4 py-6 text-sm text-steel">到这一刻为止没有异动。</p> : null}
        <ul>
          {anomalies.map((a) => {
            const g = gradeOf(a, code)
            const isOpen = open?.id === a.id
            return (
              <li key={a.id} className="border-t border-hairline-soft">
                <button type="button" onClick={() => setOpenId(a.id)} aria-expanded={isOpen} className="flex w-full items-start gap-3 py-2.5 text-left">
                  <LevelTag level={g.level} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm', isOpen ? 'font-semibold' : 'font-medium')}>{a.indicators ? a.indicators.map((h) => h.label).join(' · ') : a.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-steel">
                      <span>{a.cat}</span><span>{a.when}</span>
                      {a.tone === 'relief' && !a.auto ? <span>好消息</span> : null}
                      {isFresh(a, tick, prevTick) ? <span className="font-medium text-on-rose">新</span> : null}
                    </span>
                  </span>
                </button>
                {isOpen ? <div className="mb-4 rounded-lg bg-surface-soft p-4"><AnomalyBody a={a} focus={code} /></div> : null}
              </li>
            )
          })}
        </ul>
      </section>

      <aside className="border-t border-hairline bg-surface-soft px-4 py-4 @min-[860px]:border-l @min-[860px]:border-t-0">
        {open ? (
          <>
            <p className="eyebrow mb-2">这条异动有多重要</p>
            <GradeBox a={open} code={code} />
          </>
        ) : null}
        <p className="eyebrow mb-2 mt-5">管家怎么看</p>
        {focus ? <JudgmentCard j={focus} /> : (
          <p className="rounded-lg border border-hairline bg-canvas px-3.5 py-4 text-[13px] text-steel">
            {open?.tone === 'relief' ? '这是缓解风险的消息，管家只提醒，不做涨跌判断。'
              : elsewhere.length ? `这件事上，管家的判断落在${elsewhere.join('、')}上，没有单独对${s.name}做判断。`
              : '影响还不够明确，管家先记下来，不做判断。'}
          </p>
        )}
        {others.length ? (
          <>
            <p className="eyebrow mb-2 mt-5">这只股票的其他判断 · {others.length} 条</p>
            <ul className="overflow-hidden rounded-lg border border-hairline bg-canvas">
              {others.map((j) => (
                <li key={j.id} className="border-b border-hairline-soft last:border-b-0">
                  <button type="button" onClick={() => openReview(j.id)} className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] hover:bg-surface-soft">
                    <span className="min-w-0 flex-1 truncate">{j.anomaly.title}</span>
                    <span className="shrink-0 text-xs text-steel">{j.status === 'pending' ? `${j.n - j.elapsed} 个交易日后对答案` : j.status === 'hit' ? '说对' : j.status === 'miss' ? '说错' : '作废'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <p className="eyebrow mb-2 mt-5">和我的持仓有什么关系</p>
        {!hasHoldings ? (
          <div className="rounded-lg border border-dashed border-hairline-strong p-3.5 text-[13px] text-slate">
            你还没有告诉管家持有哪些股票。补充后，提醒会按你的仓位排序，并在这里给出调仓的几种做法。
            <div className="mt-2.5"><Button size="xs" variant="dark" onClick={() => openMe('holdings')}>补充持仓</Button></div>
          </div>
        ) : !w ? <p className="rounded-lg border border-hairline bg-canvas px-3.5 py-3 text-[13px] text-steel">你没有持有{s.name}，不需要调仓。</p> : (
          <>
            <p className="text-[13px] text-charcoal">{s.name}占你持仓的 <b className="font-semibold tabular-nums">{(w * 100).toFixed(0)}%</b>。{plan ? '下面是几种做法和各自的代价，决定由你做。' : '管家目前没有对它的判断在等结果或已经到价，不需要因为异动调仓。'}</p>
            {plan ? <div className="[&>div]:bg-canvas"><Planner key={plan.id} j={plan} /></div> : null}
          </>
        )}
      </aside>
    </div>
  )
}
