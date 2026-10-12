/** 跨页面复用的业务组件：走势图、等级说明、异动正文、表态按钮。 */
import type { ReactNode } from 'react'
import { gradeReason, knownBars, PREF_LABEL, relatedEvents, stockOf, whyLine, type Anomaly, type Judgment, type Pref } from './engine'
import type { Vote } from './data/case'
import { Button, cn, LevelTag } from './kit'
import { PathTree } from './path'
import { useStore, VOTE_LABEL } from './store'

/** 近 40 个交易日收盘价；标出异动发生日，以及「跌破就算管家说对」的那条价格线。 */
export function PriceChart({ code, anomalies, judgment }: { code: string; anomalies: Anomaly[]; judgment?: Judgment }) {
  const { tick } = useStore()
  const bars = knownBars(code, tick).slice(-40)
  const W = 600, H = 170, PAD = 8
  const vals = bars.map((b) => b.c).concat(judgment ? [judgment.line] : [])
  const min = Math.min(...vals), max = Math.max(...vals)
  const x = (i: number) => PAD + (i / Math.max(1, bars.length - 1)) * (W - PAD * 2)
  const y = (v: number) => PAD + 14 + (1 - (v - min) / (max - min || 1)) * (H - PAD * 2 - 14)
  const idx = (d: string) => { let k = -1; bars.forEach((b, i) => { if (b.d <= d) k = i }); return k }
  // 异动标记落在它出现前的最后一根日线上
  const marks = [...new Set(anomalies.map((a) => idx(a.after ?? prevOf(a.tick!))).filter((k) => k >= 0))]
  return (
    <>
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${stockOf(code).name}近 40 个交易日收盘价`}>
      {judgment ? <line x1={PAD} x2={W - PAD} y1={y(judgment.line)} y2={y(judgment.line)} stroke="var(--up)" strokeDasharray="4 4" strokeWidth="1.2" /> : null}
      <polyline fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" points={bars.map((b, i) => `${x(i)},${y(b.c)}`).join(' ')} />
      {marks.map((k) => (
        <g key={k}>
          <line x1={x(k)} x2={x(k)} y1={PAD + 10} y2={H - PAD} stroke="var(--hairline-strong)" strokeDasharray="2 3" />
          <polygon points={`${x(k)},${PAD + 10} ${x(k) - 5},${PAD} ${x(k) + 5},${PAD}`} fill="var(--warning)" />
        </g>
      ))}
      <circle cx={x(bars.length - 1)} cy={y(bars[bars.length - 1].c)} r="3.5" fill="var(--ink)" />
    </svg>
    {/* 说明文字放在图外，手机上也看得清 */}
    {judgment ? <p className="mt-1 text-xs text-up"><span aria-hidden="true">┄┄ </span>红色虚线：{judgment.line.toFixed(2)}。{judgment.status === 'hit' ? `已经${judgment.up ? '涨过' : '跌破'}，管家说对了。` : judgment.status === 'pending' ? `收盘价${judgment.up ? '涨过' : '跌破'}它，就算管家说对。` : `到期没有${judgment.up ? '涨过' : '跌破'}。`}</p> : null}
    </>
  )
}
const prevOf = (d: string) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10) }

/** 这条异动有多重要：先给一句话原因，想看细节再展开三项拆解；提醒多少可以就地改。 */
export function GradeBox({ a, code }: { a: Anomaly; code: string }) {
  const { prefs, setPref, weightOf, hasHoldings, openMe, gradeOf, profile } = useStore()
  const pref = prefs[code] ?? 'normal'
  const w = weightOf(code)
  const g = gradeOf(a, code)
  const strength = a.strength
  const Row = ({ label, pct, tone, value }: { label: string; pct: number; tone: string; value: ReactNode }) => (
    <>
      <span className="text-steel">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-hairline"><span className={cn('block h-full rounded-full', tone)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span>
      <span className="text-right tabular-nums">{value}</span>
    </>
  )
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-3.5">
      <div className="flex flex-wrap items-center gap-2 text-sm"><LevelTag level={g.level} /><span className="text-charcoal">{gradeReason(g)}</span></div>
      <details className="mt-2 text-[13px]">
        <summary className="cursor-pointer text-steel hover:text-ink">这个等级是怎么算的</summary>
        <div className="mt-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 text-charcoal">
          <Row label="事件影响" pct={strength} tone="bg-up" value={strength} />
          <Row label="你的仓位" pct={w == null ? 0 : (w / 0.25) * 100} tone="bg-ink" value={w == null ? <span className="text-stone">未填</span> : w ? `${(w * 100).toFixed(0)}%` : '没有持仓'} />
          <Row label="提醒偏好" pct={pref === 'focus' ? 100 : pref === 'normal' ? 60 : 25} tone="bg-primary" value={PREF_LABEL[pref]} />
          <Row label="投资风格" pct={g.styleFactor > 1 ? 100 : g.styleFactor < 1 ? 35 : 60} tone="bg-primary" value={profile.horizon ? (g.styleFactor > 1 ? '上调' : g.styleFactor < 1 ? '下调' : '不调整') : <span className="text-stone">未设</span>} />
        </div>
        <p className="mt-2 text-steel">几项相乘得 {g.score} 分：70 分以上为高，40 分以上为中。</p>
        {hasHoldings ? null : <button type="button" onClick={() => openMe('holdings')} className="mt-1 text-link hover:underline">补充持仓后，会按你的仓位调整等级 →</button>}
      </details>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-hairline-soft pt-3 text-[13px]">
        <span className="text-steel">{stockOf(code).name}的消息：</span>
        {(['focus', 'normal', 'mute'] as Pref[]).map((p) => (
          <button key={p} type="button" onClick={() => setPref(code, p)} aria-pressed={pref === p}
            className={cn('h-7 rounded-sm px-2 text-[13px]', pref === p ? 'bg-tint-lavender font-medium text-on-lavender' : 'text-steel hover:bg-hover')}>{PREF_LABEL[p]}</button>
        ))}
      </div>
    </div>
  )
}

/** 异动正文：事情是怎么影响到这只股票的（缩进大纲）与证据。结论和证据分开放，方便只看证据自己判断。 */
export function AnomalyBody({ a, focus }: { a: Anomaly; focus?: string }) {
  const { tick } = useStore()
  const related = relatedEvents(a, tick)
  return (
    <div className="flex flex-col gap-4">
      <div>
        {a.auto ? (
          <>
            <p className="eyebrow mb-1.5">为什么会这样</p>
            <p className="text-sm text-charcoal">{whyLine(a, tick)}</p>
            {related.length ? <p className="mt-1.5 text-[13px] text-steel">由事件引起的波动，往往不会一天结束。</p> : null}
            <p className="eyebrow mb-1.5 mt-3">数据</p>
          </>
        ) : <p className="eyebrow mb-1.5">怎么传到你的股票</p>}
        {a.auto ? (
          <ol className="text-sm text-charcoal">
            {a.chain.map((c, i) => <li key={i} className="flex gap-2 py-1"><span aria-hidden="true" className="text-stone">▸</span><span><span className="mr-2 text-steel">{c.label}</span>{c.text}</span></li>)}
          </ol>
        ) : <PathTree a={a} focus={focus} judged={a.judgments.map((d) => d.code)} />}
      </div>
      <div>
        <p className="eyebrow mb-1.5">证据</p>
        {a.evidence.map((e, i) => (
          <div key={i} className="mb-2 text-sm">
            <p className="border-l-[3px] border-ink pl-2.5 text-slate">{e.text}</p>
            <p className="mt-1 pl-3 text-xs text-steel">{e.label} · {e.source}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 表态按钮：到期后和管家一起对答案 */
export function VoteButtons({ j }: { j: Judgment }) {
  const { votes, vote } = useStore()
  const v = votes[j.id]
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(['agree', 'disagree', 'watch'] as Vote[]).map((k) => (
        <Button key={k} size="xs" variant={v === k ? 'primary' : k === 'watch' ? 'ghost' : 'secondary'} aria-pressed={v === k} onClick={() => vote(j.id, k, j.text, j.code)}>{VOTE_LABEL[k]}</Button>
      ))}
      <span className="text-xs text-steel">{v ? '记下了' : '到期一起对答案'}</span>
    </div>
  )
}
