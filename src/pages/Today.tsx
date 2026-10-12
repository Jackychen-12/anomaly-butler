/** 今日：左边是管家的简报（今天有什么事和你的自选有关），右边是提问栏。窄屏时提问收进底部输入条。 */
import { useState, type ReactNode } from 'react'
import { MessageCircle } from 'lucide-react'
import { AskPanel, useGo } from '../ask'
import { anomaliesAt, fmtDate, grade, isFresh, judgmentsAt, recentlySettled, stockOf, weekday, whyLine, type Anomaly, type Judgment } from '../engine'
import { Button, cn, LevelTag, Stamp, Tag } from '../kit'
import { Sheet, useIsWide, WithRail } from '../layout'
import { VoteButtons } from '../parts'
import { nudges } from '../proactive'
import { priorLessons } from '../review'
import { useStore } from '../store'

export function TodayPage() {
  const st = useStore()
  const { tick, prevTick, votes, prefs, holdings, hasHoldings, weightOf, reviewState } = st
  const go = useGo()
  const wide = useIsWide()
  const [sheet, setSheet] = useState(false)

  const fresh = anomaliesAt(tick).filter((a) => isFresh(a, tick, prevTick))
  const events = fresh.filter((a) => !a.auto)
  const moves = fresh.filter((a) => a.auto)
  const js = judgmentsAt(tick)
  const recent = recentlySettled(tick)
  const waiting = js.filter((j) => j.status === 'pending' && j.issued !== tick)
  const tips = nudges({ tick, prevTick, votes, prefs, holdings, hasHoldings, reviewState })
  // 一件事的等级取它影响到的自选里最高的那个
  const levelOf = (a: Anomaly) => a.hits.map((h) => grade(a.strength, weightOf(h), prefs[h] ?? 'normal')).sort((x, y) => y.score - x.score)[0]
  const sorted = [...events].sort((a, b) => levelOf(b).score - levelOf(a).score)
  const count = events.length + (moves.length ? 1 : 0)

  const rail = wide ? (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-hairline px-4 py-3">
        <h2 className="text-sm font-semibold">问管家</h2>
        <p className="mt-0.5 text-xs text-steel">想到什么直接问，管家会结合你的自选、表态和记下的经验来答。</p>
      </div>
      <div className="min-h-0 flex-1"><AskPanel /></div>
    </div>
  ) : null

  return (
    <>
      <WithRail hideRailBelowXl rail={rail} railClassName="xl:overflow-hidden">
        <div className="mx-auto max-w-[800px] px-4 py-6 lg:px-8 lg:py-8">
          <p className="text-sm text-steel">{fmtDate(tick)} {weekday(tick)} 早上 · 开盘前</p>
          <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">
            {count ? `今天有 ${count} 件事和你的自选有关` : '今天没有新的事需要你看'}
          </h1>
          <p className="mt-1.5 text-[15px] text-slate">
            {count ? '我按重要程度排好了。每件事都说清发生了什么、为什么和你有关、我怎么看。' : '自选股上一切平静。'}
          </p>

          {tips.length ? (
            <section className="mt-5 overflow-hidden rounded-lg bg-tint-lavender text-on-lavender" aria-label="管家想提醒你">
              <ul>
                {tips.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 border-b border-white/50 px-3.5 py-2 text-sm last:border-b-0">
                    <span className="min-w-0 flex-1">{t.text}</span>
                    {t.action ? <button type="button" onClick={() => go(t.action!)} className="shrink-0 whitespace-nowrap font-medium underline underline-offset-2">{t.action.label}</button> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mt-5 flex flex-col gap-4">
            {sorted.map((a) => <EventCard key={a.id} a={a} level={levelOf(a).level} judgments={js.filter((j) => j.anomaly.id === a.id)} />)}
            {moves.length ? <MovesCard moves={moves} judgments={js} /> : null}
          </div>

          {waiting.length ? (
            <Section title="在等结果" hint="这些判断还没到对答案的日子。">
              <ul className="overflow-hidden rounded-lg border border-hairline">{waiting.map((j) => <JudgmentRow key={j.id} j={j} />)}</ul>
            </Section>
          ) : null}

          {recent.length ? (
            <Section title="最近有结果" hint="说对说错都要复盘：看看为什么，把经验记下来。" action={<Button size="xs" variant="ghost" onClick={() => st.setPage('review')}>看全部 →</Button>}>
              <ul className="overflow-hidden rounded-lg border border-hairline">{recent.slice(0, 5).map((j) => <JudgmentRow key={j.id} j={j} />)}</ul>
            </Section>
          ) : null}
        </div>

        {wide ? null : (
          <div className="sticky bottom-0 border-t border-hairline bg-canvas px-4 py-2">
            <button type="button" onClick={() => setSheet(true)} className="flex h-10 w-full items-center gap-2 rounded-md border border-hairline-strong px-3 text-left text-sm text-stone hover:bg-surface-soft">
              <MessageCircle className="h-4 w-4 shrink-0 text-steel" />问问管家，比如：立讯精密怎么了？
            </button>
          </div>
        )}
      </WithRail>
      {sheet && !wide ? <Sheet title="问管家" tall onClose={() => setSheet(false)}><AskPanel autoFocus onNavigate={() => setSheet(false)} /></Sheet> : null}
    </>
  )
}

function Section({ title, hint, action, children }: { title: string; hint: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-0.5 text-[13px] text-steel">{hint}</p></div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** 一条判断占一行：点开进入和管家的对话（表态、说理由、复盘） */
function JudgmentRow({ j }: { j: Judgment }) {
  const { openReview, reviewState } = useStore()
  const state = reviewState[j.id]
  return (
    <li className="border-b border-hairline-soft last:border-b-0">
      <button type="button" onClick={() => openReview(j.id)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-soft">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{stockOf(j.code).name} · {j.anomaly.title}</span>
          <span className="mt-0.5 block truncate text-[13px] text-steel">管家认为：{j.text}</span>
        </span>
        {j.status === 'pending'
          ? <span className="shrink-0 text-xs text-steel tabular-nums">{j.n - j.elapsed} 个交易日后对答案</span>
          : <><span className={cn('shrink-0 text-xs', state ? 'text-steel' : 'font-medium text-on-lavender')}>{state ? '已复盘' : '去复盘'}</span><span className="shrink-0 origin-right scale-[0.8]"><Stamp status={j.status} /></span></>}
      </button>
    </li>
  )
}

function Part({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-x-4 gap-y-1 border-t border-hairline-soft px-4 py-3 sm:grid-cols-[104px_1fr]"><p className="pt-0.5 text-[13px] text-steel">{label}</p><div className="min-w-0 text-[15px] leading-relaxed text-charcoal">{children}</div></div>
}

/** 一件事一张卡，固定四段：发生了什么 / 为什么和你有关 / 管家怎么看 / 你可以做什么 */
function EventCard({ a, level, judgments }: { a: Anomaly; level: '高' | '中' | '低'; judgments: Judgment[] }) {
  const { holdings, hasHoldings, openMe, openStock, openReview, lessons } = useStore()
  const relief = a.tone === 'relief'
  const held = a.hits.filter((h) => (holdings[h] ?? 0) > 0)
  return (
    <article className="overflow-hidden rounded-lg border border-hairline">
      <header className="px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-1.5"><LevelTag level={level} />{relief ? <Tag tone="green">好消息</Tag> : null}<span className="text-xs text-steel">{a.when}</span></div>
        <h2 className="mt-1.5 text-lg font-semibold leading-snug tracking-tight">{a.title}</h2>
      </header>
      <Part label="发生了什么">{a.chain[0].text}。</Part>
      <Part label="为什么和你有关">
        你的自选里有 {a.hits.length} 只会受影响：
        {a.hits.map((h, i) => (
          <span key={h}>{i ? '、' : ''}<button type="button" onClick={() => openStock(h)} className="font-medium text-ink underline decoration-hairline-strong underline-offset-2 hover:decoration-ink">{stockOf(h).name}</button>{holdings[h] ? `（占你持仓 ${Math.round(holdings[h] * 100)}%）` : ''}</span>
        ))}
        。{a.chain.length > 1 ? `${a.chain[a.chain.length > 2 ? 1 : a.chain.length - 1].text}。` : ''}
      </Part>
      <Part label="管家怎么看">
        {judgments.length ? (
          <div className="flex flex-col gap-3">
            {judgments.map((j) => {
              const prior = priorLessons(j, lessons)
              return (
                <div key={j.id}>
                  <p>{j.text}。<span className="text-steel">如果{j.invalid}，这条判断作废。</span></p>
                  {prior.length ? <p className="mt-1 text-[13px] text-steel">参考了以往记下的 {prior.length} 条经验：{prior[0].text}</p> : null}
                  {j.status === 'pending' ? <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2"><VoteButtons j={j} /><button type="button" onClick={() => openReview(j.id)} className="text-[13px] text-link hover:underline">和管家聊聊这条 →</button></div> : null}
                </div>
              )
            })}
          </div>
        ) : relief ? '这是缓解风险的消息，我只提醒你，不做涨跌判断。' : '影响还不够明确，我先记下来，不做判断。'}
      </Part>
      <Part label="你可以做什么">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openStock(a.hits[0])}>看证据和走势</Button>
          {relief ? null : held.length ? <Button onClick={() => openMe('holdings')}>看调仓方案</Button> : hasHoldings ? null : <Button onClick={() => openMe('holdings')}>补充持仓，看对我的影响</Button>}
        </div>
        {relief || held.length || !hasHoldings ? null : <p className="mt-2 text-[13px] text-steel">受影响的股票你都没有持有，不需要调仓。</p>}
      </Part>
    </article>
  )
}

/** 上一个交易日波动很大的自选股，合成一张卡，并尽量说出原因 */
function MovesCard({ moves, judgments }: { moves: Anomaly[]; judgments: Judgment[] }) {
  const { tick, openStock } = useStore()
  return (
    <article className="overflow-hidden rounded-lg border border-hairline">
      <header className="px-4 py-3.5">
        <span className="text-xs text-steel">已经发生的大幅波动</span>
        <h2 className="mt-1 text-lg font-semibold leading-snug tracking-tight">{moves.length} 只自选股出现了大涨或大跌</h2>
      </header>
      <ul>
        {moves.map((a) => {
          const j = judgments.find((x) => x.anomaly.id === a.id)
          return (
            <li key={a.id} className="border-t border-hairline-soft px-4 py-3">
              <button type="button" onClick={() => openStock(a.hits[0])} className={cn('text-left text-[15px] font-medium hover:underline', a.tone === 'risk' ? 'text-down' : 'text-up')}>{a.title}</button>
              <p className="mt-0.5 text-sm text-slate">{whyLine(a, tick)}</p>
              {j ? <div className="mt-2 text-sm text-charcoal"><p><span className="text-steel">管家认为：</span>{j.text}。</p>{j.status === 'pending' ? <div className="mt-2"><VoteButtons j={j} /></div> : null}</div> : null}
            </li>
          )
        })}
      </ul>
    </article>
  )
}
