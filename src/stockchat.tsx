/**
 * 自选个股页右侧的对话：管家围绕这只股票先开口（今天最要紧的是什么、它怎么看、和你的仓位有什么关系），
 * 你点选项回应——定仓位做法、要不要多提醒——也可以点现成的问题或直接打字问。
 * 做法和提醒偏好点了就记下；判断的表态和对答案仍在判断页。
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowUp, ChevronRight } from 'lucide-react'
import { answerLocal, askLlm } from './assistant'
import { signalOf } from './data/signals'
import { evalLine, gradeReason, isFresh, PREF_LABEL, stockOf, whyLine, type Anomaly, type Judgment, type Pref } from './engine'
import { cn, LevelTag } from './kit'
import { llmName, llmReady } from './llm'
import { planLabel, plansOf } from './planner'
import { conflict, fitPlan, profileLabel } from './profile'
import { useStore } from './store'

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`
const Avatar = () => <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-ink text-[11px] font-semibold text-canvas">异</span>
/** 管家说的一段话 */
const Say = ({ children }: { children: ReactNode }) => <div className="flex gap-2.5"><Avatar /><div className="min-w-0 flex-1 rounded-lg rounded-tl-sm bg-canvas px-3 py-2.5 text-sm leading-relaxed text-charcoal shadow-subtle">{children}</div></div>
/** 我说的一句话 */
const Me = ({ children }: { children: ReactNode }) => <div className="flex justify-end"><p className="max-w-[85%] rounded-lg rounded-tr-sm bg-primary px-3 py-2 text-sm leading-relaxed text-white">{children}</p></div>
/** 可以点的回应 */
const Reply = ({ on, onClick, children }: { on?: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} aria-pressed={on} className={cn('rounded-full border px-3 py-1.5 text-left text-[13px] transition-colors', on ? 'border-primary bg-tint-lavender font-medium text-on-lavender' : 'border-hairline-strong bg-canvas text-ink hover:bg-surface-soft')}>{children}</button>
)

export function StockChat({ code, anomalies, judgments, focus }: { code: string; anomalies: Anomaly[]; judgments: Judgment[]; focus?: Anomaly }) {
  const st = useStore()
  const { tick, prevTick, gradeOf, holdings, hasHoldings, plans, savePlan, prefs, setPref, profile, openReview, openMe, votes, lessons, llm, memory, remember } = st
  const s = stockOf(code), name = s.name.replace('-W', '')
  const w = holdings[code] ?? 0
  const fresh = anomalies.filter((a) => isFresh(a, tick, prevTick)).sort((x, y) => gradeOf(y, code).score - gradeOf(x, code).score)
  const top = focus ?? fresh[0] ?? anomalies[0]
  const g = top ? gradeOf(top, code) : null
  // 定做法依据的判断：在等结果的优先，其次是已经到价的
  const plan = w ? judgments.find((j) => j.status === 'pending') ?? judgments.find((j) => j.status === 'hit') : undefined
  const chosen = plan ? plans[plan.id] : undefined
  const pref = prefs[code] ?? 'normal'

  const [asked, setAsked] = useState<{ q: string; a?: string[]; by?: string }[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { setAsked([]); setInput('') }, [code])
  useEffect(() => { if (asked.length && box.current) box.current.scrollTop = box.current.scrollHeight }, [asked, chosen])

  // 现成的问题：答案由规则给出，说的都是这只股票自己的数据
  const quick: { q: string; a: () => string[] }[] = top ? [
    { q: `为什么是「${g!.level}」？`, a: () => [`${gradeReason(g!)}。`, `算法是：事件影响 ${top.strength} 分，再乘上你的仓位、你对它的提醒偏好和投资画像，得 ${g!.score} 分；70 分以上是高，40 分以上是中。${g!.capped ? '今天已经有更重要的事占了「高」的名额，所以它排在后面。' : ''}`] },
    { q: top.auto ? `它为什么${top.tone === 'risk' ? '跌' : '涨'}？` : '这件事怎么传到它的？', a: () => (top.auto ? [whyLine(top, tick)] : top.chain.map((c) => `${c.label}：${c.text}`)) },
    { q: '这类信号以前准吗？', a: () => [`「${signalOf(top.signal)?.name}」：${evalLine(top.signal, tick)}`, '样本很小，只能参考。'] },
  ] : []
  const ctx = { tick, prevTick, votes, holdings, hasHoldings, lessons }
  const ask = async (q: string, canned?: () => string[]) => {
    const text = q.trim()
    if (!text || busy) return
    setInput('')
    if (canned) { setAsked((l) => [...l, { q: text, a: canned() }]); return }
    remember({ kind: 'ask', code, text: `问过${name}：${text}` })
    const local = answerLocal(text.includes(name) ? text : `${name} ${text}`, ctx).text
    if (!llmReady(llm)) { setAsked((l) => [...l, { q: text, a: local }]); return }
    setBusy(true); setAsked((l) => [...l, { q: text }])
    try {
      const reply = await askLlm(`（正在看${s.name}）${text}`, { ...ctx, own: memory.filter((m) => m.kind === 'own').map((m) => m.text), profile: profileLabel(profile) }, llm)
      setAsked((l) => l.map((m, i) => (i === l.length - 1 ? { q: text, a: reply.split(/\n+/), by: llmName(llm) } : m)))
    } catch { setAsked((l) => l.map((m, i) => (i === l.length - 1 ? { q: text, a: local, by: '模型没答上来，这是按规则给的回答' } : m))) } finally { setBusy(false) }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(input) }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(input) } }

  const post = plan?.status === 'hit', drop = plan ? Math.abs(plan.thr) / 100 : 0
  const choose = (keep: number) => {
    if (!plan) return
    const off = conflict(profile, keep, plan)
    savePlan(plan.id, { keep, off: !!off }, `${s.name}（${post ? '已到价后' : '等结果期间'}）选择了：${planLabel(plan, keep)}${off ? '（和设定的风格不同）' : ''}`, code)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={box} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-3" aria-live="polite">
          {/* 1. 今天最要紧的是什么 */}
          <Say>
            {top && g ? (
              <>
                <span className="mb-1.5 flex flex-wrap items-center gap-1.5"><LevelTag level={g.level} /><span className="text-xs text-steel">{fresh.length ? `今天 ${fresh.length} 条新异动里最要紧的` : '最近的一条异动'}</span></span>
                <b className="font-semibold text-ink">{top.indicators ? top.indicators.map((h) => h.label).join('、') : top.title}</b>
                <span className="mt-1 block text-[13px] text-slate">{gradeReason(g)}。</span>
              </>
            ) : `${name}到现在没有异动，很平静。`}
          </Say>

          {/* 2. 管家的判断 */}
          {judgments.length ? (
            <Say>
              我对{name}有 {judgments.length} 条判断：
              <span className="mt-1.5 flex flex-col gap-1.5">
                {judgments.slice(0, 3).map((j) => (
                  <button key={j.id} type="button" onClick={() => openReview(j.id)} className="flex items-center gap-2 rounded-md border border-hairline px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-soft">
                    <span className="min-w-0 flex-1">{j.up ? '看涨' : '看跌'}：{j.n} 个交易日内{j.up ? '涨过' : '跌破'} <b className="font-semibold tabular-nums">{j.line.toFixed(2)}</b></span>
                    <span className={cn('shrink-0 text-xs', j.status === 'pending' ? 'text-on-lavender' : 'text-steel')}>{j.status === 'pending' ? `还有 ${j.n - j.elapsed} 天` : j.status === 'hit' ? '说对了' : j.status === 'miss' ? '说错了' : '作废'}</span>
                    <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-stone" />
                  </button>
                ))}
              </span>
              <span className="mt-1.5 block text-xs text-steel">点开去表态、对答案。</span>
            </Say>
          ) : top ? <Say>{top.tone === 'relief' ? '这是好消息，我只提醒，不做涨跌判断。' : `这件事上我没有单独对${name}做判断。`}</Say> : null}

          {/* 3. 和你的仓位：定做法 */}
          {!hasHoldings ? (
            <Say>我还不知道你有没有持有它。<button type="button" onClick={() => openMe('holdings')} className="text-link hover:underline">告诉我持仓 →</button></Say>
          ) : !w ? <Say>你没有持有{name}，不用动。</Say> : plan ? (
            <>
              <Say>
                {name}占你持仓的 <b className="font-semibold tabular-nums text-ink">{pct(w)}</b>。{post ? `它已经${plan.up ? '涨过' : '跌破'}了我说的价格。` : '我那条判断还在等结果。'}你打算怎么办？
                <span className="mt-2 flex flex-col gap-1.5">
                  {plansOf(plan).map((p) => (
                    <button key={p.key} type="button" onClick={() => choose(p.keep)} aria-pressed={chosen?.keep === p.keep}
                      className={cn('rounded-md border px-2.5 py-2 text-left', chosen?.keep === p.keep ? 'border-primary bg-tint-lavender' : 'border-hairline hover:bg-surface-soft')}>
                      <span className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold text-ink">{p.label}<span className="font-normal tabular-nums text-steel">{pct(w)} → {pct(w * p.keep)}</span>{fitPlan(profile, plan) === p.key ? <span className="rounded-xs bg-tint-lavender px-1.5 text-xs font-medium text-on-lavender">接近你的风格</span> : null}</span>
                    </button>
                  ))}
                </span>
              </Say>
              {chosen ? (
                <>
                  <Me>{planLabel(plan, chosen.keep)}</Me>
                  <Say>
                    记下了。代价：{(plansOf(plan).find((p) => p.keep === chosen.keep)?.[post ? 'after' : 'before']) ?? '按你定的比例执行。'}
                    <span className="mt-1.5 block text-[13px] text-slate">{plan.up ? (post ? `如果再涨 ${Math.abs(plan.thr)}%` : '如果我说对了') : post ? `如果再跌 ${Math.abs(plan.thr)}%` : '如果我说对了'}，总资产{plan.up ? '多' : '少'} <b className="font-semibold tabular-nums text-ink">{pct(w * chosen.keep * drop, 2)}</b>{chosen.keep !== 1 ? `（不动是 ${pct(w * drop, 2)}）` : ''}。</span>
                    {chosen.off ? <span className="mt-1.5 block rounded-md bg-tint-yellow px-2 py-1 text-[13px] text-on-yellow">这次和你设定的风格不一样，我一并记下了。</span> : null}
                    <span className="mt-1.5 block text-xs text-steel">只做记录，不会下单。出结果后我在判断页帮你回头看这个做法。</span>
                  </Say>
                </>
              ) : null}
            </>
          ) : <Say>{name}占你持仓的 <b className="font-semibold tabular-nums text-ink">{pct(w)}</b>。我对它没有在等结果或已经到价的判断，不需要因为异动去动它。</Say>}

          {/* 4. 提醒偏好 */}
          <Say>
            以后{name}的事，要我怎么提醒你？
            <span className="mt-2 flex flex-wrap gap-1.5">{(['focus', 'normal', 'mute'] as Pref[]).map((p) => <Reply key={p} on={pref === p} onClick={() => setPref(code, p)}>{PREF_LABEL[p]}</Reply>)}</span>
          </Say>

          {/* 5. 问答 */}
          {asked.map((m, i) => (
            <div key={i} className="flex flex-col gap-3">
              <Me>{m.q}</Me>
              <Say>{m.a ? <>{m.a.map((t, k) => <span key={k} className={cn('block', k > 0 && 'mt-1.5')}>{t}</span>)}{m.by ? <span className="mt-1.5 block text-[11px] text-stone">{m.by}</span> : null}</> : <span className="animate-pulse text-steel">正在想…</span>}</Say>
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-hairline bg-surface-soft px-4 pb-3 pt-2.5">
        {quick.filter((x) => !asked.some((m) => m.q === x.q)).length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">{quick.filter((x) => !asked.some((m) => m.q === x.q)).map((x) => <Reply key={x.q} onClick={() => void ask(x.q, x.a)}>{x.q}</Reply>)}</div>
        ) : null}
        <form onSubmit={submit} className="flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-canvas py-1 pl-3 pr-1 focus-within:border-primary">
          <label htmlFor={`ask-${code}`} className="sr-only">问管家关于{name}的问题</label>
          <input id={`ask-${code}`} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} placeholder={`问问${name}的事…`} autoComplete="off" className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone" />
          <button type="submit" disabled={busy || !input.trim()} aria-label="发送" className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-white', (busy || !input.trim()) && 'opacity-40')}><ArrowUp className="h-4 w-4" /></button>
        </form>
      </div>
    </div>
  )
}
