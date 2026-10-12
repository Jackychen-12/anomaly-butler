/**
 * 长期记忆：管家记住了关于你的什么。每一条都是一句具体的话，写明从哪来、用在哪，能删的可以删。
 * 最上面是「管家眼中的你」：把下面这些记忆连成一段话（配了大模型时由模型写，没配时用规则拼）。
 * 原始的操作记录收在最下面。
 */
import { useState } from 'react'
import { RotateCw } from 'lucide-react'
import { MARKET_LABEL, SECTORS, STOCKS, type Market } from '../data/case'
import { signalOf, TIER_LABEL } from '../data/signals'
import { fmtDate, judgmentsAt, stockOf } from '../engine'
import { Button, cn } from '../kit'
import { GROUND, llmName, llmReady, useGenerated } from '../llm'
import { profileLabel, profileSet } from '../profile'
import { reasonStats } from '../review'
import { useStore, type Memory } from '../store'

type Cat = '关于你' | '经验' | '你写的'
type Item = { id: string; cat: Cat; text: string; from: string; used: string; go?: () => void; del?: () => void }
const TONE: Record<Cat, string> = { 关于你: 'bg-tint-gray text-on-gray', 经验: 'bg-tint-mint text-on-mint', 你写的: 'bg-tint-lavender text-on-lavender' }
const LOG: Partial<Record<Memory['kind'], string>> = { vote: '表态', note: '说过的理由', plan: '调仓选择', rule: '规则调整', profile: '画像变化', pref: '提醒偏好', holding: '持仓变化', ask: '问过的问题' }

export function MemoryTab() {
  const st = useStore()
  const { profile, plans, votes, reasons, holdings, hasHoldings, prefs, lessons, rules, memory, tick, llm, openMe, openReview, setPage, forget, forgetLesson, remember } = st
  const [cat, setCat] = useState<Cat | '全部'>('全部')
  const [text, setText] = useState('')

  // ── 关于你：从持仓、画像、表态和选择里得出的事实 ──
  const js = judgmentsAt(tick)
  const about: Item[] = []
  const held = Object.entries(holdings).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1])
  if (hasHoldings) {
    const sec = SECTORS.map((s) => ({ s, w: STOCKS.filter((x) => x.sector === s).reduce((a, x) => a + (holdings[x.code] ?? 0), 0) })).sort((a, b) => b.w - a.w)[0]
    about.push({ id: 'hold', cat: '关于你', text: `你持有 ${held.length} 只自选股，最重的是${stockOf(held[0][0]).name}（${Math.round(held[0][1] * 100)}%），${sec.s}板块合计 ${Math.round(sec.w * 100)}%，现金 ${Math.round((1 - held.reduce((a, [, w]) => a + w, 0)) * 100)}%。`, from: '持仓', used: '仓位重的股票，提醒等级更高；自选里按它列调仓做法', go: () => openMe('holdings') })
  }
  const topSec = SECTORS.map((s) => ({ s, n: STOCKS.filter((x) => x.sector === s).length })).sort((a, b) => b.n - a.n)[0]
  about.push({ id: 'watch', cat: '关于你', text: `你关注 ${STOCKS.length} 只股票：${(['A', 'HK', 'US'] as Market[]).map((m) => `${MARKET_LABEL[m]} ${STOCKS.filter((s) => s.market === m).length} 只`).join('、')}，最多的是${topSec.s}（${topSec.n} 只）。`, from: '自选', used: '只提醒传得到这些股票的事', go: () => setPage('watch') })
  if (profileSet(profile)) about.push({ id: 'profile', cat: '关于你', text: `你告诉过管家：${profileLabel(profile)}${profile.rules.length ? `；你的原则：${profile.rules.join('；')}` : ''}。`, from: '投资画像', used: '调整提醒等级；看跌判断旁对照你的承受上限；标出更接近你风格的做法', go: () => openMe('profile') })
  const voted = js.filter((j) => votes[j.id] === 'agree' || votes[j.id] === 'disagree')
  if (voted.length) {
    const dis = voted.filter((j) => votes[j.id] === 'disagree'), done = dis.filter((j) => j.status === 'hit' || j.status === 'miss'), right = done.filter((j) => j.status === 'miss').length
    about.push({ id: 'vote', cat: '关于你', text: `你对 ${voted.length} 条判断表过态：同意管家 ${voted.length - dis.length} 次，不同意 ${dis.length} 次${done.length ? `；不同意且已出结果的 ${done.length} 次里，你对了 ${right} 次` : ''}。`, from: '表态记录', used: '意见不同的判断快到期时提醒你回头看', go: () => setPage('review') })
  }
  for (const r of reasonStats(js, votes, reasons).slice(0, 3))
    about.push({ id: `reason-${r.label}`, cat: '关于你', text: `你用「${r.label}」这个理由判断过 ${r.used} 次，看对 ${r.right} 次。`, from: '表态时选的理由', used: '复盘时告诉你哪种想法靠得住', go: () => setPage('review') })
  const choices = Object.entries(plans)
  if (choices.length) {
    const cut = choices.filter(([, c]) => c.keep < 1).length, more = choices.filter(([, c]) => c.keep > 1).length, off = choices.filter(([, c]) => c.off).length
    about.push({ id: 'plan', cat: '关于你', text: `你记过 ${choices.length} 次仓位做法：不动 ${choices.length - cut - more} 次、减仓 ${cut} 次、加仓 ${more} 次${off ? `，其中 ${off} 次和你设定的风格不一样` : ''}。`, from: '自选里记下的做法', used: '判断出结果后，回头算这个做法带来了什么', go: () => setPage('watch') })
  }
  const focus = STOCKS.filter((s) => prefs[s.code] === 'focus').map((s) => s.name), mute = STOCKS.filter((s) => prefs[s.code] === 'mute').map((s) => s.name)
  if (focus.length || mute.length) about.push({ id: 'pref', cat: '关于你', text: `${focus.length ? `你让管家多留意${focus.join('、')}` : ''}${focus.length && mute.length ? '，' : ''}${mute.length ? `少提醒${mute.join('、')}` : ''}。`, from: '自选里的提醒偏好', used: '直接放大或缩小这几只股票的提醒等级', go: () => setPage('watch') })
  const tuned = Object.entries(rules.tiers ?? {})
  if (rules.base !== 'balanced' || tuned.length || rules.off.length)
    about.push({ id: 'rules', cat: '关于你', text: `你的提醒门槛：默认${TIER_LABEL[rules.base]}${tuned.length ? `；单独调过${tuned.map(([id, t]) => `「${signalOf(id)?.name}」（${TIER_LABEL[t]}）`).join('、')}` : ''}${rules.off.length ? `；关掉了${rules.off.map((id) => `「${signalOf(id)?.name}」`).join('、')}` : ''}。`, from: '信号库', used: '决定哪些波动算异动', go: () => setPage('signals') })

  const learned: Item[] = lessons.map((l) => ({ id: l.id, cat: '经验', text: l.text, from: `${l.by === 'me' ? '你' : '管家'}在${stockOf(l.code).name}那条判断上总结的（${fmtDate(l.at)}出结果${l.seed ? '，演示预置' : ''}）`, used: `「${signalOf(l.signal)?.name ?? l.signal}」再出现时，写在管家的判断旁边`, go: () => openReview(l.jid), del: () => forgetLesson(l.id) }))
  const own: Item[] = memory.filter((m) => m.kind === 'own').map((m) => ({ id: m.id, cat: '你写的', text: m.text, from: `你在 ${fmtDate(m.day)} 写的`, used: '问管家问题时，它会参考这句话', del: () => forget(m.id) }))
  const all = [...own, ...about, ...learned]
  const shown = all.filter((i) => cat === '全部' || i.cat === cat)
  const log = memory.filter((m) => m.kind !== 'own')
  const add = () => { const t = text.trim(); if (!t) return; remember({ kind: 'own', text: t }); setText('') }

  // ── 管家眼中的你：把记忆连成一段话 ──
  const material = all.map((i) => `[${i.cat}] ${i.text}`).join('\n')
  const gen = useGenerated(llm, 'portrait', `${GROUND}下面是你记住的关于这位用户的事。用第二人称「你」写一段 3 到 4 句的话，说出你眼中他是怎样的投资者：仓位怎么放、遇事怎么判断、哪里靠得住、哪里要留神。只用资料里的事实，数字照抄。`, material, 260)
  const fallback = [about.find((i) => i.id === 'hold')?.text, about.find((i) => i.id === 'profile')?.text ?? '你还没有告诉管家你的风格。', about.find((i) => i.id === 'vote')?.text, learned.length ? `管家记着 ${learned.length} 条经验，同类信号再出现时会拿出来。` : null].filter(Boolean).join('')
  const missing = [!profileSet(profile) ? { text: '你的风格（能接受多大跌幅、一般拿多久）', go: () => openMe('profile'), label: '去设置画像' } : null, !voted.length ? { text: '你怎么看管家的判断', go: () => setPage('review'), label: '去表个态' } : null, !own.length ? { text: '你自己的投资原则', go: () => document.getElementById('own-note')?.focus(), label: '写一条' } : null].filter((x): x is { text: string; go: () => void; label: string } => !!x)

  return (
    <div className="mx-auto max-w-[860px] pt-5">
      <section className="rounded-xl border border-hairline bg-surface-soft p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">管家眼中的你</h2>
          <span className="text-xs text-steel">{gen.text ? `由 ${llmName(llm)} 根据下面 ${all.length} 条记忆写成` : gen.loading ? '正在写…' : llmReady(llm) ? '' : `根据下面 ${all.length} 条记忆拼成`}</span>
          {gen.text ? <button type="button" onClick={gen.refresh} className="ml-auto flex h-7 items-center gap-1 rounded-sm px-2 text-xs text-steel hover:bg-hover hover:text-ink"><RotateCw className="h-3.5 w-3.5" />重写</button> : null}
        </div>
        <p className={cn('mt-2 text-[15px] leading-relaxed text-charcoal', gen.loading && 'animate-pulse text-steel')}>{gen.text ?? fallback}</p>
        {gen.error ? <p className="mt-2 text-xs text-warning">模型没有写出来（{gen.error}），上面是按规则拼的。</p> : null}
        {!llmReady(llm) ? <button type="button" onClick={() => openMe('settings')} className="mt-2 text-[13px] text-link hover:underline">接上大模型后，这段话会由它来写 →</button> : null}
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-base font-semibold">记住的事 <span className="text-[13px] font-normal text-steel">{all.length} 条</span></h2>
          <div className="ml-auto flex gap-0.5" role="group" aria-label="按类型筛选">
            {(['全部', '关于你', '经验', '你写的'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k)} className={cn('h-7 rounded-sm px-2.5 text-[13px] text-slate hover:bg-hover', cat === k && 'bg-hover font-medium text-ink')}>{k} <span className="tabular-nums text-stone">{k === '全部' ? all.length : all.filter((i) => i.cat === k).length}</span></button>
            ))}
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); add() }} className="mt-3 flex gap-2">
          <label htmlFor="own-note" className="sr-only">写一条想让管家记住的话</label>
          <input id="own-note" value={text} onChange={(e) => setText(e.target.value)} placeholder="写一条想让管家记住的话，比如：消费电子我只做长线，关税消息不追着卖" autoComplete="off" className="h-9 min-w-0 flex-1 rounded-md border border-hairline-strong bg-canvas px-3 text-sm outline-none placeholder:text-stone focus-visible:border-primary" />
          <Button type="submit" variant="primary" disabled={!text.trim()}>记下</Button>
        </form>
        <ul className="mt-3 overflow-hidden rounded-lg border border-hairline">
          {shown.map((i) => (
            <li key={i.id} className="flex items-start gap-3 border-b border-hairline-soft px-4 py-3 last:border-b-0">
              <span className={cn('mt-0.5 w-[52px] shrink-0 rounded-xs px-1.5 text-center text-xs font-medium leading-5', TONE[i.cat])}>{i.cat}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-snug text-ink">{i.text}</p>
                <p className="mt-1 text-xs text-steel"><span className="text-stone">用在　</span>{i.used}</p>
                <p className="mt-0.5 text-xs text-steel"><span className="text-stone">来自　</span>{i.go ? <button type="button" onClick={i.go} className="hover:text-ink hover:underline">{i.from} →</button> : i.from}</p>
              </div>
              {i.del ? <button type="button" onClick={i.del} className="shrink-0 text-xs text-steel hover:text-up" aria-label={`删除：${i.text}`}>删除</button> : null}
            </li>
          ))}
          {shown.length === 0 ? <li className="px-4 py-6 text-sm text-steel">这一类还没有记住的事。</li> : null}
        </ul>
      </section>

      {missing.length ? (
        <section className="mt-6">
          <h2 className="text-base font-semibold">还没记住的</h2>
          <ul className="mt-2 overflow-hidden rounded-lg border border-dashed border-hairline-strong">
            {missing.map((m) => (
              <li key={m.text} className="flex items-center gap-3 border-b border-hairline-soft px-4 py-2.5 text-sm text-slate last:border-b-0"><span className="min-w-0 flex-1">{m.text}</span><button type="button" onClick={m.go} className="shrink-0 text-[13px] text-link hover:underline">{m.label} →</button></li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="group mt-6">
        <summary className="cursor-pointer list-none text-[13px] text-steel hover:text-ink [&::-webkit-details-marker]:hidden">▸ 原始记录 {log.length} 条（你的每次表态、调整和提问；上面的记忆就是从这些里得出的）</summary>
        {log.length ? (
          <ul className="mt-2 overflow-hidden rounded-lg border border-hairline">
            {log.slice(0, 40).map((m) => (
              <li key={m.id} className="flex items-start gap-3 border-b border-hairline-soft px-4 py-2 text-[13px] last:border-b-0">
                <span className="w-[68px] shrink-0 text-xs text-steel">{LOG[m.kind] ?? m.kind}</span><span className="min-w-0 flex-1 text-charcoal">{m.text}</span>
                <button type="button" onClick={() => forget(m.id)} className="shrink-0 text-xs text-steel hover:text-up" aria-label={`删除这条记录：${m.text}`}>删除</button>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-[13px] text-steel">还没有记录。演示预置的 3 条表态不在这里。只存在你的浏览器里。</p>}
      </details>
    </div>
  )
}
