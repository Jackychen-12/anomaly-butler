/**
 * 今日：先说今天有几件事要看（管家把一条条信号按原因归并成「事」），再用两张图看全局，
 * 然后分「宏观」和「微观」列出这几件事。宏观的事下面直接挂着它在行情上引起的反应（微观指标），同一个原因只出现一次。
 * 再往下是接下来要留意的日子和最近有结果的判断。右边是提问栏，窄屏时收进底部输入条。
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, MessageCircle } from 'lucide-react'
import { AskPanel, useGo } from '../ask'
import { DivergingBars, JudgmentMeter, type BarRow } from '../charts'
import { STOCKS, STORY, UPCOMING } from '../data/case'
import { digest, type Digest, type Thing } from '../digest'
import { changeOver, fmtDate, judgmentsAt, recentlySettled, sectorRows, signed, stockOf, weekday, type Anomaly, type Judgment, type Level } from '../engine'
import { Button, cn, LevelTag, Stamp, Tag } from '../kit'
import { signalOf } from '../data/signals'
import { PathTree } from '../path'
import { Sheet, useIsWide, WithRail } from '../layout'
import { VoteButtons } from '../parts'
import { GROUND, llmName, useGenerated } from '../llm'
import { meaning, profileSet } from '../profile'
import { nudges } from '../proactive'
import { useStore } from '../store'

export function TodayPage() {
  const st = useStore()
  const { tick, prevTick, votes, prefs, holdings, hasHoldings, gradeOf, reviewState, profile, agent, rules, llm } = st
  const go = useGo()
  const wide = useIsWide()
  const [sheet, setSheet] = useState(false)

  const dg = digest(tick, prevTick, gradeOf)
  const js = judgmentsAt(tick)
  const recent = recentlySettled(tick)
  // 管家主动想说的事：宽屏放进右侧对话栏的开场白里，窄屏放在主内容顶部
  const tips = nudges({ tick, prevTick, votes, prefs, holdings, hasHoldings, reviewState, profile, agent, rules }).slice(0, wide ? 3 : 2)
  const need = dg.need.length
  const macro = dg.things.filter((t) => t.scope === '宏观'), micro = dg.things.filter((t) => t.scope === '微观')
  // 每只股票今天最高的异动等级，用来在图上打点
  const dotOf = (code: string): Level | null => dg.things.flatMap((t) => [...(t.cause && t.fresh ? [t.cause] : []), ...t.reactions]).filter((a) => a.hits.includes(code)).map((a) => gradeOf(a, code)).sort((x, y) => y.score - x.score)[0]?.level ?? null

  const headline = dg.signals
    ? `早上好。今天捕捉到 ${dg.signals} 条信号，归并成 ${dg.things.length} 件事，其中 ${need} 件需要你看，排在左边了。`
    : '早上好。今天自选股上很平静，没有新的事需要你看。'
  // 接了大模型时，开场白由它根据今天归并出的这几件事来写；没接或没写出来时用上面那句
  const material = JSON.stringify({ 日期: `${fmtDate(tick)}开盘前`, 信号数: dg.signals, 需要看的事: dg.need.map((t) => ({ 等级: t.level, 事: t.cause?.title ?? '行情指标异动，没找到对应事件', 说明: t.cause?.chain.map((c) => c.text), 涉及: [...new Set([...(t.cause?.hits ?? []), ...t.reactions.flatMap((r) => r.hits)])].map((c) => `${stockOf(c).name}（上一交易日 ${signed(changeOver(c, tick, 1))}%${holdings[c] ? `，占持仓 ${Math.round(holdings[c] * 100)}%` : ''}）`), 行情反应: t.reactions.flatMap((r) => r.indicators?.map((h) => `${stockOf(r.hits[0]).name}${h.label}`) ?? [r.title]) })), 在等结果的判断: js.filter((j) => j.status === 'pending').map((j) => j.text) })
  const brief = useGenerated(llm, 'brief', `${GROUND}写今天开盘前的一段开场白，3 句以内：先说今天最该看的一件事和它为什么和用户有关（点到这件事涉及的股票里他持仓占比最高的那只，并照抄资料里的占比；不要说成他全部持仓里最重的），再用一句带过其余的。以「早上好。」开头。`, material, 220)
  const rail = wide ? <AskPanel tips={tips} headline={brief.text ?? headline} headlineBy={brief.text ? `${llmName(llm)} 根据今天的 ${dg.things.length} 件事写的` : brief.loading ? '正在让模型写今天的开场白…' : undefined} /> : null
  // 默认只展开最重要的；窄屏上只展开第一件
  const openByDefault = (t: Thing) => t.level !== '低' && (wide || t === dg.things[0])
  const card = (t: Thing) => <ThingCard key={t.id} t={t} judgments={js} defaultOpen={openByDefault(t)} />

  return (
    <>
      <WithRail hideRailBelowXl rail={rail} railClassName="xl:overflow-hidden">
        <div className="mx-auto max-w-[840px] px-4 py-5 lg:px-8 lg:py-7">
          <p className="text-[13px] text-steel">{fmtDate(tick)} {weekday(tick)} · 开盘前</p>
          <h1 className="mt-0.5 text-2xl font-semibold leading-tight tracking-tight">{need ? `今天有 ${need} 件事需要你看` : dg.signals ? '今天没有需要你特别留意的事' : '今天没有新的事需要你看'}</h1>
          <Funnel d={dg} />
          {brief.text && !wide ? <p className="mt-3 rounded-lg bg-surface-soft px-3.5 py-2.5 text-sm leading-relaxed text-charcoal">{brief.text}<span className="mt-1 block text-[11px] text-stone">{llmName(llm)} 根据今天的 {dg.things.length} 件事写的</span></p> : null}
          {profileSet(profile) ? null : (
            <button type="button" onClick={() => st.openMe('profile')} className="mt-3 flex w-full items-center gap-2 rounded-lg border border-dashed border-hairline-strong px-3.5 py-2 text-left text-[13px] text-slate hover:bg-surface-soft">
              <span className="min-w-0 flex-1">花半分钟告诉管家你能接受多大的跌幅、一般拿多久，提醒会按你的风格排。</span><span className="shrink-0 text-link">设置画像 →</span>
            </button>
          )}

          <Overview dotOf={dotOf} />

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

          <Section title="宏观" sub="政策与跨市场的事，以及它在你的自选上引起的反应" count={macro.length}>
            <div className="flex flex-col gap-3">
              {macro.length ? macro.map(card) : <p className="rounded-lg bg-surface-soft px-4 py-4 text-sm text-steel">今天没有新的宏观事件，前几天的事也没有新的反应。</p>}
              {dg.earlier.length ? (
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-1 py-1 text-[13px] text-steel hover:text-ink [&::-webkit-details-marker]:hidden"><ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />近几天还有 {dg.earlier.length} 件事，今天没有新的反应</summary>
                  <ul className="mt-2 overflow-hidden rounded-lg border border-hairline">
                    {dg.earlier.map((a) => {
                      const j = js.find((x) => x.anomaly.id === a.id)
                      return (
                        <li key={a.id} className="border-b border-hairline-soft last:border-b-0">
                          <button type="button" onClick={() => (j ? st.openReview(j.id) : st.openStock(a.hits[0]))} className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 px-3.5 py-2.5 text-left hover:bg-surface-soft">
                            {a.tone === 'relief' ? <Tag tone="green">好消息</Tag> : null}
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.title}</span>
                            <span className="shrink-0 text-xs text-steel">{j ? `${stockOf(j.code).name} ${j.up ? '看涨' : '看跌'} · ${STATUS_TEXT[j.status]}` : a.when}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </details>
              ) : null}
            </div>
          </Section>
          <Section title="微观" sub="公司自己的事，和找不到对应事件的行情异动" count={micro.length}>
            {micro.length ? <div className="flex flex-col gap-3">{micro.map(card)}</div> : <p className="rounded-lg bg-surface-soft px-4 py-4 text-sm text-steel">今天没有单独的公司事件；行情上的异动都能对上面的宏观事件，已经并在一起了。</p>}
          </Section>

          <Ahead judgments={js} />

          {recent.length ? (
            <Section title="最近有结果" sub="按事件归在一起" action={<Button size="xs" variant="ghost" onClick={() => st.setPage('review')}>全部 →</Button>}><Results list={recent} /></Section>
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

const STATUS_TEXT = { pending: '在等结果', hit: '说对', miss: '说错', void: '作废' } as const

/** 一条细的漏斗：捕捉到几条信号 → 归并成几件事 → 需要看几件。让「降噪」看得见 */
function Funnel({ d }: { d: Digest }) {
  if (!d.signals) return null
  const steps = [
    { n: d.signals, label: '条信号', hint: `${d.stocks} 只自选里捕捉到`, tone: 'bg-hairline-strong' },
    { n: d.things.length, label: '件事', hint: '同一个原因并成一件', tone: 'bg-stone' },
    { n: d.need.length, label: '件要看', hint: '其余影响轻微，已收起', tone: 'bg-primary' },
  ]
  return (
    <ol className="mt-3 grid grid-cols-3 gap-2" aria-label={`今天 ${d.signals} 条信号，归并成 ${d.things.length} 件事，${d.need.length} 件要看`}>
      {steps.map((s, i) => (
        <li key={s.label} className="min-w-0">
          <span className="flex h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true"><span className={cn('h-full rounded-full', s.tone)} style={{ width: `${Math.max(6, (s.n / d.signals) * 100)}%` }} /></span>
          <p className="mt-1.5 flex items-baseline gap-1"><b className={cn('text-xl font-semibold tabular-nums tracking-tight', i === 2 ? 'text-ink' : 'text-slate')}>{s.n}</b><span className="text-[13px] text-charcoal">{s.label}</span></p>
          <p className="truncate text-xs text-steel">{s.hint}</p>
        </li>
      ))}
    </ol>
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
    aux: hasHoldings ? (holdings[s.code] ? `仓位 ${Math.round(holdings[s.code] * 100)}%` : '未持有') : undefined,
    tip: `${s.name}（${s.sector}）${period} ${signed(v)}%${dotOf(s.code) ? '，今天有新异动' : ''}${holdings[s.code] ? `，占你持仓 ${Math.round(holdings[s.code] * 100)}%` : ''}`,
  }))
  const sectors = sectorRows(tick, n, holdings)
  const total = sectors.reduce((a, r) => a + r.impact, 0)
  const sectorBars: BarRow[] = sectors.map((r) => ({
    key: r.sector, label: r.sector, sub: r.codes.map((c) => stockOf(c).name.replace('-W', '').replace(/(集团|控股|精密|时代|茅台)$/, '')).join(' '), value: r.change,
    dot: r.codes.map(dotOf).sort((a, b) => '高中低'.indexOf(a ?? '低') - '高中低'.indexOf(b ?? '低'))[0] ?? null,
    aux: hasHoldings ? (r.weight ? `仓位 ${Math.round(r.weight * 100)}%` : '未持有') : undefined,
    tip: `${r.sector}：自选里 ${r.codes.length} 只的平均涨跌，${period} ${signed(r.change)}%${r.weight ? `；你的仓位 ${Math.round(r.weight * 100)}%，影响总资产 ${signed(r.impact)}%` : ''}`,
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
        <h2 className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-base font-semibold">{title}{count != null ? <span className="text-[13px] font-normal tabular-nums text-steel">{count} 件</span> : null}{sub ? <span className="hidden text-[13px] font-normal text-steel sm:inline">{sub}</span> : null}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** 一件事一张卡：原因（政策或公司事件）→ 传导路径 → 行情上已经出现的反应 → 管家的判断。同一个原因只出现这一次 */
function ThingCard({ t, judgments, defaultOpen }: { t: Thing; judgments: Judgment[]; defaultOpen: boolean }) {
  const { openStock } = useStore()
  const [open, setOpen] = useState(defaultOpen)
  const a = t.cause
  const members = [...(a ? [a] : []), ...t.history, ...t.reactions]
  const js = judgments.filter((j) => members.some((m) => m.id === j.anomaly.id) && (j.status === 'pending' || (t.fresh && j.anomaly.id === a?.id) || t.reactions.some((r) => r.id === j.anomaly.id)))
  const codes = [...new Set(members.flatMap((m) => m.hits))]
  const title = a ? a.title : `${t.reactions.length} 只自选股的行情指标有异动，没有找到对应的事件`
  const relief = a?.tone === 'relief'
  const head = (
    <>
      <LevelTag level={t.level} />
      {relief ? <Tag tone="green">好消息</Tag> : null}
      {a && !t.fresh ? <Tag>前几天的事，今天有新反应</Tag> : null}
      {a && STORY[a.id] ? <Tag>{STORY[a.id]}</Tag> : null}
    </>
  )
  if (!open) return (
    <article className="rounded-lg border border-hairline">
      <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 px-3.5 py-2.5 text-left hover:bg-surface-soft">
        {head}
        <span className="order-last min-w-0 basis-full text-sm font-medium sm:order-none sm:flex-1 sm:basis-0 sm:truncate">{title}</span>
        <span className="ml-auto shrink-0 text-xs text-steel sm:ml-0">涉及 {codes.length} 只自选</span>
        <span className="flex shrink-0 items-center gap-0.5 text-xs text-steel">展开<ChevronDown className="h-4 w-4" /></span>
      </button>
    </article>
  )
  return (
    <article className="rounded-lg border border-hairline">
      <div className="px-3.5 pb-3 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">{head}{a ? <span className="text-xs text-steel">{a.when}</span> : null}
          <button type="button" onClick={() => setOpen(false)} aria-expanded={true} className="-my-1 -mr-1.5 ml-auto flex h-7 items-center gap-0.5 rounded-sm px-1.5 text-xs text-steel hover:bg-hover hover:text-ink">收起<ChevronUp className="h-4 w-4" /></button>
        </div>
        <h3 className="mt-1.5 text-[17px] font-semibold leading-snug tracking-tight">{title}</h3>
        {a ? <div className="mt-2.5"><PathTree a={a} judged={js.map((j) => j.code)} /></div> : null}
        {t.history.length ? (
          <div className="mt-3">
            <p className="mb-1 text-xs text-steel">这件事之前的进展</p>
            <ol className="ml-1 border-l border-hairline-strong">
              {t.history.map((h) => (
                <li key={h.id} className="relative py-0.5 pl-3.5 text-[13px] text-charcoal">
                  <span aria-hidden="true" className="absolute -left-[3.5px] top-[9px] h-1.5 w-1.5 rounded-full bg-stone" />
                  <span className="mr-2 tabular-nums text-steel">{fmtDate(h.tick!)}</span>{h.title}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
      {t.reactions.length ? (
        <div className="border-t border-hairline-soft px-3.5 py-2.5">
          <p className="mb-1 text-xs text-steel">{a ? '行情上已经出现的反应' : '触发的指标'}</p>
          <ul>{t.reactions.map((r) => <Reaction key={r.id} a={r} />)}</ul>
        </div>
      ) : null}
      {js.map((j) => <JudgmentBlock key={j.id} j={j} />)}
      {js.length || !a ? null : (
        <p className="flex flex-wrap items-center gap-x-3 border-t border-hairline-soft px-3.5 py-2.5 text-[13px] text-steel">
          <span>{signalOf(a.signal)?.judges === false ? '这类信号只提醒，不做判断。' : relief ? '好消息，只提醒、不做判断。' : '影响还不明确，先记下、不做判断。'}</span>
          <button type="button" onClick={() => openStock(a.hits[0])} className="text-link hover:underline">看证据 →</button>
        </p>
      )}
    </article>
  )
}

/** 一条反应：哪只股票、涨跌多少（小条形）、触发了哪些指标。指标名悬停有一句大白话解释 */
function Reaction({ a }: { a: Anomaly }) {
  const { tick, openStock, holdings } = useStore()
  const code = a.hits[0], v = changeOver(code, tick, 1)
  // 跨市场的异动没有指标，直接用标题说明
  if (!a.indicators) return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-[13px]">
      <span className="w-[72px] shrink-0 text-steel">跨市场</span><span className="min-w-0 flex-1 text-charcoal">{a.title}，会传到{a.hits.map((c) => stockOf(c).name.replace('-W', '')).join('、')}的开盘</span>
    </li>
  )
  return (
    <li>
      <button type="button" onClick={() => openStock(code)} className="-mx-1.5 grid w-[calc(100%+12px)] grid-cols-[72px_112px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-sm px-1.5 py-1.5 text-left hover:bg-surface-soft max-sm:grid-cols-[72px_minmax(0,1fr)]">
        <span className="truncate text-[13px] font-medium">{stockOf(code).name.replace('-W', '')}</span>
        <span className="flex items-center gap-2" title={holdings[code] ? `占你持仓 ${Math.round(holdings[code] * 100)}%` : undefined}>
          <span className="relative h-2 w-12 shrink-0 rounded-full bg-surface" aria-hidden="true"><span className={cn('absolute inset-y-0 rounded-full', v >= 0 ? 'left-1/2 bg-up' : 'right-1/2 bg-down')} style={{ width: `${Math.min(50, Math.abs(v) * 5)}%` }} /></span>
          <span className="text-[13px] tabular-nums text-ink">{signed(v)}%</span>
        </span>
        <span className="flex flex-wrap gap-1 max-sm:col-span-2">
          {a.indicators.map((h) => <span key={h.id} title={signalOf(h.id)?.intro} className="rounded-xs bg-surface px-1.5 py-0.5 text-xs text-charcoal">{h.label}</span>)}
        </span>
      </button>
    </li>
  )
}

function JudgmentBlock({ j }: { j: Judgment }) {
  const { openReview, profile } = useStore()
  const mean = meaning(profile, j)
  return (
    <div className="grid gap-x-5 gap-y-2.5 border-t border-hairline-soft px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_220px]">
      <div className="min-w-0">
        <p className="text-[15px] leading-snug"><span className="text-steel">管家认为　</span><span className="font-medium">{j.text.replace(/（.*）$/, '')}</span></p>
        {mean ? <p className="mt-1 text-[13px] text-on-lavender">{mean}</p> : null}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          {j.status === 'pending' ? <VoteButtons j={j} /> : <span className="text-[13px] text-steel">{STATUS_TEXT[j.status]}</span>}
          <button type="button" onClick={() => openReview(j.id)} className="text-[13px] text-link hover:underline">{j.status === 'pending' ? '去表态和对答案 →' : '去复盘 →'}</button>
        </div>
      </div>
      <JudgmentMeter j={j} />
    </div>
  )
}

/** 接下来要留意的日子：政策哪天生效、哪条判断哪天对答案。画成一条时间线 */
function Ahead({ judgments }: { judgments: Judgment[] }) {
  const { tick, openReview } = useStore()
  const items = [
    ...UPCOMING.filter((u) => u.date >= tick).map((u) => ({ date: u.date, kind: '政策生效', text: u.text, go: undefined as undefined | (() => void) })),
    ...judgments.filter((j) => j.status === 'pending' && j.dueDate).map((j) => ({ date: j.dueDate!, kind: '对答案', text: `${stockOf(j.code).name}${j.up ? '看涨' : '看跌'}的判断到期`, go: () => openReview(j.id) })),
  ].sort((x, y) => (x.date < y.date ? -1 : 1))
  if (!items.length) return null
  const days = [...new Set(items.map((i) => i.date))]
  return (
    <Section title="接下来要留意的日子" sub="政策哪天生效，判断哪天对答案">
      <ol className="relative ml-1.5 border-l border-hairline-strong sm:ml-0 sm:flex sm:border-l-0 sm:border-t sm:pt-0">
        {days.map((d) => (
          <li key={d} className="relative pb-3 pl-4 last:pb-0 sm:min-w-0 sm:flex-1 sm:pb-0 sm:pl-0 sm:pr-3 sm:pt-3">
            <span aria-hidden="true" className={cn('absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-canvas sm:-top-[5px] sm:left-0', d === tick ? 'bg-primary' : 'bg-stone')} />
            <p className="text-xs font-medium tabular-nums text-ink">{fmtDate(d)} {weekday(d)}{d === tick ? ' · 今天' : ''}</p>
            {items.filter((i) => i.date === d).map((i) => (
              i.go ? <button key={i.text} type="button" onClick={i.go} className="mt-0.5 block text-left text-[13px] leading-snug text-charcoal hover:text-link"><span className="mr-1 text-on-lavender">{i.kind}</span>{i.text}</button>
                : <p key={i.text} className="mt-0.5 text-[13px] leading-snug text-charcoal"><span className="mr-1 text-warning">{i.kind}</span>{i.text}</p>
            ))}
          </li>
        ))}
      </ol>
    </Section>
  )
}

/** 最近有结果的判断，按事件归在一起：一件事一行，后面是它落在各只股票上的结果 */
function Results({ list }: { list: Judgment[] }) {
  const { openReview, reviewState } = useStore()
  const groups = new Map<string, Judgment[]>()
  for (const j of list) groups.set(j.anomaly.id, [...(groups.get(j.anomaly.id) ?? []), j])
  return (
    <ul className="overflow-hidden rounded-lg border border-hairline">
      {[...groups.values()].slice(0, 4).map((g) => (
        <li key={g[0].anomaly.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline-soft px-3.5 py-2.5 last:border-b-0">
          <span className="min-w-0 flex-1 basis-[240px] text-sm font-medium">{g[0].anomaly.title}</span>
          <span className="flex flex-wrap gap-1.5">
            {g.map((j) => (
              <button key={j.id} type="button" onClick={() => openReview(j.id)} title={reviewState[j.id] ? '已复盘' : '还没复盘'}
                className="inline-flex items-center gap-1.5 rounded-sm border border-hairline py-0.5 pl-2 pr-1 text-[13px] hover:bg-surface-soft">
                {stockOf(j.code).name.replace('-W', '')}<span className="origin-right scale-[0.72]"><Stamp status={j.status as 'hit' | 'miss' | 'void'} /></span>
                {reviewState[j.id] ? null : <span aria-hidden="true" className="-ml-1 mr-1 h-1.5 w-1.5 rounded-full bg-primary" />}
              </button>
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}
