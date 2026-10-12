/** 自选页（按股票看：发生了什么、我的仓位怎么办；表态和对答案在判断页）：左边的行情列表按今天的重要程度分组（重要、留意、轻微、平静），异动标在命中的那一行上；右边是选中股票的走势、异动和管家的判断。手机先列表、点开看详情。 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'
import { MARKET_LABEL, STOCKS, type Market, type Stock } from '../data/case'
import { anomaliesOf, fmtDate, isFresh, judgmentsOf, type Level, lastBar, stockOf, type Anomaly, type Grade, type Judgment } from '../engine'
import { Button, cn, Dot, LevelDot, LevelTag, PctPill, Tag } from '../kit'
import { AnomalyBody, GradeBox, PriceChart } from '../parts'
import { Split, useIsDesktop } from '../layout'
import { Planner } from '../planner'
import { scopeOf, signalOf } from '../data/signals'
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
        <p className="mt-0.5 text-[13px] text-steel">按股票看：发生了什么，我的仓位怎么办。</p>
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

const SCOPES = ['all', '宏观', '微观'] as const
const KIND_LABEL: Record<string, string> = { 宏观政策: '政策', 跨市场传导: '跨市场', 价量: '行情指标', 公司事件: '公司' }
/** 异动发生在哪一天：取「什么时候」开头的日期 */
const dayOf = (a: Anomaly) => a.when.match(/^\d+月\d+日/)?.[0] ?? fmtDate(a.tick ?? a.after!)

function Detail({ code, onBack }: { code: string; onBack?: () => void }) {
  const { tick, prevTick, weightOf, hasHoldings, openMe, openReview, gradeOf } = useStore()
  const w = weightOf(code)
  const s = STOCKS.find((x) => x.code === code)!
  const bar = lastBar(code, tick)
  const anomalies = anomaliesOf(code, tick)
  const judgments = judgmentsOf(code, tick)
  const [openId, setOpenId] = useState<string | null>(null)
  const [folded, setFolded] = useState(false)
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('all')
  const [all, setAll] = useState(false)
  // 默认展开最新的一条；换股票后重新选
  useEffect(() => { setOpenId(null); setFolded(false); setScope('all'); setAll(false) }, [code])
  const open = anomalies.find((a) => a.id === openId) ?? anomalies[0]
  // 选中的这条异动里，管家针对这只股票的判断（可能没有：判断落在别的股票上，或者这条异动不出判断）
  const focus = judgments.find((j) => j.anomaly.id === open?.id)
  const elsewhere = open ? open.judgments.filter((d) => d.code !== code).map((d) => stockOf(d.code).name) : []
  // 列表：新出现的放最上面（按重要程度排），之前的按日期分组，只先列最近三天
  const shown = anomalies.filter((a) => scope === 'all' || scopeOf(a.signal) === scope)
  const fresh = shown.filter((a) => isFresh(a, tick, prevTick)).sort((x, y) => gradeOf(y, code).score - gradeOf(x, code).score)
  const byDay = new Map<string, Anomaly[]>()
  for (const a of shown) if (!fresh.includes(a)) { const k = dayOf(a); byDay.set(k, [...(byDay.get(k) ?? []), a]) }
  const days = [...byDay.entries()].map(([label, items]) => ({ label, items, fresh: false }))
  const groups = [...(fresh.length ? [{ label: '今天开盘前要看的', items: fresh, fresh: true }] : []), ...(all ? days : days.slice(0, 3))]
  const hidden = all ? 0 : days.slice(3).reduce((n, d) => n + d.items.length, 0)
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

        <div className="mb-1 mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="text-[15px] font-semibold">异动 <span className="font-normal text-steel">{anomalies.length} 条</span></h3>
          <div className="ml-auto flex gap-0.5" role="group" aria-label="按类型筛选">
            {SCOPES.map((k) => {
              const n = k === 'all' ? anomalies.length : anomalies.filter((a) => scopeOf(a.signal) === k).length
              return n || k === 'all' ? (
                <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)}
                  className={cn('h-7 rounded-sm px-2.5 text-[13px] text-slate hover:bg-hover', scope === k && 'bg-hover font-medium text-ink')}>{k === 'all' ? '全部' : k} <span className="tabular-nums text-stone">{n}</span></button>
              ) : null
            })}
          </div>
        </div>
        {anomalies.length === 0 ? <p className="rounded-lg bg-surface-soft px-4 py-6 text-sm text-steel">到这一刻为止没有异动。</p> : null}
        {groups.map((g) => (
          <section key={g.label} className="mt-3">
            <h4 className="mb-1.5 flex items-center gap-2 text-xs text-steel">{g.fresh ? <span className="rounded-xs bg-tint-rose px-1.5 py-0.5 font-medium text-on-rose">新出现</span> : null}<span className={g.fresh ? '' : 'font-medium text-slate'}>{g.label}</span><span className="h-px flex-1 bg-hairline-soft" /></h4>
            <ul className="overflow-hidden rounded-lg border border-hairline">
              {g.items.map((a) => {
                const g2 = gradeOf(a, code)
                const isOpen = open?.id === a.id && !folded
                return (
                  <li key={a.id} className="border-b border-hairline-soft last:border-b-0">
                    <button type="button" onClick={() => { setFolded(open?.id === a.id ? !folded : false); setOpenId(a.id) }} aria-expanded={isOpen}
                      className={cn('flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface-soft', open?.id === a.id && 'bg-surface-soft')}>
                      <LevelTag level={g2.level} />
                      <span className="w-[52px] shrink-0 text-xs text-steel">{KIND_LABEL[a.cat] ?? a.cat}</span>
                      <span className="min-w-0 flex-1">
                        {a.indicators ? (
                          <span className="flex flex-wrap gap-1">{a.indicators.map((h) => <span key={h.id} title={signalOf(h.id)?.intro} className="rounded-xs bg-surface px-1.5 py-0.5 text-[13px] text-charcoal">{h.label}</span>)}</span>
                        ) : <span className={cn('block text-sm', isOpen ? 'font-semibold' : 'font-medium')}>{a.title}</span>}
                      </span>
                      {a.tone === 'relief' && !a.auto ? <Tag tone="green">好消息</Tag> : null}
                      {a.judgments.some((d) => d.code === code) ? <Tag tone="purple">有判断</Tag> : null}
                      <ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-stone transition-transform', isOpen && 'rotate-180')} />
                    </button>
                    {isOpen ? <div className="border-t border-hairline-soft bg-surface-soft px-4 py-4"><p className="mb-3 text-xs text-steel">{a.when}</p><AnomalyBody a={a} focus={code} /></div> : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        {hidden ? <button type="button" onClick={() => setAll(true)} className="mt-3 flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-hairline text-[13px] text-slate hover:bg-surface-soft">更早的 {hidden} 条<ChevronDown className="h-4 w-4" /></button> : null}
      </section>

      <aside className="border-t border-hairline bg-surface-soft px-4 py-4 @min-[860px]:border-l @min-[860px]:border-t-0">
        {open ? (
          <>
            <p className="eyebrow mb-2">这条异动有多重要</p>
            <GradeBox a={open} code={code} />
          </>
        ) : null}
        <p className="eyebrow mb-2 mt-5">管家对它的判断{judgments.length ? ` · ${judgments.length} 条` : ''}</p>
        {judgments.length ? (
          <ul className="overflow-hidden rounded-lg border border-hairline bg-canvas">
            {judgments.map((j) => (
              <li key={j.id} className="border-b border-hairline-soft last:border-b-0">
                <button type="button" onClick={() => openReview(j.id)} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] hover:bg-surface-soft">
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{j.up ? '看涨' : '看跌'} · {j.n} 个交易日内{j.up ? '涨过' : '跌破'} {j.line.toFixed(2)}</span><span className="block truncate text-xs text-steel">{j.anomaly.title}</span></span>
                  <span className={cn('shrink-0 text-xs', j.status === 'pending' ? 'text-on-lavender' : 'text-steel')}>{j.status === 'pending' ? `${j.n - j.elapsed} 个交易日后对答案` : j.status === 'hit' ? '说对' : j.status === 'miss' ? '说错' : '作废'}</span>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-stone" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-hairline bg-canvas px-3.5 py-3 text-[13px] text-steel">
            {open?.tone === 'relief' ? '这是缓解风险的消息，管家只提醒，不做涨跌判断。'
              : elsewhere.length ? `这件事上，管家的判断落在${elsewhere.join('、')}上，没有单独对${s.name}做判断。`
              : '影响还不够明确，管家先记下来，不做判断。'}
          </p>
        )}
        {judgments.length ? <p className="mt-1.5 text-xs text-steel">表态、对答案和复盘在判断页做。</p> : null}

        <p className="eyebrow mb-2 mt-5">我的仓位，现在怎么办</p>
        {!hasHoldings ? (
          <div className="rounded-lg border border-dashed border-hairline-strong p-3.5 text-[13px] text-slate">
            你还没有告诉管家持有哪些股票。补充后，这里会列出几种做法和各自的代价。
            <div className="mt-2.5"><Button size="xs" variant="dark" onClick={() => openMe('holdings')}>补充持仓</Button></div>
          </div>
        ) : !w ? <p className="rounded-lg border border-hairline bg-canvas px-3.5 py-3 text-[13px] text-steel">你没有持有{s.name}，不需要动。</p> : (
          <>
            <p className="text-[13px] text-charcoal">{s.name}占你持仓的 <b className="font-semibold tabular-nums">{(w * 100).toFixed(0)}%</b>。{plan ? '在这里定做法：' : '管家目前没有对它的判断在等结果或已经到价，不需要因为异动去动它。'}</p>
            {plan ? <Planner key={plan.id} j={plan} /> : null}
          </>
        )}
      </aside>
    </div>
  )
}
