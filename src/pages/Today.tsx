/** 今日：管家先开口，用大白话说今天有什么事和你的自选有关；下面可以直接提问。 */
import { useState, type FormEvent, type ReactNode } from 'react'
import { answerLocal, askLlm, SUGGESTED, type Answer, type Link } from '../assistant'
import { anomaliesAt, fmtDate, grade, isFresh, judgmentsAt, stockOf, whyLine, type Anomaly, type Judgment } from '../engine'
import { Button, cn, LevelTag, Tag } from '../kit'
import { JudgmentCard, VoteButtons } from '../parts'
import { newlySettled, nudges } from '../proactive'
import { useStore } from '../store'

export function TodayPage() {
  const st = useStore()
  const { tick, prevTick, nextTick, setTick, votes, prefs, holdings, hasHoldings, weightOf } = st
  const fresh = anomaliesAt(tick).filter((a) => isFresh(a, tick, prevTick))
  const events = fresh.filter((a) => !a.auto)
  const moves = fresh.filter((a) => a.auto)
  const js = judgmentsAt(tick)
  const settled = newlySettled(tick, prevTick)
  const pending = js.filter((j) => j.status === 'pending' && j.issued !== tick)
  const tips = nudges({ tick, prevTick, votes, prefs, holdings, hasHoldings })
  // 一件事的等级取它影响到的自选里最高的那个
  const levelOf = (a: Anomaly) => a.hits.map((h) => grade(a.strength, weightOf(h), prefs[h] ?? 'normal')).sort((x, y) => y.score - x.score)[0]
  const sorted = [...events].sort((a, b) => levelOf(b).score - levelOf(a).score)
  const count = events.length + (moves.length ? 1 : 0)

  const go = (l: Link) => { if (l.code) st.openStock(l.code); else if (l.me) st.openMe(l.me); else if (l.page) st.setPage(l.page) }

  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 lg:px-6">
      <p className="text-sm text-steel">{fmtDate(tick)} 早上 · 开盘前</p>
      <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">
        {count ? `今天有 ${count} 件事和你的自选有关` : '今天没有新的事需要你看'}
      </h1>
      <p className="mt-1.5 text-[15px] text-slate">
        {count ? '我按重要程度排好了。每件事都说清发生了什么、为什么和你有关、我怎么看。' : pending.length ? `还有 ${pending.length} 条判断在等结果，到期我会告诉你。` : '自选股上一切平静。'}
      </p>

      {tips.length ? (
        <ul className="mt-5 flex flex-col gap-2">
          {tips.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-tint-lavender px-3.5 py-2.5 text-sm text-on-lavender">
              <span className="min-w-0 flex-1">{t.text}</span>
              {t.action ? <button type="button" onClick={() => go(t.action!)} className="shrink-0 font-medium underline underline-offset-2">{t.action.label}</button> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 flex flex-col gap-4">
        {sorted.map((a) => <EventCard key={a.id} a={a} level={levelOf(a).level} judgments={js.filter((j) => j.anomaly.id === a.id)} onOpen={(c) => st.openStock(c)} />)}
        {moves.length ? <MovesCard moves={moves} tick={tick} onOpen={(c) => st.openStock(c)} judgments={js} /> : null}
      </div>

      {settled.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">有结果了</h2>
          <p className="mb-3 mt-0.5 text-[13px] text-steel">这些判断到期了，或者提前出了结果。说对说错都写了原因。</p>
          <div className="flex flex-col gap-2.5">{settled.map((j) => <JudgmentCard key={j.id} j={j} compact onOpen={() => st.openStock(j.code)} />)}</div>
        </section>
      ) : null}

      <Ask onGo={go} />

      {nextTick ? (
        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-hairline-strong px-4 py-3.5">
          <p className="min-w-0 flex-1 text-sm text-slate">这是一段真实历史的回放。想知道后来怎么样了？</p>
          <Button variant="dark" onClick={() => setTick(nextTick)}>看下一天（{fmtDate(nextTick)}）→</Button>
        </div>
      ) : null}
    </div>
  )
}

function Part({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-x-4 gap-y-1 border-t border-hairline-soft px-4 py-3 sm:grid-cols-[104px_1fr]"><p className="pt-0.5 text-[13px] text-steel">{label}</p><div className="min-w-0 text-[15px] leading-relaxed text-charcoal">{children}</div></div>
}

/** 一件事一张卡，固定四段：发生了什么 / 为什么和你有关 / 管家怎么看 / 你可以做什么 */
function EventCard({ a, level, judgments, onOpen }: { a: Anomaly; level: '高' | '中' | '低'; judgments: Judgment[]; onOpen: (code: string) => void }) {
  const { holdings, hasHoldings, openMe } = useStore()
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
          <span key={h}>{i ? '、' : ''}<button type="button" onClick={() => onOpen(h)} className="font-medium text-ink underline decoration-hairline-strong underline-offset-2 hover:decoration-ink">{stockOf(h).name}</button>{holdings[h] ? `（占你持仓 ${Math.round(holdings[h] * 100)}%）` : ''}</span>
        ))}
        。{a.chain.length > 1 ? `${a.chain[a.chain.length > 2 ? 1 : a.chain.length - 1].text}。` : ''}
      </Part>
      <Part label="管家怎么看">
        {judgments.length ? (
          <div className="flex flex-col gap-3">
            {judgments.map((j) => (
              <div key={j.id}>
                <p>{j.text}。<span className="text-steel">如果{j.invalid}，这条判断作废。</span></p>
                {j.status === 'pending' ? <div className="mt-2"><VoteButtons j={j} /></div> : null}
              </div>
            ))}
          </div>
        ) : relief ? '这是缓解风险的消息，我只提醒你，不做涨跌判断。' : '影响还不够明确，我先记下来，不做判断。'}
      </Part>
      <Part label="你可以做什么">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onOpen(a.hits[0])}>看证据和走势</Button>
          {relief ? null : held.length ? <Button onClick={() => openMe('holdings')}>看调仓方案</Button> : hasHoldings ? null : <Button onClick={() => openMe('holdings')}>补充持仓，看对我的影响</Button>}
        </div>
        {relief || held.length || !hasHoldings ? null : <p className="mt-2 text-[13px] text-steel">受影响的股票你都没有持有，不需要调仓。</p>}
      </Part>
    </article>
  )
}

/** 上一个交易日波动很大的自选股，合成一张卡，并尽量说出原因 */
function MovesCard({ moves, tick, onOpen, judgments }: { moves: Anomaly[]; tick: string; onOpen: (code: string) => void; judgments: Judgment[] }) {
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
              <button type="button" onClick={() => onOpen(a.hits[0])} className={cn('text-left text-[15px] font-medium hover:underline', a.tone === 'risk' ? 'text-down' : 'text-up')}>{a.title}</button>
              <p className="mt-0.5 text-sm text-slate">{whyLine(a, tick)}</p>
              {j ? <div className="mt-2 text-sm text-charcoal"><p><span className="text-steel">管家认为：</span>{j.text}。</p>{j.status === 'pending' ? <div className="mt-2"><VoteButtons j={j} /></div> : null}</div> : null}
            </li>
          )
        })}
      </ul>
    </article>
  )
}

type Msg = { q: string; a?: Answer; error?: string }
function Ask({ onGo }: { onGo: (l: Link) => void }) {
  const { tick, prevTick, votes, holdings, hasHoldings, llm, remember } = useStore()
  const [input, setInput] = useState('')
  const [log, setLog] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)

  const ask = async (q: string) => {
    const text = q.trim()
    if (!text || busy) return
    setInput('')
    const ctx = { tick, prevTick, votes, holdings, hasHoldings }
    const local = answerLocal(text, ctx)
    remember({ kind: 'ask', text: `问过：${text}` })
    if (!(llm.on && llm.url && llm.key && llm.model)) { setLog((l) => [...l, { q: text, a: local }]); return }
    setBusy(true)
    setLog((l) => [...l, { q: text }])
    try {
      const reply = await askLlm(text, ctx, llm)
      setLog((l) => l.map((m, i) => (i === l.length - 1 ? { q: text, a: { text: reply.split(/\n+/), links: local.links } } : m)))
    } catch (e) {
      // 模型接口出错时退回本地回答，并说明原因
      setLog((l) => l.map((m, i) => (i === l.length - 1 ? { q: text, a: local, error: `模型接口没有答上来（${e instanceof Error ? e.message : '未知错误'}），下面是本地回答。` } : m)))
    } finally { setBusy(false) }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(input) }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">有什么想问的</h2>
      {log.length ? (
        <div className="mt-3 flex flex-col gap-3" aria-live="polite">
          {log.map((m, i) => (
            <div key={i}>
              <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-surface px-3 py-2 text-sm">{m.q}</p>
              <div className="mt-2 max-w-[92%] text-[15px] leading-relaxed text-charcoal">
                {m.error ? <p className="mb-1 text-[13px] text-warning">{m.error}</p> : null}
                {m.a ? m.a.text.map((t, k) => <p key={k} className="mb-1.5">{t}</p>) : <p className="text-steel">正在想…</p>}
                {m.a?.links.length ? <div className="mt-2 flex flex-wrap gap-2">{m.a.links.map((l) => <Button key={l.label} size="xs" onClick={() => onGo(l)}>{l.label} →</Button>)}</div> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTED.map((s) => <button key={s} type="button" onClick={() => void ask(s)} className="rounded-full border border-hairline px-3 py-1.5 text-[13px] text-slate hover:bg-surface">{s}</button>)}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label htmlFor="ask" className="sr-only">向管家提问</label>
        <input id="ask" value={input} onChange={(e) => setInput(e.target.value)} placeholder="问问管家，比如：立讯精密怎么了？" autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-md border border-hairline-strong bg-canvas px-3 text-sm outline-none placeholder:text-stone focus:border-primary focus:ring-1 focus:ring-primary" />
        <Button variant="primary" size="md" type="submit" disabled={busy || !input.trim()}>问</Button>
      </form>
      <p className="mt-1.5 text-xs text-stone">{llm.on ? '已接入你配置的模型接口。' : '目前由内置规则回答，能答的问题有限。'}回答只基于这一刻之前的信息。</p>
    </section>
  )
}
