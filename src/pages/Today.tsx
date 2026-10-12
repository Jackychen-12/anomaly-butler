/**
 * 今日：先用图看全局（自选变化、板块变化），再看今天的事。每件事只留标题、受影响的股票和管家的判断，细节点开再看。
 * 右边是提问栏，窄屏时收进底部输入条。
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown, MessageCircle } from 'lucide-react'
import { AskPanel, useGo } from '../ask'
import { DivergingBars, JudgmentMeter, type BarRow } from '../charts'
import { STOCKS } from '../data/case'
import { anomaliesAt, changeOver, fmtDate, isFresh, judgmentsAt, recentlySettled, sectorRows, signed, stockOf, weekday, whyLine, type Anomaly, type Judgment, type Level } from '../engine'
import { Button, cn, LevelTag, Stamp, Tag } from '../kit'
import { Sheet, useIsWide, WithRail } from '../layout'
import { VoteButtons } from '../parts'
import { meaning } from '../profile'
import { nudges } from '../proactive'
import { priorLessons } from '../review'
import { useStore } from '../store'

export function TodayPage() {
  const st = useStore()
  const { tick, prevTick, votes, prefs, holdings, hasHoldings, gradeOf, reviewState, profile } = st
  const go = useGo()
  const wide = useIsWide()
  const [sheet, setSheet] = useState(false)

  const fresh = anomaliesAt(tick).filter((a) => isFresh(a, tick, prevTick))
  const events = fresh.filter((a) => !a.auto)
  const moves = fresh.filter((a) => a.auto)
  const js = judgmentsAt(tick)
  const recent = recentlySettled(tick)
  const waiting = js.filter((j) => j.status === 'pending' && j.issued !== tick)
  const tips = nudges({ tick, prevTick, votes, prefs, holdings, hasHoldings, reviewState, profile }).slice(0, 2)
  // 一件事的等级取它影响到的自选里最高的那个
  const levelOf = (a: Anomaly) => a.hits.map((h) => gradeOf(a, h)).sort((x, y) => y.score - x.score)[0]
  const sorted = [...events].sort((a, b) => levelOf(b).score - levelOf(a).score)
  const count = events.length + (moves.length ? 1 : 0)
  // 每只股票今天最高的异动等级，用来在图上打点
  const dotOf = (code: string): Level | null => fresh.filter((a) => a.hits.includes(code)).map((a) => gradeOf(a, code)).sort((x, y) => y.score - x.score)[0]?.level ?? null

  const rail = wide ? (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="shrink-0 border-b border-hairline px-4 py-3 text-sm font-semibold">问管家</h2>
      <div className="min-h-0 flex-1"><AskPanel /></div>
    </div>
  ) : null

  return (
    <>
      <WithRail hideRailBelowXl rail={rail} railClassName="xl:overflow-hidden">
        <div className="mx-auto max-w-[840px] px-4 py-5 lg:px-8 lg:py-7">
          <p className="text-[13px] text-steel">{fmtDate(tick)} {weekday(tick)} · 开盘前</p>
          <h1 className="mt-0.5 text-2xl font-semibold leading-tight tracking-tight">{count ? `今天有 ${count} 件事和你的自选有关` : '今天没有新的事需要你看'}</h1>

          <Overview dotOf={dotOf} />

          {tips.length ? (
            <ul className="mt-4 overflow-hidden rounded-lg bg-tint-lavender text-on-lavender" aria-label="管家想提醒你">
              {tips.map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-b border-white/50 px-3.5 py-2 text-[13px] last:border-b-0">
                  <span className="min-w-0 flex-1">{t.text}</span>
                  {t.action ? <button type="button" onClick={() => go(t.action!)} className="shrink-0 whitespace-nowrap font-medium underline underline-offset-2">{t.action.label}</button> : null}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-col gap-3">
            {sorted.map((a) => <EventCard key={a.id} a={a} level={levelOf(a).level} judgments={js.filter((j) => j.anomaly.id === a.id)} />)}
            {moves.length ? <MovesCard moves={moves} judgments={js} /> : null}
          </div>

          {waiting.length ? <Section title="在等结果"><Rows list={waiting} /></Section> : null}
          {recent.length ? (
            <Section title="最近有结果" action={<Button size="xs" variant="ghost" onClick={() => st.setPage('review')}>全部 →</Button>}><Rows list={recent.slice(0, 5)} /></Section>
          ) : null}
        </div>

        {wide ? null : (
          <div className="sticky bottom-0 border-t border-hairline bg-canvas px-4 py-2">
            <button type="button" onClick={() => setSheet(true)} className="flex h-10 w-full items-center gap-2 rounded-md border border-hairline-strong px-3 text-left text-sm text-stone hover:bg-surface-soft">
              <MessageCircle className="h-4 w-4 shrink-0 text-steel" />问问管家
            </button>
          </div>
        )}
      </WithRail>
      {sheet && !wide ? <Sheet title="问管家" tall onClose={() => setSheet(false)}><AskPanel autoFocus onNavigate={() => setSheet(false)} /></Sheet> : null}
    </>
  )
}

/** 两张图看全局：每只自选股的涨跌，和按板块汇总的涨跌（有持仓时加上仓位和对总资产的影响）。 */
function Overview({ dotOf }: { dotOf: (code: string) => Level | null }) {
  const { tick, holdings, hasHoldings, openStock, openMe } = useStore()
  const [n, setN] = useState<1 | 5>(1)
  // 手机上两张图一次只显示一张
  const [view, setView] = useState<'stock' | 'sector'>('stock')
  const period = n === 1 ? '上一个交易日' : '近 5 个交易日'
  const stocks: BarRow[] = STOCKS.map((s) => ({ s, v: changeOver(s.code, tick, n) })).sort((a, b) => a.v - b.v).map(({ s, v }) => ({
    key: s.code, label: s.name.replace('-W', ''), value: v, dot: dotOf(s.code), onClick: () => openStock(s.code),
    tip: `${s.name}（${s.sector}）${period} ${signed(v)}%${dotOf(s.code) ? '，今天有新异动' : ''}${holdings[s.code] ? `，占你持仓 ${Math.round(holdings[s.code] * 100)}%` : ''}`,
  }))
  const sectors = sectorRows(tick, n, holdings)
  const total = sectors.reduce((a, r) => a + r.impact, 0)
  const sectorBars: BarRow[] = sectors.map((r) => ({
    key: r.sector, label: r.sector, sub: r.codes.map((c) => stockOf(c).name.replace('-W', '').replace(/(集团|控股|精密|时代|茅台)$/, '')).join(' '), value: r.change,
    dot: r.codes.map(dotOf).sort((a, b) => '高中低'.indexOf(a ?? '低') - '高中低'.indexOf(b ?? '低'))[0] ?? null,
    note: hasHoldings ? (r.weight ? `你的仓位 ${Math.round(r.weight * 100)}% · 影响总资产 ${signed(r.impact)}%` : '你没有持仓') : undefined,
    tip: `${r.sector}：自选里 ${r.codes.length} 只的平均涨跌，${period} ${signed(r.change)}%`,
  }))
  return (
    <section className="mt-4 rounded-lg border border-hairline" aria-label="自选与板块变化">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline-soft px-3.5 py-2">
        <div className="flex gap-0.5" role="group" aria-label="时间范围">
          {([1, 5] as const).map((k) => (
            <button key={k} type="button" onClick={() => setN(k)} aria-pressed={n === k} className={cn('h-7 rounded-sm px-2 text-[13px] text-slate hover:bg-hover', n === k && 'bg-hover font-medium text-ink')}>{k === 1 ? '1 日' : '5 日'}</button>
          ))}
        </div>
        <div className="flex gap-0.5 md:hidden" role="group" aria-label="看哪张图">
          {(['stock', 'sector'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k} className={cn('h-7 rounded-sm px-2 text-[13px] text-slate hover:bg-hover', view === k && 'bg-hover font-medium text-ink')}>{k === 'stock' ? '自选' : '板块'}</button>
          ))}
        </div>
        <span className="flex items-center gap-1.5 text-xs text-steel"><span className="h-2 w-2 rounded-full bg-up" />圆点：今天有新异动</span>
        <span className="ml-auto text-xs text-steel">
          {hasHoldings ? <>按你的仓位，总资产{period} <b className="font-semibold tabular-nums text-ink">{signed(total)}%</b></> : <button type="button" onClick={() => openMe('holdings')} className="text-link hover:underline">填上持仓，看对我的影响 →</button>}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 md:divide-x md:divide-hairline-soft">
        <div className={cn('px-1.5 py-2.5 md:block', view === 'stock' ? '' : 'hidden')}>
          <h2 className="px-2 pb-1 text-[13px] font-semibold">自选变化 <span className="font-normal text-steel">{period}</span></h2>
          <DivergingBars rows={stocks} />
        </div>
        <div className={cn('px-1.5 py-2.5 md:block', view === 'sector' ? '' : 'hidden')}>
          <h2 className="px-2 pb-1 text-[13px] font-semibold">板块变化 <span className="font-normal text-steel">按你的自选股算</span></h2>
          <DivergingBars rows={sectorBars} />
        </div>
      </div>
    </section>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{title}</h2>{action}</div>
      {children}
    </section>
  )
}

/** 判断列表：名称 + 进度条 + 结果。点开进入和管家的对话（表态、说理由、复盘） */
function Rows({ list }: { list: Judgment[] }) {
  const { openReview, reviewState } = useStore()
  return (
    <ul className="overflow-hidden rounded-lg border border-hairline">
      {list.map((j) => (
        <li key={j.id} className="border-b border-hairline-soft last:border-b-0">
          <button type="button" onClick={() => openReview(j.id)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-3.5 py-2.5 text-left hover:bg-surface-soft sm:grid-cols-[minmax(0,1fr)_200px_auto]">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{stockOf(j.code).name}</span>
              <span className="block truncate text-xs text-steel">{j.anomaly.title}</span>
            </span>
            <JudgmentMeter j={j} className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto" />
            {j.status === 'pending'
              ? <span className="text-right text-xs leading-tight text-steel tabular-nums">{j.n - j.elapsed} 个交易日后<br />对答案</span>
              : <span className="flex items-center gap-2"><span className={cn('text-xs', reviewState[j.id] ? 'text-steel' : 'font-medium text-on-lavender')}>{reviewState[j.id] ? '已复盘' : '去复盘'}</span><span className="origin-right scale-[0.8]"><Stamp status={j.status} /></span></span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** 受影响的股票：名称 + 上一个交易日涨跌。箭头带颜色，文字不带 */
function Chip({ code }: { code: string }) {
  const { tick, holdings, openStock } = useStore()
  const v = changeOver(code, tick, 1)
  return (
    <button type="button" onClick={() => openStock(code)} className="inline-flex items-center gap-1.5 rounded-sm border border-hairline px-2 py-1 text-[13px] hover:bg-surface-soft" title={`${stockOf(code).name} 上一个交易日 ${signed(v)}%`}>
      <span className="font-medium">{stockOf(code).name.replace('-W', '')}</span>
      <span aria-hidden="true" className={cn('text-[10px]', v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-stone')}>{v > 0 ? '▲' : v < 0 ? '▼' : '■'}</span>
      <span className="tabular-nums text-slate">{signed(v)}%</span>
      {holdings[code] ? <span className="text-xs text-stone">仓位 {Math.round(holdings[code] * 100)}%</span> : null}
    </button>
  )
}

/** 一件事一张卡：标题、受影响的股票、管家的判断和进度。发生了什么、为什么相关等文字收在「详情」里 */
function EventCard({ a, level, judgments }: { a: Anomaly; level: Level; judgments: Judgment[] }) {
  const { holdings, hasHoldings, openMe, openStock, openReview, lessons, profile } = useStore()
  const [open, setOpen] = useState(false)
  const relief = a.tone === 'relief'
  const held = a.hits.filter((h) => (holdings[h] ?? 0) > 0)
  return (
    <article className="rounded-lg border border-hairline">
      <div className="px-3.5 pb-3 pt-3">
        <div className="flex flex-wrap items-center gap-1.5"><LevelTag level={level} />{relief ? <Tag tone="green">好消息</Tag> : null}<span className="text-xs text-steel">{a.when}</span></div>
        <h2 className="mt-1.5 text-[17px] font-semibold leading-snug tracking-tight">{a.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-1.5"><span className="mr-0.5 text-xs text-steel">影响</span>{a.hits.map((h) => <Chip key={h} code={h} />)}</div>
      </div>
      {judgments.map((j) => {
        const mean = meaning(profile, j)
        return (
          <div key={j.id} className="grid gap-x-5 gap-y-2.5 border-t border-hairline-soft px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0">
              <p className="text-[15px] leading-snug"><span className="text-steel">管家认为　</span><span className="font-medium">{j.text.replace(/（.*）$/, '')}</span></p>
              {mean ? <p className="mt-1 text-[13px] text-on-lavender">{mean}</p> : null}
              {j.status === 'pending' ? <div className="mt-2.5"><VoteButtons j={j} /></div> : null}
            </div>
            <JudgmentMeter j={j} />
          </div>
        )
      })}
      {judgments.length ? null : <p className="border-t border-hairline-soft px-3.5 py-2.5 text-[13px] text-steel">{relief ? '好消息，只提醒、不做判断。' : '影响还不明确，先记下、不做判断。'}</p>}
      <div className="border-t border-hairline-soft">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-1 px-3.5 py-2 text-[13px] text-slate hover:bg-surface-soft">
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />{open ? '收起' : '发生了什么、为什么和我有关'}
        </button>
        {open ? (
          <div className="px-3.5 pb-3.5 text-sm leading-relaxed text-charcoal">
            <ol>
              {a.chain.map((c, i) => <li key={i} className="flex gap-2 py-0.5" style={{ paddingLeft: i * 14 }}><span aria-hidden="true" className="text-stone">▸</span><span><span className="mr-2 text-steel">{c.label}</span>{c.text}</span></li>)}
            </ol>
            {judgments.map((j) => {
              const prior = priorLessons(j, lessons)
              return (
                <p key={j.id} className="mt-2 text-[13px] text-steel">
                  {stockOf(j.code).name}这条：如果{j.invalid}，判断作废。{prior.length ? `参考了以往记下的 ${prior.length} 条经验：${prior[0].text}` : ''}
                  {j.status === 'pending' ? <button type="button" onClick={() => openReview(j.id)} className="ml-1 text-link hover:underline">和管家聊聊 →</button> : null}
                </p>
              )
            })}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="xs" onClick={() => openStock(a.hits[0])}>看证据和走势</Button>
              {relief ? null : held.length ? <Button size="xs" onClick={() => openMe('holdings')}>看调仓方案</Button> : hasHoldings ? null : <Button size="xs" onClick={() => openMe('holdings')}>补充持仓</Button>}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  )
}

/** 上一个交易日波动很大的自选股，合成一张卡，一行一只，附一句原因 */
function MovesCard({ moves, judgments }: { moves: Anomaly[]; judgments: Judgment[] }) {
  const { tick } = useStore()
  return (
    <article className="rounded-lg border border-hairline">
      <h2 className="px-3.5 pb-2 pt-3 text-[17px] font-semibold leading-snug tracking-tight">{moves.length} 只自选股波动很大</h2>
      <ul>
        {moves.map((a) => {
          const j = judgments.find((x) => x.anomaly.id === a.id)
          return (
            <li key={a.id} className="border-t border-hairline-soft px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-2"><Chip code={a.hits[0]} /><span className="min-w-0 flex-1 text-[13px] text-slate">{whyLine(a, tick)}</span></div>
              {j ? (
                <div className="mt-2.5 grid gap-x-5 gap-y-2.5 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="min-w-0"><p className="text-sm"><span className="text-steel">管家认为　</span><span className="font-medium">{j.text.replace(/（.*）$/, '')}</span></p>{j.status === 'pending' ? <div className="mt-2"><VoteButtons j={j} /></div> : null}</div>
                  <JudgmentMeter j={j} />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </article>
  )
}
