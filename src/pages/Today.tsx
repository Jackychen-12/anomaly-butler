/**
 * 今日：先用图看全局（自选变化、板块变化），再分「宏观」和「微观」看今天的事。
 * 宏观是政策和跨市场的事，画出传导路径；微观是公司自己的事和行情指标。右边是提问栏，窄屏时收进底部输入条。
 */
import { useState, type ReactNode } from 'react'
import { ChevronRight, MessageCircle } from 'lucide-react'
import { AskPanel, useGo } from '../ask'
import { DivergingBars, JudgmentMeter, type BarRow } from '../charts'
import { STOCKS } from '../data/case'
import { anomaliesAt, changeOver, fmtDate, isFresh, judgmentsAt, recentlySettled, sectorRows, signed, stockOf, weekday, whyLine, type Anomaly, type Judgment, type Level } from '../engine'
import { Button, cn, LevelTag, Stamp, Tag } from '../kit'
import { scopeOf, SIGNALS } from '../data/signals'
import { PathTree, StockChip } from '../path'
import { Sheet, useIsWide, WithRail } from '../layout'
import { VoteButtons } from '../parts'
import { meaning } from '../profile'
import { nudges } from '../proactive'
import { useStore } from '../store'

export function TodayPage() {
  const st = useStore()
  const { tick, prevTick, votes, prefs, holdings, hasHoldings, gradeOf, reviewState, profile, agent, rules } = st
  const go = useGo()
  const wide = useIsWide()
  const [sheet, setSheet] = useState(false)

  const fresh = anomaliesAt(tick).filter((a) => isFresh(a, tick, prevTick))
  const events = fresh.filter((a) => !a.auto)
  const moves = fresh.filter((a) => a.auto)
  const macro = events.filter((a) => scopeOf(a.signal) === '宏观')
  const company = events.filter((a) => scopeOf(a.signal) === '微观')
  const js = judgmentsAt(tick)
  const recent = recentlySettled(tick)
  // 提前看：管家认为未来几天有下跌风险的自选股（还没到对答案那天的判断），今天新发出的排前面
  const outlook = js.filter((j) => j.status === 'pending').sort((a, b) => (a.issued === b.issued ? (a.n - a.elapsed) - (b.n - b.elapsed) : a.issued < b.issued ? 1 : -1))
  // 管家主动想说的事：宽屏放进右侧对话栏的开场白里，窄屏放在主内容顶部
  const tips = nudges({ tick, prevTick, votes, prefs, holdings, hasHoldings, reviewState, profile, agent }).slice(0, wide ? 3 : 2)
  // 一件事的等级取它影响到的自选里最高的那个
  const levelOf = (a: Anomaly) => a.hits.map((h) => gradeOf(a, h)).sort((x, y) => y.score - x.score)[0]
  const byLevel = (list: Anomaly[]) => [...list].sort((a, b) => levelOf(b).score - levelOf(a).score)
  // 降噪：影响轻微（低）的收起来，只把高和中摆出来
  const major = (list: Anomaly[]) => byLevel(list).filter((a) => levelOf(a).level !== '低')
  const minor = (list: Anomaly[]) => byLevel(list).filter((a) => levelOf(a).level === '低')
  const microCount = company.length + moves.length
  const count = macro.length + microCount
  const need = major(fresh).length
  // 捕捉：宏观和微观各盯着几类信号，今天各捕捉到多少个原始异常信号（一只股票一天触发几个指标就算几个）
  const liveOf = (scope: '宏观' | '微观') => SIGNALS.filter((x) => x.kind !== 'planned' && !rules.off.includes(x.id) && scopeOf(x.id) === scope).length
  const rawMicro = company.length + moves.reduce((n, a) => n + (a.indicators?.length ?? 1), 0)
  const raw = macro.length + rawMicro
  // 每只股票今天最高的异动等级，用来在图上打点
  const dotOf = (code: string): Level | null => fresh.filter((a) => a.hits.includes(code)).map((a) => gradeOf(a, code)).sort((x, y) => y.score - x.score)[0]?.level ?? null

  const headline = count
    ? `早上好。今天从宏观政策和微观指标里捕捉到 ${raw} 个异常信号，合并、分级后有 ${need} 件事需要你看，排在左边了。`
    : '早上好。今天自选股上很平静，没有新的事需要你看。'
  const rail = wide ? <AskPanel tips={tips} headline={headline} /> : null

  return (
    <>
      <WithRail hideRailBelowXl rail={rail} railClassName="xl:overflow-hidden">
        <div className="mx-auto max-w-[840px] px-4 py-5 lg:px-8 lg:py-7">
          <p className="text-[13px] text-steel">{fmtDate(tick)} {weekday(tick)} · 开盘前</p>
          <h1 className="mt-0.5 text-2xl font-semibold leading-tight tracking-tight">{need ? `今天有 ${need} 件事需要你看` : count ? '今天没有需要你特别留意的事' : '今天没有新的事需要你看'}</h1>

          <Capture stocks={STOCKS.length} macro={{ kinds: liveOf('宏观'), raw: macro.length }} micro={{ kinds: liveOf('微观'), raw: rawMicro }} items={count} need={need} />
          <Overview dotOf={dotOf} />

          <Section title="提前看" sub="管家认为未来几天有下跌风险的自选股" count={outlook.length}>
            {outlook.length ? <Rows list={outlook} /> : <p className="rounded-lg bg-surface-soft px-4 py-4 text-sm text-steel">目前没有。管家发现风险时会先在这里列出来。</p>}
          </Section>

          {tips.length && !wide ? (
            <ul className="mt-4 overflow-hidden rounded-lg bg-tint-lavender text-on-lavender" aria-label="管家想提醒你">
              {tips.map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-b border-white/50 px-3.5 py-2 text-[13px] last:border-b-0">
                  <span className="min-w-0 flex-1">{t.text}</span>
                  {t.action ? <button type="button" onClick={() => go(t.action!)} className="shrink-0 whitespace-nowrap font-medium underline underline-offset-2">{t.action.label}</button> : null}
                </li>
              ))}
            </ul>
          ) : null}

          <Section title="宏观" sub="政策与跨市场的事，以及它怎么传到你的自选" count={macro.length}>
            {macro.length ? (
              <div className="flex flex-col gap-3">
                {major(macro).map((a) => <EventCard key={a.id} a={a} level={levelOf(a).level} judgments={js.filter((j) => j.anomaly.id === a.id)} />)}
                <Minor n={minor(macro).length}>{minor(macro).map((a) => <EventCard key={a.id} a={a} level={levelOf(a).level} judgments={js.filter((j) => j.anomaly.id === a.id)} />)}</Minor>
              </div>
            ) : <p className="rounded-lg bg-surface-soft px-4 py-4 text-sm text-steel">今天没有新的宏观事件。</p>}
          </Section>
          <Section title="微观" sub="公司自己的事，和行情指标的异动" count={microCount}>
            {microCount ? (
              <div className="flex flex-col gap-3">
                {major(company).map((a) => <EventCard key={a.id} a={a} level={levelOf(a).level} judgments={js.filter((j) => j.anomaly.id === a.id)} />)}
                {major(moves).length ? <MovesCard moves={major(moves)} judgments={js} levelOf={(a) => levelOf(a).level} /> : null}
                <Minor n={minor(company).length + minor(moves).length}>
                  {minor(company).map((a) => <EventCard key={a.id} a={a} level={levelOf(a).level} judgments={js.filter((j) => j.anomaly.id === a.id)} />)}
                  {minor(moves).length ? <MovesCard moves={minor(moves)} judgments={js} levelOf={(a) => levelOf(a).level} /> : null}
                </Minor>
              </div>
            ) : <p className="rounded-lg bg-surface-soft px-4 py-4 text-sm text-steel">今天没有新的公司事件或指标异动。</p>}
          </Section>

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
      {sheet && !wide ? <Sheet title="问管家" tall onClose={() => setSheet(false)}><AskPanel bare autoFocus onNavigate={() => setSheet(false)} /></Sheet> : null}
    </>
  )
}

/**
 * 捕捉与信噪比：左边是管家从两个来源捕捉到的异常信号——宏观政策、微观指标，各盯几类、今天捕捉到几个，
 * 一个圆点代表一个原始信号；右边是合并、分级之后需要你看的几件事。数字都是按当前规则算出来的。
 */
function Capture({ stocks, macro, micro, items, need }: { stocks: number; macro: { kinds: number; raw: number }; micro: { kinds: number; raw: number }; items: number; need: number }) {
  const raw = macro.raw + micro.raw
  const Source = ({ name, scope, n }: { name: string; scope: string; n: number }) => (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-x-3 py-1">
      <span className="text-[13px] font-medium text-ink">{name}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-xs text-steel">{scope}</span>
        <span className="flex min-w-0 flex-wrap gap-1" aria-hidden="true">{Array.from({ length: Math.min(n, 24) }, (_, i) => <span key={i} className="h-2 w-2 rounded-full bg-ink" />)}</span>
      </span>
      <span className="text-[13px] tabular-nums text-ink"><b className="font-semibold">{n}</b> 个</span>
    </div>
  )
  return (
    <section className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-x-5 gap-y-2 rounded-lg bg-surface px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
      aria-label={`今天捕捉到 ${raw} 个异常信号：宏观政策 ${macro.raw} 个，微观指标 ${micro.raw} 个；合并、分级后 ${need} 件需要你看`}>
      <div className="min-w-0">
        <p className="mb-0.5 text-xs text-steel">今天捕捉到的异常信号</p>
        <Source name="宏观政策" scope={`盯 ${macro.kinds} 类`} n={macro.raw} />
        <Source name="微观指标" scope={`盯 ${micro.kinds} 类 × ${stocks} 只`} n={micro.raw} />
      </div>
      <div className="flex items-center gap-3 border-t border-hairline pt-2 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
        <ChevronRight className="hidden h-4 w-4 shrink-0 text-stone sm:block" aria-hidden="true" />
        <div>
          <p className="text-xs text-steel">合并、分级后</p>
          <p className="mt-0.5 leading-none"><b className="text-[26px] font-semibold tracking-tight">{need}</b><span className="ml-1 text-[13px]">件需要你看</span></p>
          <p className="mt-1 text-xs text-steel">{raw} 个信号 → {items} 件事{items - need > 0 ? `，${items - need} 件轻微已收起` : ''}</p>
        </div>
      </div>
    </section>
  )
}

/** 影响轻微的收在这里，点开才看 */
function Minor({ n, children }: { n: number; children: ReactNode }) {
  if (!n) return null
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-1 py-1 text-[13px] text-steel hover:text-ink [&::-webkit-details-marker]:hidden"><ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />另有 {n} 条影响轻微，已收起</summary>
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </details>
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

function Section({ title, sub, count, action, children }: { title: string; sub?: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-base font-semibold">{title}{count != null ? <span className="text-[13px] font-normal tabular-nums text-steel">{count} 条</span> : null}{sub ? <span className="hidden text-[13px] font-normal text-steel sm:inline">{sub}</span> : null}</h2>
        {action}
      </div>
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

/** 一件事一张卡：标题、传导路径图（事件 → 途径 → 你的自选股）、管家的判断和进度。其余文字放进判断页的五步里 */
function EventCard({ a, level, judgments }: { a: Anomaly; level: Level; judgments: Judgment[] }) {
  const { openStock, openReview, profile } = useStore()
  const relief = a.tone === 'relief'
  return (
    <article className="rounded-lg border border-hairline">
      <div className="px-3.5 pb-3 pt-3">
        <div className="flex flex-wrap items-center gap-1.5"><LevelTag level={level} />{relief ? <Tag tone="green">好消息</Tag> : null}<span className="text-xs text-steel">{a.when}</span></div>
        <h3 className="mb-2.5 mt-1.5 text-[17px] font-semibold leading-snug tracking-tight">{a.title}</h3>
        <PathTree a={a} judged={judgments.map((j) => j.code)} />
      </div>
      {judgments.map((j) => {
        const mean = meaning(profile, j)
        return (
          <div key={j.id} className="grid gap-x-5 gap-y-2.5 border-t border-hairline-soft px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0">
              <p className="text-[15px] leading-snug"><span className="text-steel">管家认为　</span><span className="font-medium">{j.text.replace(/（.*）$/, '')}</span></p>
              {mean ? <p className="mt-1 text-[13px] text-on-lavender">{mean}</p> : null}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                {j.status === 'pending' ? <VoteButtons j={j} /> : null}
                <button type="button" onClick={() => openReview(j.id)} className="text-[13px] text-link hover:underline">按五步想清楚 →</button>
              </div>
            </div>
            <JudgmentMeter j={j} />
          </div>
        )
      })}
      {judgments.length ? null : (
        <p className="flex flex-wrap items-center gap-x-3 border-t border-hairline-soft px-3.5 py-2.5 text-[13px] text-steel">
          <span>{relief ? '好消息，只提醒、不做判断。' : '影响还不明确，先记下、不做判断。'}</span>
          <button type="button" onClick={() => openStock(a.hits[0])} className="text-link hover:underline">看证据 →</button>
        </p>
      )}
    </article>
  )
}

/** 行情指标的异动：一行一只股票，列出触发了哪些指标，附一句原因 */
function MovesCard({ moves, judgments, levelOf }: { moves: Anomaly[]; judgments: Judgment[]; levelOf: (a: Anomaly) => Level }) {
  const { tick, openReview } = useStore()
  return (
    <article className="rounded-lg border border-hairline">
      <h3 className="px-3.5 pb-2 pt-3 text-[17px] font-semibold leading-snug tracking-tight">{moves.length} 只自选股的行情指标有异动</h3>
      <ul>
        {moves.map((a) => {
          const j = judgments.find((x) => x.anomaly.id === a.id)
          return (
            <li key={a.id} className="border-t border-hairline-soft px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <LevelTag level={levelOf(a)} /><StockChip code={a.hits[0]} judged={!!j} />
                {a.indicators?.map((h) => <Tag key={h.id}>{h.label}</Tag>)}
              </div>
              <p className="mt-1.5 text-[13px] text-slate">{whyLine(a, tick)}</p>
              {j ? (
                <div className="mt-2.5 grid gap-x-5 gap-y-2.5 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="min-w-0">
                    <p className="text-sm"><span className="text-steel">管家认为　</span><span className="font-medium">{j.text.replace(/（.*）$/, '')}</span></p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">{j.status === 'pending' ? <VoteButtons j={j} /> : null}<button type="button" onClick={() => openReview(j.id)} className="text-[13px] text-link hover:underline">按五步想清楚 →</button></div>
                  </div>
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
