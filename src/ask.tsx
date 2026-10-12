/** 向管家提问的对话面板。PC 上嵌在今日页右侧栏，手机上从底部输入条弹出。对话存在全局状态里，换页面不丢。 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ArrowUp } from 'lucide-react'
import { answerLocal, askLlm, SUGGESTED, type Link } from './assistant'
import { Button, cn } from './kit'
import { useStore } from './store'

export function useGo() {
  const st = useStore()
  return (l: Link) => { if (l.review) st.openReview(l.review); else if (l.code) st.openStock(l.code); else if (l.me) st.openMe(l.me); else if (l.page) st.setPage(l.page) }
}

export function AskPanel({ onNavigate, autoFocus }: { onNavigate?: () => void; autoFocus?: boolean }) {
  const { tick, prevTick, votes, holdings, hasHoldings, lessons, llm, remember, chat, setChat } = useStore()
  const inputId = useId()
  const go = useGo()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  // 有新消息时滚到底
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [chat])

  const ask = async (q: string) => {
    const text = q.trim()
    if (!text || busy) return
    setInput('')
    const ctx = { tick, prevTick, votes, holdings, hasHoldings, lessons }
    const local = answerLocal(text, ctx)
    remember({ kind: 'ask', text: `问过：${text}` })
    if (!(llm.on && llm.url && llm.key && llm.model)) { setChat((l) => [...l, { q: text, a: local }]); return }
    setBusy(true)
    setChat((l) => [...l, { q: text }])
    try {
      const reply = await askLlm(text, ctx, llm)
      setChat((l) => l.map((m, i) => (i === l.length - 1 ? { q: text, a: { text: reply.split(/\n+/), links: local.links } } : m)))
    } catch (e) {
      // 模型接口出错时退回本地回答，并说明原因
      setChat((l) => l.map((m, i) => (i === l.length - 1 ? { q: text, a: local, error: `模型接口没有答上来（${e instanceof Error ? e.message : '未知错误'}），下面是本地回答。` } : m)))
    } finally { setBusy(false) }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(input) }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={box} className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
        {chat.length === 0 ? (
          <p className="text-sm leading-relaxed text-slate">可以问我今天要注意什么、某只自选股怎么了、我以前说得准不准、记下了哪些经验，或者要不要调仓。</p>
        ) : (
          <div className="flex flex-col gap-4">
            {chat.map((m, i) => (
              <div key={i}>
                <p className="ml-auto w-fit max-w-[88%] rounded-lg bg-tint-gray px-3 py-2 text-sm">{m.q}</p>
                <div className="mt-2 text-sm leading-relaxed text-charcoal">
                  {m.error ? <p className="mb-1 text-[13px] text-warning">{m.error}</p> : null}
                  {m.a ? m.a.text.map((t, k) => <p key={k} className="mb-1.5">{t}</p>) : <p className="text-steel">正在想…</p>}
                  {m.a?.links.length ? <div className="mt-2 flex flex-wrap gap-1.5">{m.a.links.map((l) => <Button key={l.label} size="xs" onClick={() => { go(l); onNavigate?.() }}>{l.label} →</Button>)}</div> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-hairline px-4 pb-3 pt-2.5">
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {SUGGESTED.map((s) => <button key={s} type="button" onClick={() => void ask(s)} className="shrink-0 rounded-full border border-hairline bg-canvas px-2.5 py-1 text-xs text-slate hover:bg-hover">{s}</button>)}
        </div>
        <form onSubmit={submit} className="mt-2 flex gap-2">
          <label htmlFor={inputId} className="sr-only">向管家提问</label>
          <input id={inputId} value={input} onChange={(e) => setInput(e.target.value)} placeholder="问问管家，比如：立讯精密怎么了？" autoComplete="off" autoFocus={autoFocus}
            className="h-9 min-w-0 flex-1 rounded-md border border-hairline-strong bg-canvas px-3 text-sm outline-none placeholder:text-stone focus:border-primary focus:ring-1 focus:ring-primary" />
          <button type="submit" disabled={busy || !input.trim()} aria-label="发送" className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-white hover:bg-primary-pressed disabled:opacity-40')}><ArrowUp className="h-4 w-4" /></button>
        </form>
        <p className="mt-1.5 text-[11px] text-stone">目前由内置规则回答，能答的问题有限。</p>
      </div>
    </div>
  )
}
