/**
 * 管家观察到的你，以及这些了解此刻在各个页面起的作用。放在「长期记忆」页最上面：
 * 它们来自自选、持仓和长期记下的表态与选择，是记忆的一部分。
 */
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { MARKET_LABEL, SECTORS, STOCKS, type Market } from '../data/case'
import { anomaliesAt, isFresh, judgmentsAt, stockOf } from '../engine'
import { fitPlan, meaning, profileSet } from '../profile'
import { reasonStats } from '../review'
import { useStore } from '../store'

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 border-b border-hairline-soft py-2.5 text-[13px] last:border-b-0"><dt className="text-steel">{label}</dt><dd className="min-w-0 text-charcoal">{children}</dd></div>
}
/** 一条比例条：几段，各带标签 */
function Split({ parts }: { parts: { label: string; n: number; tone: string }[] }) {
  const total = parts.reduce((a, p) => a + p.n, 0)
  if (!total) return null
  return (
    <>
      <span className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">{parts.filter((p) => p.n).map((p) => <span key={p.label} className={p.tone} style={{ width: `${(p.n / total) * 100}%` }} />)}</span>
      <span className="mt-1 block text-xs text-steel">{parts.filter((p) => p.n).map((p) => `${p.label} ${p.n}`).join(' · ')}</span>
    </>
  )
}
/** 在某个页面起的作用：哪里 + 一句当前的效果 + 去看 */
function Effect({ where, children, onGo }: { where: string; children: ReactNode; onGo?: () => void }) {
  return (
    <li className="flex items-start gap-3 border-b border-hairline-soft px-4 py-2.5 last:border-b-0">
      <span className="w-[84px] shrink-0 pt-px text-xs text-steel">{where}</span>
      <span className="min-w-0 flex-1 text-[13px] text-charcoal">{children}</span>
      {onGo ? <button type="button" onClick={onGo} aria-label={`去${where}看`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-stone hover:bg-hover hover:text-ink"><ArrowRight className="h-3.5 w-3.5" /></button> : null}
    </li>
  )
}

export function ObservedPanel() {
  const { profile, plans, votes, reasons, holdings, hasHoldings, prefs, lessons, tick, prevTick, gradeOf, openMe, setPage, openReview } = useStore()
  const js = judgmentsAt(tick)
  const voted = js.filter((j) => votes[j.id] === 'agree' || votes[j.id] === 'disagree')
  const agree = voted.filter((j) => votes[j.id] === 'agree').length
  const split = voted.filter((j) => votes[j.id] === 'disagree' && (j.status === 'hit' || j.status === 'miss'))
  const splitRight = split.filter((j) => j.status === 'miss').length
  const topReason = reasonStats(js, votes, reasons)[0]
  const choices = Object.values(plans)
  const cut = choices.filter((c) => c.keep < 1).length, more = choices.filter((c) => c.keep > 1).length, off = choices.filter((c) => c.off).length
  const held = Object.entries(holdings).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1])
  const sectorWeight = SECTORS.map((s) => ({ s, w: STOCKS.filter((x) => x.sector === s).reduce((a, x) => a + (holdings[x.code] ?? 0), 0) })).sort((a, b) => b.w - a.w)[0]
  const cash = 1 - held.reduce((a, [, w]) => a + w, 0)
  const watchSector = SECTORS.map((s) => ({ s, n: STOCKS.filter((x) => x.sector === s).length })).sort((a, b) => b.n - a.n)[0]
  const focusStocks = STOCKS.filter((s) => prefs[s.code] === 'focus').map((s) => s.name)
  const over = profile.maxWeight ? held.filter(([, w]) => w * 100 > profile.maxWeight!).map(([c]) => stockOf(c).name) : []

  const fresh = anomaliesAt(tick).filter((a) => isFresh(a, tick, prevTick))
  const factorOf = (a: (typeof fresh)[number]) => gradeOf(a, a.hits[0]).styleFactor
  const up = fresh.filter((a) => factorOf(a) > 1).length, down = fresh.filter((a) => factorOf(a) < 1).length
  const firstDown = js.find((j) => j.status === 'pending' && !j.up)
  const say = firstDown ? meaning(profile, firstDown) : null
  const heldJ = js.find((j) => j.status === 'pending' && !j.up && (holdings[j.code] ?? 0) > 0)
  const fit = heldJ ? fitPlan(profile, heldJ) : null

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-7 pt-5 @min-[1000px]:grid-cols-2">
      <section className="min-w-0">
        <h2 className="text-base font-semibold">管家观察到的你</h2>
        <p className="mt-0.5 text-[13px] text-steel">来自你的自选、持仓和长期记下的表态、选择。用得越久越准。</p>
        <dl className="mt-2 rounded-lg border border-hairline px-4">
          <Fact label="自选">
            <Split parts={(['A', 'HK', 'US'] as Market[]).map((m, i) => ({ label: MARKET_LABEL[m], n: STOCKS.filter((s) => s.market === m).length, tone: ['bg-ink', 'bg-slate', 'bg-stone'][i] }))} />
            <span className="mt-1 block text-xs text-steel">最多的板块是{watchSector.s}（{watchSector.n} 只）</span>
          </Fact>
          <Fact label="持仓">{hasHoldings ? <>最大一只是{stockOf(held[0][0]).name}，占 {Math.round(held[0][1] * 100)}%；{sectorWeight.s}板块合计 {Math.round(sectorWeight.w * 100)}%；现金 {Math.round(cash * 100)}%。{over.length ? <span className="text-warning">{over.join('、')}超过了你设的上限。</span> : null}</> : <button type="button" onClick={() => openMe('holdings')} className="text-link hover:underline">还没填，去填 →</button>}</Fact>
          <Fact label="表态">{voted.length ? <><Split parts={[{ label: '同意管家', n: agree, tone: 'bg-ink' }, { label: '不同意', n: voted.length - agree, tone: 'bg-stone' }]} /><span className="mt-1 block text-xs text-steel">{split.length ? `意见不同且已有结果的 ${split.length} 次里，你对 ${splitRight} 次` : '意见不同的还没出结果'}</span></> : '还没表过态'}</Fact>
          <Fact label="常用理由">{topReason ? `「${topReason.label}」，用过 ${topReason.used} 次，看对 ${topReason.right} 次。` : '表态时选一个理由，这里就有记录'}</Fact>
          <Fact label="调仓选择">{choices.length ? <><Split parts={[{ label: '不动', n: choices.length - cut - more, tone: 'bg-ink' }, { label: '减仓', n: cut, tone: 'bg-stone' }, { label: '加仓', n: more, tone: 'bg-slate' }]} />{off ? <span className="mt-1 block text-xs text-steel">其中 {off} 次和设定的风格不一样</span> : null}</> : '还没记过'}</Fact>
          <Fact label="特别留意">{focusStocks.length ? focusStocks.join('、') : '没有设「多提醒我」的股票'}</Fact>
          <Fact label="经验">记了 {lessons.length} 条，其中 {lessons.filter((l) => l.by === 'me').length} 条是你自己写的。</Fact>
        </dl>
      </section>

      <section className="min-w-0">
        <h2 className="text-base font-semibold">这些了解现在起的作用</h2>
        <p className="mt-0.5 text-[13px] text-steel">你设的画像，加上管家记住的，此刻在各页面的效果。</p>
        <ul className="mt-2 overflow-hidden rounded-lg border border-hairline">
          <Effect where="今日 · 等级" onGo={() => setPage('today')}>{up + down ? `今天 ${fresh.length} 条异动里，${up ? `${up} 条按你的画像上调` : ''}${up && down ? '，' : ''}${down ? `${down} 条下调` : ''}。` : profile.horizon || profile.focus.length ? '今天的异动等级没有因为画像变化。' : '在画像里填了「拿多久」或「主要看什么」后，等级会跟着调整。'}</Effect>
          <Effect where="判断 · 对照" onGo={firstDown ? () => openReview(firstDown.id) : undefined}>{say ? `${stockOf(firstDown!.code).name}那条：${say}` : profileSet(profile) ? '目前没有在等结果的看跌判断。' : '在画像里填完前三项后，每条看跌判断旁会多一句对照。'}</Effect>
          <Effect where="判断 · 做法" onGo={heldJ ? () => openReview(heldJ.id) : undefined}>{fit ? `${stockOf(heldJ!.code).name}那条，更接近你的做法是「${{ hold: '不动', half: '减到一半', exit: '全部卖出' }[fit]}」。` : hasHoldings ? '持仓股上目前没有需要应对的看跌判断。' : '填了持仓后，会在做法里标出更接近你的那一种。'}</Effect>
          <Effect where="持仓 · 上限" onGo={() => openMe('holdings')}>{!profile.maxWeight ? '在画像里设了仓位上限后，超过时会提醒。' : over.length ? `${over.join('、')}超过了 ${profile.maxWeight}%。` : hasHoldings ? `没有超过 ${profile.maxWeight}% 的。` : '填了持仓后开始检查。'}</Effect>
          <Effect where="今日 · 解释">{profile.experience === 'new' ? '指标旁会多一句名词解释。' : profile.experience ? '按有经验处理，不加名词解释。' : '在画像里选了「新手」后，指标旁会多一句名词解释。'}</Effect>
        </ul>
      </section>
    </div>
  )
}
