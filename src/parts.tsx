/** 跨页面复用的业务组件：走势图、等级拆解、异动正文、判断卡。 */
import type { ReactNode } from 'react'
import { fmtDate, grade, knownBars, myResult, PREF_LABEL, signed, signClass, stockOf, type Anomaly, type Judgment, type Pref } from './engine'
import type { Vote } from './data/case'
import { Button, cn, LevelTag, Stamp, Tag } from './kit'
import { useStore } from './store'

/** 近 40 个交易日收盘价；标出异动发生日与判断的触发线。 */
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
  const from = judgment ? Math.max(0, idx(judgment.baseDate)) : 0
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${stockOf(code).name}近 40 个交易日收盘价`}>
      {judgment ? (
        <>
          <line x1={x(from)} x2={W - PAD} y1={y(judgment.line)} y2={y(judgment.line)} stroke="var(--up)" strokeDasharray="4 4" strokeWidth="1" />
          <text x={x(from) - 6} y={y(judgment.line) + 4} textAnchor="end" fontSize="12" fill="var(--up)">触发线 {judgment.line.toFixed(2)}</text>
        </>
      ) : null}
      <polyline fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" points={bars.map((b, i) => `${x(i)},${y(b.c)}`).join(' ')} />
      {marks.map((k) => (
        <g key={k}>
          <line x1={x(k)} x2={x(k)} y1={PAD + 10} y2={H - PAD} stroke="var(--hairline-strong)" strokeDasharray="2 3" />
          <polygon points={`${x(k)},${PAD + 10} ${x(k) - 5},${PAD} ${x(k) + 5},${PAD}`} fill="var(--warning)" />
        </g>
      ))}
      <circle cx={x(bars.length - 1)} cy={y(bars[bars.length - 1].c)} r="3.5" fill="var(--ink)" />
    </svg>
  )
}
const prevOf = (d: string) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10) }

/** 等级怎么来的：信号强度 × 持仓权重 × 你的偏好，并且可以就地调偏好。 */
export function GradeBars({ strength, code }: { strength: number; code: string }) {
  const { authorized, prefs, setPref } = useStore()
  const pref = prefs[code] ?? 'normal'
  const g = grade(strength, code, authorized, pref)
  const w = stockOf(code).weight
  const Row = ({ label, pct, tone, value }: { label: string; pct: number; tone: string; value: ReactNode }) => (
    <>
      <span className="text-steel">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-hairline"><span className={cn('block h-full rounded-full', tone)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span>
      <span className="text-right tabular-nums">{value}</span>
    </>
  )
  return (
    <div>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 text-[13px] text-charcoal">
        <Row label="信号强度" pct={strength} tone="bg-up" value={strength} />
        <Row label="持仓权重" pct={authorized ? (w / 0.25) * 100 : 0} tone="bg-ink" value={authorized ? (w ? `${(w * 100).toFixed(0)}%` : '未持仓') : <span className="text-stone">未授权</span>} />
        <Row label="你的偏好" pct={pref === 'focus' ? 100 : pref === 'normal' ? 60 : 25} tone="bg-primary" value={PREF_LABEL[pref]} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-[13px]">
        <span className="text-steel">综合</span><LevelTag level={g.level} /><span className="tabular-nums text-steel">{g.score} 分</span>
        <span className="ml-auto flex gap-1">
          {(['focus', 'normal', 'mute'] as Pref[]).map((p) => (
            <button key={p} type="button" onClick={() => setPref(code, p)} aria-pressed={pref === p}
              className={cn('h-6 rounded-xs px-1.5 text-xs', pref === p ? 'bg-tint-lavender font-medium text-on-lavender' : 'text-steel hover:bg-hover')}>{PREF_LABEL[p]}</button>
          ))}
        </span>
      </div>
    </div>
  )
}

/** 异动正文：传导链（缩进大纲）与证据。结论和证据分开放，方便用户只看证据自己判断。 */
export function AnomalyBody({ a }: { a: Anomaly }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="eyebrow mb-1.5">传导链</p>
        <ol className="text-sm text-charcoal">
          {a.chain.map((c, i) => (
            <li key={i} className="flex gap-2 py-1" style={{ paddingLeft: i * 16 }}>
              <span aria-hidden="true" className="text-stone">▸</span>
              <span><span className="mr-2 text-steel">{c.label}</span>{c.text}</span>
            </li>
          ))}
        </ol>
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

const VOTE_LABEL: Record<Vote, string> = { agree: '认同', disagree: '不认同', watch: '再观察' }

/** 判断卡：一条可证伪的判断 + 存根（倒计时或结算印章）+ 我的表态。 */
export function JudgmentCard({ j, compact, onOpen }: { j: Judgment; compact?: boolean; onOpen?: () => void }) {
  const { votes, vote } = useStore()
  const v = votes[j.id]
  const mine = myResult(j, v)
  const left = j.n - j.elapsed
  return (
    <div className="flex rounded-lg border border-hairline bg-canvas">
      <div className="min-w-0 flex-1 p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag>{j.anomaly.cat}</Tag>
          <span className="text-xs text-steel">{fmtDate(j.issued)} 发出</span>
        </div>
        {onOpen
          ? <button type="button" onClick={onOpen} className="mt-1.5 block text-left text-sm font-semibold hover:underline">{j.anomaly.title}</button>
          : compact ? null : <p className="mt-1.5 text-sm font-semibold">{j.anomaly.title}</p>}
        <p className={cn('mt-1.5 text-charcoal', compact ? 'text-sm' : 'text-[15px] leading-relaxed text-ink')}>{j.text}。</p>
        {compact ? null : (
          <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] text-charcoal">
            <dt className="text-steel">失效条件</dt><dd>{j.invalid}</dd>
            <dt className="text-steel">到期结算</dt><dd className="tabular-nums">{j.dueDate ? `${fmtDate(j.dueDate)} 收盘` : '—'}</dd>
            <dt className="text-steel">同类战绩</dt><dd className="text-stone">回测接入后显示</dd>
          </dl>
        )}
        {j.latest != null ? (
          <p className="mt-2 text-[13px] text-steel">
            已过 {j.elapsed}/{j.n} 个交易日，最新 <span className={cn('tabular-nums', signClass(j.latest))}>{signed(j.latest)}%</span>
            ，最低 <span className={cn('tabular-nums', signClass(j.worst!))}>{signed(j.worst!)}%</span>
          </p>
        ) : null}
        {j.status === 'void' && j.voidOn ? <p className="mt-2 text-[13px] text-steel">{j.voidOn.text}</p> : null}
        {j.status === 'pending' ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {(['agree', 'disagree', 'watch'] as Vote[]).map((k) => (
              <Button key={k} size="xs" variant={v === k ? 'primary' : k === 'watch' ? 'ghost' : 'secondary'} aria-pressed={v === k} onClick={() => vote(j.id, k)}>{VOTE_LABEL[k]}</Button>
            ))}
            <span className="text-xs text-steel">{v ? '已记录，到期一起结算' : '你怎么看？到期一起结算'}</span>
          </div>
        ) : (
          <div className="mt-2.5 flex gap-4 text-[13px] text-steel">
            <span>管家 <b className="font-medium text-ink">{j.status === 'hit' ? '✓ 判断成立' : j.status === 'miss' ? '✗ 判断未成立' : '不计入'}</b></span>
            <span>我 <b className="font-medium text-ink">{v ? VOTE_LABEL[v] : '未表态'}{mine == null ? '' : mine ? ' ✓' : ' ✗'}</b></span>
          </div>
        )}
      </div>
      <div className="flex w-[84px] shrink-0 flex-col items-center justify-center gap-0.5 border-l border-dashed border-hairline-strong px-1 text-center text-[11px] text-steel">
        {j.status === 'pending'
          ? <><b className="text-[22px] font-semibold leading-none tracking-tight text-ink tabular-nums">{left}</b><span>个交易日后结算</span></>
          : <><Stamp status={j.status} /><span className="mt-1.5 tabular-nums">{fmtDate(j.settledOn!)}</span></>}
      </div>
    </div>
  )
}
