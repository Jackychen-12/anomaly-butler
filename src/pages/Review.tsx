/**
 * 复盘：左边是全部判断，右边是和管家就某一条判断的对话。
 * 结果出来前在对话里表态、说理由；出来后一起看为什么对或错，总结经验记进长期记忆。
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowUp } from 'lucide-react'
import { signalOf } from '../data/signals'
import { fmtDate, judgmentsAt, reviewBySignal, score, stockOf, type Judgment } from '../engine'
import { Button, cn, Stamp, Tag } from '../kit'
import { scrollParent, Split, useIsDesktop } from '../layout'
import { PriceChart } from '../parts'
import { buildThread, unreviewed } from '../review'
import { useStore } from '../store'

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
        <h1 className="text-lg font-semibold tracking-tight">复盘</h1>
        <p className="mt-0.5 text-[13px] text-steel">每条判断到期按真实收盘价对答案。说对说错都和管家聊一遍，把经验记下来。</p>
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

  return <Split list={list} showDetail={!!current} detail={current ? <Dialogue key={current.id} j={current} onBack={desktop ? undefined : () => setReviewId(null)} /> : <p className="p-6 text-sm text-steel">还没有判断。</p>} />
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

/** 和管家就一条判断的对话：上面是判断和走势，中间是对话，底部是快捷回复和输入框。 */
function Dialogue({ j, onBack }: { j: Judgment; onBack?: () => void }) {
  const { tick, votes, vote, dialog, reviewState, lessons, say, decide, openStock } = useStore()
  const inputId = useId()
  const [input, setInput] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const turns = dialog[j.id] ?? []
  const thread = buildThread(j, { tick, vote: votes[j.id], turns, state: reviewState[j.id], lessons })
  // 对话里多出新的一句话时，滚到底部；刚打开时停在顶部，先看到判断和走势
  const count = thread.msgs.length
  const seen = useRef(count)
  useEffect(() => {
    if (count > seen.current) { const box = scrollParent(end.current); if (box) box.scrollTop = box.scrollHeight }
    seen.current = count
  }, [count])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    say(j, text)
    setInput('')
  }
  const sig = signalOf(j.anomaly.signal)

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-[760px] flex-1 px-4 py-4 lg:px-8 lg:py-6">
        {onBack ? <button type="button" onClick={onBack} className="-ml-1 mb-2 flex h-8 items-center gap-1 rounded-sm px-1 text-[13px] text-slate hover:bg-hover"><ArrowLeft className="h-4 w-4" />全部判断</button> : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag>{sig?.name ?? j.anomaly.cat}</Tag>
          <span className="text-xs text-steel">{fmtDate(j.issued)} 早上发出 · {j.status === 'pending' ? (j.dueDate ? `${fmtDate(j.dueDate)} 收盘后对答案` : '在等结果') : `${fmtDate(j.settledOn!)} 出结果`}</span>
          {j.status === 'pending' ? null : <span className="ml-auto origin-right scale-90"><Stamp status={j.status} /></span>}
        </div>
        <h2 className="mt-2 text-xl font-semibold leading-snug tracking-tight">{j.text}</h2>
        <button type="button" onClick={() => openStock(j.code)} className="mt-1 text-[13px] text-link hover:underline">看{stockOf(j.code).name}的走势、原因和证据 →</button>

        <div className="mt-3 rounded-lg border border-hairline p-3">
          <p className="mb-1 text-xs text-steel">近 40 个交易日收盘价 · <span className="text-warning">▼</span> 判断发出前一个交易日</p>
          <PriceChart code={j.code} anomalies={[j.anomaly]} judgment={j} />
        </div>

        <ol className="mt-5 flex flex-col gap-3" aria-live="polite" aria-label="和管家的对话">
          {thread.msgs.map((m, i) => m.who === 'me' ? (
            <li key={i} className="ml-auto w-fit max-w-[85%] rounded-lg bg-tint-gray px-3 py-2 text-sm">{m.text}</li>
          ) : (
            <li key={i} className="flex max-w-[92%] gap-2.5">
              <span aria-hidden="true" className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-ink text-[11px] font-semibold text-canvas', i > 0 && thread.msgs[i - 1].who === 'butler' && 'invisible')}>异</span>
              <div className="min-w-0 text-[15px] leading-relaxed text-charcoal">
                <p>{m.text}</p>
                {m.list ? <ul className="mt-1 list-disc pl-5 text-sm text-slate">{m.list.map((t, k) => <li key={k}>{t}</li>)}</ul> : null}
              </div>
            </li>
          ))}
        </ol>
        <div ref={end} />
      </div>

      <div className="sticky bottom-0 border-t border-hairline bg-canvas">
        <div className="mx-auto w-full max-w-[760px] px-4 py-2.5 lg:px-8">
          {thread.replies.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {thread.replies.map((r) => (
                <Button key={r.label} size="sm" variant={r.primary ? 'primary' : 'secondary'} aria-pressed={'vote' in r.act ? !!r.primary : undefined}
                  onClick={() => ('vote' in r.act ? vote(j.id, r.act.vote, j.text, j.code) : decide(j, r.act.decide))}>{r.label}</Button>
              ))}
            </div>
          ) : null}
          <form onSubmit={submit} className="flex gap-2">
            <label htmlFor={inputId} className="sr-only">{thread.placeholder}</label>
            <input id={inputId} value={input} onChange={(e) => setInput(e.target.value)} placeholder={thread.placeholder} autoComplete="off"
              className="h-9 min-w-0 flex-1 rounded-md border border-hairline-strong bg-canvas px-3 text-sm outline-none placeholder:text-stone focus:border-primary focus:ring-1 focus:ring-primary" />
            <button type="submit" disabled={!input.trim()} aria-label="发送" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-white hover:bg-primary-pressed disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>
          </form>
        </div>
      </div>
    </div>
  )
}
