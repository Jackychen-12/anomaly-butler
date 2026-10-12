/**
 * 复盘对话：把一条判断从发出到出结果的过程，排成管家和用户之间的一段对话。
 * 开头几句由判断本身推出来（不存储）；用户说的话和管家的回应存在 store.dialog 里。
 */
import type { Vote } from './data/case'
import { signalOf } from './data/signals'
import { evaluateSignal, fmtDate, myResult, signed, type Judgment } from './engine'
import { VOTE_LABEL, type Lesson, type ReviewState, type Turn } from './store'

export type Msg = { who: 'butler' | 'me'; text: string; list?: string[] }
export type Reply = { label: string; primary?: boolean; act: { vote: Vote } | { decide: ReviewState } }
export type Thread = { msgs: Msg[]; replies: Reply[]; placeholder: string }

/** 这条判断发出之前，同类信号已经记下的经验 */
export const priorLessons = (j: Judgment, lessons: Lesson[]) => lessons.filter((l) => l.signal === j.anomaly.signal && l.jid !== j.id && l.at < j.issued)

export function buildThread(j: Judgment, c: { tick: string; vote?: Vote; turns: Turn[]; state?: ReviewState; lessons: Lesson[] }): Thread {
  const msgs: Msg[] = []
  const sig = signalOf(j.anomaly.signal)?.name ?? j.anomaly.cat
  const settled = j.status !== 'pending'
  const mine = (phase: Turn['phase']) => c.turns.filter((t) => t.phase === phase)

  // ── 发出判断时
  msgs.push({ who: 'butler', text: `${fmtDate(j.issued)}早上，我注意到：${j.anomaly.title}。` })
  msgs.push({ who: 'butler', text: `我认为：${j.text}。如果${j.invalid}，这条判断作废。` })
  const prior = priorLessons(j, c.lessons)
  if (prior.length) msgs.push({ who: 'butler', text: `「${sig}」这类信号，我之前记过 ${prior.length} 条经验，这次一并参考：`, list: prior.map((l) => l.text) })
  else msgs.push({ who: 'butler', text: trackLine(sig, j) })
  if (c.vote) {
    msgs.push({ who: 'me', text: VOTE_LABEL[c.vote] })
    if (!mine('pending').length) msgs.push({ who: 'butler', text: settled ? '记下了。' : '记下了，到期一起对答案。想说说理由的话，直接写给我，我会留着到时候一起看。' })
  } else if (!settled) msgs.push({ who: 'butler', text: '你怎么看？到期我们一起对答案。' })
  for (const t of mine('pending')) msgs.push({ who: t.who, text: t.text })

  // ── 出结果之后
  if (settled) {
    if (j.status === 'hit') msgs.push({ who: 'butler', text: `有结果了：${fmtDate(j.settledOn!)}收盘跌破了 ${j.line.toFixed(2)}，这条我说对了。` })
    else if (j.status === 'miss') msgs.push({ who: 'butler', text: `有结果了：${j.n} 个交易日里最低到过 ${signed(j.worst ?? 0)}%，没有跌破 ${j.line.toFixed(2)}，这条我说错了。` })
    else msgs.push({ who: 'butler', text: `这条作废了，不算对也不算错。${j.voidOn?.text ?? ''}。` })
    if (j.review) {
      msgs.push({ who: 'butler', text: `${j.status === 'hit' ? '为什么说对了' : j.status === 'miss' ? '为什么说错了' : '为什么作废'}：${j.review.why}` })
      msgs.push({ who: 'butler', text: `当时我漏看了：${j.review.missed}` })
    }
    const r = myResult(j, c.vote)
    if (r != null) msgs.push({ who: 'butler', text: `你当时选的是「${VOTE_LABEL[c.vote!]}」，这次${r ? '你看对了' : '你看错了'}。` })
    const notes = mine('pending').filter((t) => t.who === 'me')
    if (notes.length) msgs.push({ who: 'butler', text: '你当时说的理由是：', list: notes.map((t) => t.text) })
    if (j.review) msgs.push({ who: 'butler', text: `我想从这条里记下一条经验：「${j.review.lesson}」` })
    if (!c.state) msgs.push({ who: 'butler', text: j.review ? '要记进长期记忆吗？你也可以写下你自己的经验。' : '这条我还没总结出经验。你有什么想记下的，可以直接写给我。' })
    else if (!mine('settled').length && c.state === 'kept') msgs.push({ who: 'butler', text: '这条经验已经记在长期记忆里了（演示预置）。' })
    for (const t of mine('settled')) msgs.push({ who: t.who, text: t.text })
  }

  const replies: Reply[] = !settled
    ? (['agree', 'disagree', 'watch'] as Vote[]).map((v) => ({ label: VOTE_LABEL[v], primary: c.vote === v, act: { vote: v } }))
    : c.state ? []
      : j.review ? [{ label: '记下来', primary: true, act: { decide: 'kept' } }, { label: '不用记', act: { decide: 'skipped' } }]
        : [{ label: '知道了', act: { decide: 'ack' } }]
  return { msgs, replies, placeholder: settled ? '写下你自己的经验（会记进长期记忆）' : '说说你的理由（我会留着，到期一起看）' }
}

/** 发出这条判断时，同类信号已经对过多少次答案 */
function trackLine(sig: string, j: Judgment): string {
  const e = evaluateSignal(j.anomaly.signal, j.issued)
  if (e?.kind === 'rule') return e.n ? `「${sig}」这类信号，在这之前回测触发过 ${e.n} 次，其中 ${e.cont} 次之后 5 日内又跌了 5% 以上。` : `「${sig}」这类信号，在这之前还没有触发过。`
  if (e?.kind === 'event' && e.hit + e.miss > 0) return `「${sig}」这类信号，在这之前我对过 ${e.hit + e.miss} 次答案：说对 ${e.hit} 次，说错 ${e.miss} 次。还没有记下经验。`
  return `「${sig}」这类信号，在这之前我还没有对过答案，也没有可参考的经验。`
}

/** 已有结果但还没复盘的判断 */
export const unreviewed = (js: Judgment[], state: Record<string, ReviewState>) => js.filter((j) => j.status !== 'pending' && !state[j.id])
