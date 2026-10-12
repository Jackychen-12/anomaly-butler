/**
 * 和管家对话的面板。PC 上是今日页的右侧栏，手机上从底部输入条弹出。对话存在全局状态里，换页面不丢。
 * 面板从上到下：管家是谁、记着什么 → 管家先开口（问候 + 主动提醒）→ 可以直接点的问题 → 对话 → 输入框。
 */
import { signalOf, TIER_LABEL } from './data/signals'
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowUp, ChevronRight, RotateCcw } from 'lucide-react'
import { answerLocal, askLlm, starters, type Answer, type Link } from './assistant'
import { cn } from './kit'
import { StockChip } from './path'
import { profileLabel, profileSet } from './profile'
import type { Nudge } from './proactive'
import { useStore } from './store'

export function useGo() {
  const st = useStore()
  return (l: Link) => { if (l.tier) { const sig = signalOf(l.tier.id); st.setRules({ ...st.rules, tiers: { ...st.rules.tiers, [l.tier.id]: l.tier.to } }, `按管家的提议，把「${sig?.name}」的提醒档位调到${TIER_LABEL[l.tier.to]}`); st.setPage('signals') } else if (l.review) st.openReview(l.review); else if (l.code) st.openStock(l.code); else if (l.me) st.openMe(l.me); else if (l.page) st.setPage(l.page) }
}

const Avatar = () => <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-ink text-[11px] font-semibold text-canvas">异</span>

/** 去处：一行小字链接，带箭头 */
function Jump({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex h-7 items-center gap-0.5 rounded-sm border border-hairline bg-canvas pl-2.5 pr-1.5 text-[13px] text-ink hover:bg-hover">{label}<ChevronRight className="h-3.5 w-3.5 text-stone" /></button>
}

/** 战绩条：说对 / 说错的比例，数字写在两端 */
function ScoreBar({ hit, miss, void: v }: { hit: number; miss: number; void: number }) {
  const n = hit + miss
  return (
    <div className="mt-2 rounded-md border border-hairline bg-canvas px-3 py-2.5" role="img" aria-label={`说对 ${hit} 条，说错 ${miss} 条${v ? `，作废 ${v} 条` : ''}`}>
      <div className="flex justify-between text-xs text-steel"><span>说对 <b className="text-sm font-semibold tabular-nums text-ink">{hit}</b></span><span>说错 <b className="text-sm font-semibold tabular-nums text-ink">{miss}</b></span></div>
      <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full">
        {n ? <><span className="bg-ink" style={{ width: `${(hit / n) * 100}%` }} /><span className="flex-1 bg-hairline-strong" /></> : <span className="flex-1 bg-hairline" />}
      </div>
      {v ? <p className="mt-1.5 text-xs text-stone">另有 {v} 条因前提变化作废</p> : null}
    </div>
  )
}

function Reply({ a, error, onGo }: { a?: Answer; error?: string; onGo: (l: Link) => void }) {
  return (
    <div className="flex gap-2.5">
      <Avatar />
      <div className="min-w-0 flex-1 pt-0.5 text-sm leading-relaxed text-charcoal">
        {error ? <p className="mb-1 text-[13px] text-warning">{error}</p> : null}
        {a ? a.text.map((t, k) => <p key={k} className="mb-1.5 last:mb-0">{t}</p>)
          : <p className="flex h-5 items-center gap-1" aria-label="正在想">{[0, 1, 2].map((k) => <span key={k} className="h-1.5 w-1.5 animate-pulse rounded-full bg-stone" style={{ animationDelay: `${k * 160}ms` }} />)}</p>}
        {a?.score ? <ScoreBar {...a.score} /> : null}
        {a?.stocks?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{a.stocks.map((c) => <StockChip key={c} code={c} />)}</div> : null}
        {a?.links.length ? <div className="mt-2 flex flex-wrap gap-1.5">{a.links.map((l) => <Jump key={l.label} label={l.label} onClick={() => onGo(l)} />)}</div> : null}
      </div>
    </div>
  )
}

/**
 * tips：管家想主动说的事。传了就在开场白后面列出来（PC 右侧栏用；手机上这些提醒留在主内容里）。
 * headline：开场白里说的「今天有几件事」。
 */
export function AskPanel({ onNavigate, autoFocus, tips, headline, bare }: { onNavigate?: () => void; autoFocus?: boolean; tips?: Nudge[]; headline?: string; bare?: boolean }) {
  const { tick, prevTick, votes, holdings, hasHoldings, lessons, llm, remember, chat, setChat, profile } = useStore()
  const inputId = useId()
  const jump = useGo()
  const go = (l: Link) => { jump(l); onNavigate?.() }
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  // 多出新消息时滚到底；刚打开时停在顶部，先看到管家的开场白
  const seen = useRef(chat.length)
  useEffect(() => {
    if (chat.length !== seen.current && box.current) box.current.scrollTop = box.current.scrollHeight
    seen.current = chat.length
  }, [chat])
  // 输入框随内容长高，最多四行左右
  useEffect(() => { const el = area.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 104)}px` } }, [input])

  const ctx = { tick, prevTick, votes, holdings, hasHoldings, lessons }
  const asked = new Set(chat.map((m) => m.q))
  const quick = starters(ctx).filter((q) => !asked.has(q))

  const ask = async (q: string) => {
    const text = q.trim()
    if (!text || busy) return
    setInput('')
    const local = answerLocal(text, ctx)
    remember({ kind: 'ask', text: `问过：${text}` })
    if (!(llm.on && llm.url && llm.key && llm.model)) { setChat((l) => [...l, { q: text, a: local }]); return }
    setBusy(true)
    setChat((l) => [...l, { q: text }])
    try {
      const reply = await askLlm(text, ctx, llm)
      setChat((l) => l.map((m, i) => (i === l.length - 1 ? { q: text, a: { ...local, text: reply.split(/\n+/) } } : m)))
    } catch (e) {
      // 模型接口出错时退回本地回答，并说明原因
      setChat((l) => l.map((m, i) => (i === l.length - 1 ? { q: text, a: local, error: `模型接口没有答上来（${e instanceof Error ? e.message : '未知错误'}），下面是本地回答。` } : m)))
    } finally { setBusy(false) }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(input) }
  // 回车发送，Shift+回车换行；输入法还在选字时的回车不算
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(input) } }

  const knows = [lessons.length ? `${lessons.length} 条经验` : '', profileSet(profile) ? profileLabel(profile).split(' · ').slice(0, 2).join(' · ') : ''].filter(Boolean).join(' · ')

  return (
    <div className="flex h-full min-h-0 flex-col">
      {bare ? null : (
        <header className="flex shrink-0 items-center gap-2.5 border-b border-hairline px-4 py-3">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink text-sm font-semibold text-canvas">异</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-tight">管家</h2>
            <p className="truncate text-xs text-steel">{knows ? `记着你的 ${knows}` : '用得越多，越了解你'}</p>
          </div>
          {chat.length ? <button type="button" onClick={() => setChat([])} className="flex h-7 items-center gap-1 rounded-sm px-2 text-xs text-steel hover:bg-hover hover:text-ink"><RotateCcw className="h-3.5 w-3.5" />清空对话</button> : null}
        </header>
      )}

      <div ref={box} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-4" aria-live="polite">
          {/* 管家先开口 */}
          <div className="flex gap-2.5">
            <Avatar />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm leading-relaxed text-charcoal">{headline ?? '想到什么直接问我。'}</p>
              {tips?.length ? (
                <ul className="mt-2.5 overflow-hidden rounded-lg border border-hairline bg-canvas">
                  {tips.map((t) => (
                    <li key={t.id} className="border-b border-hairline-soft last:border-b-0">
                      {t.action
                        ? <button type="button" onClick={() => go(t.action!)} className="group flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-surface-soft">
                            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                            <span className="min-w-0 flex-1"><span className="block text-[13px] leading-snug text-charcoal">{t.text}</span><span className="mt-1 inline-flex items-center gap-0.5 text-[13px] font-medium text-primary">{t.action.label}<ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span></span>
                          </button>
                        : <p className="flex items-start gap-2 px-3 py-2.5 text-[13px] leading-snug text-charcoal"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />{t.text}</p>}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {/* 还没开始聊：把能问的问题摆出来 */}
          {chat.length === 0 ? (
            <div className="pl-[34px]">
              <p className="mb-1.5 text-xs text-steel">可以这样问我</p>
              <ul className="overflow-hidden rounded-lg border border-hairline bg-canvas">
                {quick.map((q) => (
                  <li key={q} className="border-b border-hairline-soft last:border-b-0">
                    <button type="button" onClick={() => void ask(q)} className="group flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-surface-soft">
                      <span className="min-w-0 flex-1">{q}</span><ArrowUp className="h-3.5 w-3.5 shrink-0 rotate-45 text-stone group-hover:text-ink" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {chat.map((m, i) => (
            <div key={i} className="flex flex-col gap-3">
              <p className="ml-auto w-fit max-w-[86%] rounded-lg rounded-br-xs bg-ink px-3 py-2 text-sm leading-snug text-canvas">{m.q}</p>
              <Reply a={m.a} error={m.error} onGo={go} />
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-3 pt-1">
        {chat.length && quick.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quick.slice(0, 3).map((q) => <button key={q} type="button" onClick={() => void ask(q)} className="rounded-full border border-hairline bg-canvas px-2.5 py-1 text-xs text-slate hover:bg-hover hover:text-ink">{q}</button>)}
          </div>
        ) : null}
        <form onSubmit={submit} className="flex items-end gap-2 rounded-lg border border-hairline-strong bg-canvas py-1.5 pl-3 pr-1.5 shadow-subtle focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
          <label htmlFor={inputId} className="sr-only">向管家提问</label>
          <textarea ref={area} id={inputId} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} placeholder="问问管家…" autoComplete="off" autoFocus={autoFocus}
            className="min-h-7 min-w-0 flex-1 resize-none bg-transparent py-1 text-sm leading-5 outline-none placeholder:text-stone focus-visible:outline-none" />
          <button type="submit" disabled={busy || !input.trim()} aria-label="发送" className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-white transition-colors hover:bg-primary-pressed disabled:bg-hairline disabled:text-stone')}><ArrowUp className="h-4 w-4" /></button>
        </form>
        <p className="mt-1.5 text-center text-[11px] text-stone">回车发送 · 目前由内置规则回答，能答的问题有限</p>
      </div>
    </div>
  )
}
