/**
 * 提问：默认用本地规则，根据当前的数据拼出回答，离线可用；
 * 在「我的 → 设置」里接入模型接口后，改由模型回答（见 askLlm）。
 */
import { STOCKS, type Vote } from './data/case'
import { anomaliesAt, anomaliesOf, fmtDate, isFresh, judgmentsAt, judgmentsOf, lastBar, score, signed, stockOf } from './engine'
import { signalOf } from './data/signals'
import type { Lesson, Llm, MeTab, Page } from './store'

/** 回答或提示后面可点的去处：某个页面、某只股票、「我的」里的某一栏，或某条判断的复盘对话 */
export type Link = { label: string; page?: Page; code?: string; me?: MeTab; review?: string }
export type Answer = { text: string[]; links: Link[] }
export type AskCtx = { tick: string; prevTick?: string; votes: Record<string, Vote>; holdings: Record<string, number>; hasHoldings: boolean; lessons: Lesson[] }

export const SUGGESTED = ['今天我要注意什么？', '你以前说得准吗？', '你记下了哪些经验？', '我需要调仓吗？']

export function answerLocal(q: string, c: AskCtx): Answer {
  const stock = STOCKS.find((s) => q.includes(s.name.replace('-W', '')) || q.toUpperCase().includes(s.code))
  if (stock) return aboutStock(stock.code, c)
  if (/经验|教训|学到|记下|记住|记得|长期记忆/.test(q)) return aboutLessons(c)
  if (/准|战绩|靠谱|对了|说对|可信/.test(q)) return aboutScore(c)
  if (/调仓|卖|减仓|怎么办|持仓|仓位/.test(q)) return aboutHoldings(c)
  if (/怎么用|是什么|干什么|帮助|什么意思/.test(q)) return help()
  if (/今天|注意|发生|异动|风险|有什么/.test(q)) return aboutToday(c)
  return { text: ['这个问题我还答不好。你可以问我今天要注意什么、某只自选股怎么了、管家说得准不准，或者要不要调仓。'], links: [] }
}

function aboutToday(c: AskCtx): Answer {
  const fresh = anomaliesAt(c.tick).filter((a) => isFresh(a, c.tick, c.prevTick))
  const risk = fresh.filter((a) => !a.auto && a.tone === 'risk')
  const pending = judgmentsAt(c.tick).filter((j) => j.status === 'pending')
  if (!fresh.length) return { text: [`${fmtDate(c.tick)}早上没有新的异动。`, pending.length ? `还有 ${pending.length} 条判断在等结果。` : '也没有在等结果的判断。'], links: [{ label: '看判断结果', page: 'review' }] }
  const text = risk.length
    ? risk.map((a) => `${a.title}。影响到你的自选：${a.hits.map((h) => stockOf(h).name).join('、')}。`)
    : ['今天没有新的大事件。']
  const moved = fresh.filter((a) => a.auto)
  if (moved.length) text.push(`另外有 ${moved.length} 只自选上一个交易日波动很大：${moved.map((a) => a.title).join('；')}。`)
  return { text, links: [...new Set(fresh.flatMap((a) => a.hits))].slice(0, 3).map((h) => ({ label: `看${stockOf(h).name}`, code: h })) }
}

function aboutStock(code: string, c: AskCtx): Answer {
  const s = stockOf(code), bar = lastBar(code, c.tick)
  const as = anomaliesOf(code, c.tick), js = judgmentsOf(code, c.tick)
  const text = [`${s.name}最近一个交易日（${fmtDate(bar.d)}）收盘 ${bar.c}，涨跌 ${signed(bar.p)}%。`]
  text.push(as.length ? `到现在为止它有 ${as.length} 条异动，最近一条是：${as[0].title}。` : '到现在为止它没有异动。')
  const pending = js.find((j) => j.status === 'pending')
  if (pending) text.push(`管家认为：${pending.text}。还有 ${pending.n - pending.elapsed} 个交易日对答案。`)
  const w = c.holdings[code]
  if (c.hasHoldings) text.push(w ? `它占你持仓的 ${Math.round(w * 100)}%。` : '你没有持有它。')
  return { text, links: [{ label: `打开${s.name}`, code }] }
}

function aboutScore(c: AskCtx): Answer {
  const sc = score(judgmentsAt(c.tick), c.votes)
  const n = sc.butler.hit + sc.butler.miss
  if (!n) return { text: ['到现在为止还没有判断到期，暂时没法说准不准。'], links: [] }
  return {
    text: [`到 ${fmtDate(c.tick)} 为止，管家有 ${n} 条判断到期：说对 ${sc.butler.hit} 条，说错 ${sc.butler.miss} 条${sc.butler.void ? `，另有 ${sc.butler.void} 条因前提变化作废` : ''}。`,
      '最近市场整体大跌，看跌的判断本来就容易说对，不能代表平时的水平。每条判断说对或说错的原因都写在复盘里。'],
    links: [{ label: '看复盘', page: 'review' }, { label: '看各类信号的评测', page: 'signals' }],
  }
}

function aboutLessons(c: AskCtx): Answer {
  if (!c.lessons.length) return { text: ['长期记忆里还没有经验。判断出结果后，我们一起复盘，说对说错都会总结一条记下来。'], links: [{ label: '去复盘', page: 'review' }] }
  const bySignal = new Map<string, Lesson[]>()
  for (const l of c.lessons) bySignal.set(l.signal, [...(bySignal.get(l.signal) ?? []), l])
  const text = [`长期记忆里有 ${c.lessons.length} 条经验，其中 ${c.lessons.filter((l) => l.by === 'me').length} 条是你写的。`]
  for (const [sig, ls] of bySignal) text.push(`「${signalOf(sig)?.name ?? sig}」：${ls.map((l) => l.text).join(' ')}`)
  text.push('以后同类信号再出现，我会先把对应的经验拿出来参考。')
  return { text, links: [{ label: '看全部经验', me: 'memory' }, { label: '去复盘', page: 'review' }] }
}

function aboutHoldings(c: AskCtx): Answer {
  if (!c.hasHoldings) return { text: ['我还不知道你持有哪些股票，所以没法判断要不要调仓。', '补充持仓后，我会针对你持有的、而且管家有判断的股票，列出几种做法和各自的代价。决定由你来做，我不会替你下单。'], links: [{ label: '补充持仓', me: 'holdings' }] }
  const js = judgmentsAt(c.tick).filter((j) => j.status === 'pending' && (c.holdings[j.code] ?? 0) > 0)
  if (!js.length) return { text: ['你持有的股票上，目前没有在等结果的判断，不需要因为异动调仓。'], links: [{ label: '看持仓', me: 'holdings' }] }
  return {
    text: [`你持有的股票里，有 ${js.length} 只管家认为短期有下跌风险：${js.map((j) => `${stockOf(j.code).name}（占 ${Math.round(c.holdings[j.code] * 100)}%）`).join('、')}。`,
      '每条判断的第四步里有不动、减一半、全部卖出三种做法和各自的代价，也可以自己定比例。这不是投资建议，决定由你来做。'],
    links: js.map((j) => ({ label: `${stockOf(j.code).name}的做法`, review: j.id })),
  }
}

function help(): Answer {
  return {
    text: ['我帮你盯着自选股。有事情可能影响到它们时，我会告诉你发生了什么、为什么和你有关，并给出一条到期能对答案的判断。',
      '你可以表态同意或不同意，到期我们一起看谁对。说对说错我都会写复盘。',
      '目前展示的是演示数据，行情和事件都是真实发生过的。'],
    links: [{ label: '看自选', page: 'watch' }, { label: '看信号库', page: 'signals' }],
  }
}

/** 调用用户自己配置的模型接口（OpenAI 兼容的 chat/completions）。只把当前已知的信息交给模型。 */
export async function askLlm(q: string, c: AskCtx, llm: Llm): Promise<string> {
  const context = {
    当前时间: `${c.tick} 08:30（开盘前）`,
    自选: STOCKS.map((s) => { const b = lastBar(s.code, c.tick); return { 名称: s.name, 代码: s.symbol, 最近收盘: b.c, 涨跌幅: b.p, 持仓占比: c.hasHoldings ? c.holdings[s.code] ?? 0 : '未填' } }),
    异动: anomaliesAt(c.tick).slice(0, 12).map((a) => ({ 标题: a.title, 时间: a.when, 类型: a.cat, 影响: a.hits.map((h) => stockOf(h).name), 说明: a.chain.map((x) => x.text) })),
    判断: judgmentsAt(c.tick).map((j) => ({ 内容: j.text, 状态: j.status, 作废条件: j.invalid, 复盘: j.review })),
    长期记忆里的经验: c.lessons.map((l) => ({ 信号: signalOf(l.signal)?.name ?? l.signal, 内容: l.text, 谁写的: l.by === 'me' ? '用户' : '管家' })),
  }
  const res = await fetch(llm.url.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.key}` },
    body: JSON.stringify({
      model: llm.model,
      messages: [
        { role: 'system', content: '你是「异动管家」，帮用户盯自选股的异动。只根据给出的资料回答，资料里没有的就说不知道；不要使用当前时间之后的信息。用大白话，三五句话以内。不给出具体买卖指令，涉及调仓时只说明选择和代价。' },
        { role: 'user', content: `资料：${JSON.stringify(context)}\n\n问题：${q}` },
      ],
    }),
  })
  if (!res.ok) throw new Error(`接口返回 ${res.status}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new Error('接口没有返回内容')
  return text.trim()
}
