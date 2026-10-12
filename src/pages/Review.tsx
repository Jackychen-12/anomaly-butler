/**
 * 判断：左边是全部判断，右边把一条判断按固定的五步走一遍——
 * 发生了什么（传导路径）→ 管家怎么看 → 你怎么看（落到哪一环）→ 你打算怎么做 → 对答案与复盘。
 * 每条都按同一个顺序想，是为了帮用户养成成体系的思考习惯。
 */
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowUp, Check } from 'lucide-react'
import { signalOf } from '../data/signals'
import { JudgmentMeter } from '../charts'
import { evalLine, fmtDate, judgmentsAt, myResult, reviewBySignal, score, signed, stockOf, type Judgment } from '../engine'
import { Button, cn, Stamp, Tag } from '../kit'
import { Split, useIsDesktop } from '../layout'
import { PriceChart } from '../parts'
import { PathTree } from '../path'
import { Planner } from '../planner'
import { meaning } from '../profile'
import { priorLessons, reasonLabel, REASONS, unreviewed } from '../review'
import { useStore, VOTE_LABEL } from '../store'
import type { Vote } from '../data/case'

type Filter = 'all' | 'waiting' | 'todo' | 'done'

export function ReviewPage() {
  const { tick, votes, reviewState, reviewId, setReviewId, setPage } = useStore()
  const desktop = useIsDesktop()
  const [filter, setFilter] = useState<Filter>('all')
  const js = judgmentsAt(tick)
  const sc = score(js, votes)
  const todo = unreviewed(js, reviewState)
  const waiting = js.filter((j) => j.status === 'pending')
  const done = js.filter((j) => j.status !== 'pending' && reviewState[j.id])
  const shown = filter === 'waiting' ? waiting : filter === 'todo' ? todo : filter === 'done' ? done : [...todo, ...waiting, ...done]
  // PC 上没有选中时，默认打开最该看的一条：先是没复盘的，再是在等结果的。选定后固定下来，复盘完不会自己跳走
  const fallback = desktop ? todo[0] ?? waiting[0] ?? js[0] : undefined
  const current = js.find((j) => j.id === reviewId) ?? fallback
  useEffect(() => { if (!reviewId && fallback) setReviewId(fallback.id) }, [reviewId, fallback, setReviewId])
  const bySignal = reviewBySignal(tick)
  const FILTERS: [Filter, string, number][] = [['all', '全部', js.length], ['todo', '待复盘', todo.length], ['waiting', '在等结果', waiting.length], ['done', '已复盘', done.length]]

  const list = (
    <>
      <div className="border-b border-hairline px-4 pb-3 pt-4">
        <h1 className="text-lg font-semibold tracking-tight">判断</h1>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-steel">管家</dt><dd className="tabular-nums"><b className="font-semibold">{sc.butler.hit}</b> 说对 · <b className="font-semibold">{sc.butler.miss}</b> 说错 · {sc.butler.void} 作废</dd>
          <dt className="text-steel">我</dt><dd className="tabular-nums"><b className="font-semibold">{sc.me.right}</b> 看对 · <b className="font-semibold">{sc.me.wrong}</b> 看错{sc.split.butler + sc.split.me ? ` · 意见不同时 管家 ${sc.split.butler}：我 ${sc.split.me}` : ''}</dd>
        </dl>
      </div>
      <div className="flex flex-wrap gap-0.5 px-3 pb-1.5 pt-2.5">
        {FILTERS.map(([k, label, n]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
            className={cn('h-7 rounded-sm px-2 text-[13px] text-slate hover:bg-hover', filter === k && 'bg-hover font-medium text-ink')}>{label} {n}</button>
        ))}
      </div>
      <ul className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {shown.map((j) => <Row key={j.id} j={j} selected={current?.id === j.id} onPick={() => setReviewId(j.id)} />)}
        {shown.length === 0 ? <li className="px-4 py-8 text-sm text-steel">这一类下面没有判断。</li> : null}
      </ul>
      {bySignal.length ? (
        <details className="border-t border-hairline px-4 py-3 text-[13px]">
          <summary className="cursor-pointer font-medium text-slate hover:text-ink">哪类信号准，哪类不准</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {bySignal.map((r) => (
              <li key={r.def.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{r.def.name}</span>
                <span className="shrink-0 tabular-nums text-steel">对 {r.hit} · 错 {r.miss}</span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setPage('signals')} className="mt-2 text-link hover:underline">去信号库看定义和回测 →</button>
        </details>
      ) : null}
    </>
  )

  return <Split list={list} showDetail={!!current} detail={current ? <Flow key={current.id} j={current} onBack={desktop ? undefined : () => setReviewId(null)} /> : <p className="p-6 text-sm text-steel">还没有判断。</p>} />
}

function Row({ j, selected, onPick }: { j: Judgment; selected: boolean; onPick: () => void }) {
  const { reviewState } = useStore()
  const state = reviewState[j.id]
  return (
    <li>
      <button type="button" onClick={onPick} aria-current={selected || undefined}
        className={cn('flex w-full items-center gap-3 border-b border-hairline-soft px-4 py-2.5 text-left hover:bg-surface-soft', selected && 'bg-surface hover:bg-surface')}>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium">{stockOf(j.code).name}
            {j.status === 'pending' ? null : state ? <span className="text-xs font-normal text-stone">已复盘</span> : <span className="rounded-xs bg-tint-lavender px-1.5 text-xs font-medium text-on-lavender">待复盘</span>}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-steel">{j.anomaly.title}</span>
        </span>
        {j.status === 'pending'
          ? <span className="shrink-0 text-right text-xs leading-tight text-steel tabular-nums">{j.n - j.elapsed} 个交易日后<br />对答案</span>
          : <span className="shrink-0 origin-right scale-[0.8]"><Stamp status={j.status} /></span>}
      </button>
    </li>
  )
}

/** 一步：序号 + 标题 + 内容，左边一条线把五步连起来。done 打勾，muted 表示还没到这一步 */
function Step({ n, title, done, muted, last, children }: { n: number; title: string; done?: boolean; muted?: boolean; last?: boolean; children: ReactNode }) {
  return (
    <li className="relative pb-6 pl-10 last:pb-0">
      {last ? null : <span aria-hidden="true" className="absolute bottom-0 left-[13px] top-7 w-px bg-hairline" />}
      <span aria-hidden="true" className={cn('absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold', done ? 'bg-ink text-canvas' : muted ? 'bg-tint-gray text-stone' : 'bg-tint-lavender text-on-lavender')}>{done ? <Check className="h-4 w-4" /> : n}</span>
      <h3 className={cn('pt-0.5 text-base font-semibold', muted && 'text-stone')}>{title}</h3>
      <div className="mt-2.5">{children}</div>
    </li>
  )
}

function Bubbles({ msgs }: { msgs: { who: 'butler' | 'me'; text: string; list?: string[] }[] }) {
  return (
    <ol className="flex flex-col gap-2.5" aria-live="polite">
      {msgs.map((m, i) => m.who === 'me'
        ? <li key={i} className="ml-auto w-fit max-w-[85%] rounded-lg bg-tint-gray px-3 py-2 text-sm">{m.text}</li>
        : <li key={i} className="max-w-[94%] text-[15px] leading-relaxed text-charcoal"><p>{m.text}</p>{m.list ? <ul className="mt-1 list-disc pl-5 text-sm text-slate">{m.list.map((t, k) => <li key={k}>{t}</li>)}</ul> : null}</li>)}
    </ol>
  )
}

function SayBox({ placeholder, onSay }: { placeholder: string; onSay: (text: string) => void }) {
  const id = useId()
  const [input, setInput] = useState('')
  const submit = (e: FormEvent) => { e.preventDefault(); const t = input.trim(); if (!t) return; onSay(t); setInput('') }
  return (
    <form onSubmit={submit} className="mt-3 flex gap-2">
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <input id={id} value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} autoComplete="off"
        className="h-9 min-w-0 flex-1 rounded-md border border-hairline-strong bg-canvas px-3 text-sm outline-none placeholder:text-stone focus:border-primary focus:ring-1 focus:ring-primary" />
      <button type="submit" disabled={!input.trim()} aria-label="发送" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-white hover:bg-primary-pressed disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>
    </form>
  )
}

/**
 * 对答案：用图而不是一段话。上面两条横条比「管家说会跌多少」和「实际跌了多少」；
 * 中间两格写谁对了；下面是原因，和一张等你决定记不记的经验卡。
 */
function Outcome({ j }: { j: Judgment }) {
  const { votes, reasons, reviewState, decide } = useStore()
  const v = votes[j.id], mine = myResult(j, v), why = reasonLabel(v, reasons[j.id]), state = reviewState[j.id]
  const said = Math.abs(j.thr), actual = Math.max(0, -(j.worst ?? 0))
  const max = Math.max(said, actual, 1)
  const Bar = ({ label, value, tone, text }: { label: string; value: number; tone: string; text: string }) => (
    <div className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-center gap-3 py-1 text-[13px]">
      <span className="text-steel">{label}</span>
      <span className="h-2.5 rounded-r-[4px] bg-tint-gray" aria-hidden="true"><span className={cn('block h-full rounded-r-[4px]', tone)} style={{ width: `${(value / max) * 100}%`, minWidth: value ? 2 : 0 }} /></span>
      <span className="tabular-nums text-ink">{text}</span>
    </div>
  )
  return (
    <div>
      {j.status === 'void' ? <p className="rounded-md bg-surface px-3 py-2 text-sm text-charcoal">这条作废了，不算对也不算错。{j.voidOn?.text}。</p> : (
        <div className="rounded-lg border border-hairline px-3.5 py-2.5" role="img" aria-label={`管家说会跌超过 ${said}%，实际最多跌了 ${actual.toFixed(2)}%`}>
          <Bar label="管家说会跌超过" value={said} tone="bg-stone" text={`${said}%`} />
          <Bar label={j.status === 'hit' ? '跌破当天跌到' : `${j.n} 天里最多跌了`} value={actual} tone={j.status === 'hit' ? 'bg-down' : 'bg-ink'} text={(j.worst ?? 0) > 0 ? `没跌，涨了 ${signed(j.worst ?? 0)}%` : `${actual.toFixed(2)}%`} />
        </div>
      )}
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <div className="rounded-lg border border-hairline px-3.5 py-2.5">
          <p className="text-xs text-steel">管家</p>
          <p className="mt-0.5 text-[15px] font-semibold">{j.status === 'hit' ? '✓ 说对了' : j.status === 'miss' ? '✗ 说错了' : '不计入'}</p>
        </div>
        <div className="rounded-lg border border-hairline px-3.5 py-2.5">
          <p className="text-xs text-steel">我 · {v ? VOTE_LABEL[v] : '没表态'}{why ? ` · ${why}` : ''}</p>
          <p className="mt-0.5 text-[15px] font-semibold">{mine == null ? '不计入' : mine ? '✓ 看对了' : '✗ 看错了'}{mine != null && why ? <span className="ml-2 text-[13px] font-normal text-steel">这个理由{mine ? '站住了' : '没站住'}</span> : null}</p>
        </div>
      </div>
      {j.review ? (
        <>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm text-charcoal">
            <dt className="text-steel">{j.status === 'hit' ? '为什么对' : j.status === 'miss' ? '为什么错' : '为什么作废'}</dt><dd>{j.review.why}</dd>
            <dt className="text-steel">当时漏看了</dt><dd>{j.review.missed}</dd>
          </dl>
          <div className={cn('mt-3 rounded-lg px-3.5 py-3', state === 'kept' ? 'bg-tint-mint text-on-mint' : state === 'skipped' ? 'bg-surface text-steel' : 'bg-tint-yellow text-on-yellow')}>
            <p className="text-xs font-semibold">{state === 'kept' ? '经验 · 已记进长期记忆' : state === 'skipped' ? '经验 · 这条没记' : '管家想记下一条经验'}</p>
            <p className="mt-1 text-[15px] leading-snug">{j.review.lesson}</p>
            {state ? null : <div className="mt-2.5 flex gap-1.5"><Button size="sm" variant="primary" onClick={() => decide(j, 'kept')}>记下来</Button><Button size="sm" onClick={() => decide(j, 'skipped')}>不用记</Button></div>}
          </div>
        </>
      ) : state ? null : <div className="mt-3 flex items-center gap-2 text-sm text-steel"><span>这条管家还没总结出经验。</span><Button size="xs" onClick={() => decide(j, 'ack')}>知道了</Button></div>}
    </div>
  )
}

/** 一条判断的五步。 */
function Flow({ j, onBack }: { j: Judgment; onBack?: () => void }) {
  const { tick, votes, vote, reasons, setReason, dialog, reviewState, lessons, say, openStock, holdings, hasHoldings, openMe, profile } = useStore()
  const turns = dialog[j.id] ?? []
  const v = votes[j.id]
  const pending = j.status === 'pending'
  const sig = signalOf(j.anomaly.signal)
  const prior = priorLessons(j, lessons)
  const mean = meaning(profile, j)
  const held = (holdings[j.code] ?? 0) > 0
  const judged = j.anomaly.judgments.map((d) => d.code)
  const options = v && v !== 'watch' ? REASONS[v] : []

  return (
    <div className="mx-auto w-full max-w-[780px] px-4 py-4 lg:px-8 lg:py-6">
      {onBack ? <button type="button" onClick={onBack} className="-ml-1 mb-2 flex h-8 items-center gap-1 rounded-sm px-1 text-[13px] text-slate hover:bg-hover"><ArrowLeft className="h-4 w-4" />全部判断</button> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag>{sig?.name ?? j.anomaly.cat}</Tag>
        <span className="text-xs text-steel">{fmtDate(j.issued)} 发出 · {pending ? (j.dueDate ? `${fmtDate(j.dueDate)} 收盘后对答案` : '在等结果') : `${fmtDate(j.settledOn!)} 出结果`}</span>
        {j.status === 'pending' ? null : <span className="ml-auto origin-right scale-90"><Stamp status={j.status} /></span>}
      </div>
      <h2 className="mt-2 text-xl font-semibold leading-snug tracking-tight">{j.anomaly.title}</h2>

      <ol className="mt-5">
        <Step n={1} title="发生了什么，怎么传到你的股票" done>
          <PathTree a={j.anomaly} judged={judged} focus={j.code} />
        </Step>

        <Step n={2} title="管家怎么看" done>
          <p className="text-[15px] font-medium leading-snug">{j.text}</p>
          {mean ? <p className="mt-1 text-[13px] text-on-lavender">{mean}</p> : null}
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-4 @min-[640px]:grid-cols-[minmax(0,1fr)_230px]">
            <div className="rounded-lg border border-hairline p-3">
              <button type="button" onClick={() => openStock(j.code)} className="mb-1 text-xs text-link hover:underline">{stockOf(j.code).name} 近 40 个交易日 →</button>
              <PriceChart code={j.code} anomalies={[j.anomaly]} judgment={j} />
            </div>
            <div>
              <JudgmentMeter j={j} />
              <dl className="mt-3 grid gap-y-0.5 text-[13px] text-charcoal [&>dt]:mt-1.5 [&>dt]:text-steel">
                <dt>什么情况下作废</dt><dd>{j.invalid}</dd>
                <dt>这类信号以往</dt><dd>{evalLine(j.anomaly.signal, tick)}</dd>
                {prior.length ? <><dt>参考的经验</dt><dd>{prior.map((l) => l.text).join(' ')}</dd></> : null}
              </dl>
            </div>
          </div>
        </Step>

        <Step n={3} title="你怎么看" done={!!v}>
          <div className="flex flex-wrap items-center gap-1.5">
            {(['agree', 'disagree', 'watch'] as Vote[]).map((k) => (
              <Button key={k} size="sm" variant={v === k ? 'primary' : 'secondary'} aria-pressed={v === k} disabled={!pending} onClick={() => vote(j.id, k, j.text, j.code)}>{VOTE_LABEL[k]}</Button>
            ))}
            {pending ? null : <span className="text-xs text-steel">{v ? '已经出结果，不能再改' : '出结果前没有表态'}</span>}
          </div>
          {options.length ? (
            <div className="mt-3">
              <p className="text-[13px] text-steel">{v === 'agree' ? '你最看重哪一点？' : '你不同意的是哪一环？'}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {options.map((o) => (
                  <button key={o.key} type="button" disabled={!pending} aria-pressed={reasons[j.id] === o.key} onClick={() => setReason(j, o.key, o.label)}
                    className={cn('h-8 rounded-full border px-3 text-[13px] disabled:cursor-default', reasons[j.id] === o.key ? 'border-primary bg-tint-lavender font-medium text-on-lavender' : 'border-hairline text-slate enabled:hover:bg-surface-soft disabled:opacity-50')}>{o.label}</button>
                ))}
              </div>
            </div>
          ) : null}
          {turns.some((t) => t.phase === 'pending') ? <div className="mt-3"><Bubbles msgs={turns.filter((t) => t.phase === 'pending')} /></div> : null}
          {pending ? <SayBox placeholder="还想补充理由？写给管家，到期一起回头看" onSay={(t) => say(j, t)} /> : null}
        </Step>

        <Step n={4} title="你打算怎么做" muted={!held}>
          {held && (pending || j.status === 'hit') ? <Planner j={j} />
            : held ? <p className="text-sm text-steel">这条已经有结果，价格没有跌破，不需要再做什么。</p>
            : <p className="text-sm text-steel">你{hasHoldings ? `没有持有${stockOf(j.code).name}，不需要动作。` : '还没有填持仓。'}{hasHoldings ? null : <button type="button" onClick={() => openMe('holdings')} className="ml-1 text-link hover:underline">填上持仓，看几种做法 →</button>}</p>}
        </Step>

        <Step n={5} title="对答案与复盘" done={!!reviewState[j.id]} muted={pending} last>
          {pending ? <p className="text-sm text-steel">还有 {j.n - j.elapsed} 个交易日。到时候管家会告诉你结果，一起看为什么对、为什么错，把经验记下来。</p> : (
            <>
              <Outcome j={j} />
              {turns.some((t) => t.phase === 'settled') ? <div className="mt-3"><Bubbles msgs={turns.filter((t) => t.phase === 'settled')} /></div> : null}
              <SayBox placeholder="写下你自己的经验（会记进长期记忆）" onSay={(t) => say(j, t)} />
            </>
          )}
        </Step>
      </ol>
    </div>
  )
}
