/**
 * 小图表（不引图表库）：以 0 为中轴的正负条形，和判断「离跌破线还有多远」的进度条。
 * 红涨绿跌是 A 股习惯，这两种颜色对色弱用户不够好分，所以方向同时靠「在中轴哪一侧」和数值前的正负号表达。
 */
import type { ReactNode } from 'react'
import { signed, type Judgment, type Level } from './engine'
import { cn, LevelDot } from './kit'

export type BarRow = {
  key: string
  label: string
  /** 名称下面的小字 */
  sub?: string
  value: number
  /** 名称前的圆点：这一行有新异动时标出等级 */
  dot?: Level | null
  /** 条形下面的一行补充（比如仓位和对总资产的影响） */
  note?: ReactNode
  /** 悬停或聚焦时显示的说明 */
  tip: string
  onClick?: () => void
}

/** 正负条形列表：每行 名称 | 条形 | 数值。所有行共用一个刻度。 */
export function DivergingBars({ rows, labelWidth = 84 }: { rows: BarRow[]; labelWidth?: number }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)))
  return (
    <ul>
      {rows.map((r) => {
        const body = (
          <>
            <span className="grid items-center gap-x-2.5" style={{ gridTemplateColumns: `${labelWidth}px minmax(0,1fr) 60px` }}>
              <span className="flex min-w-0 items-center gap-1.5">
                {r.dot ? <LevelDot level={r.dot} /> : <span className="w-2 shrink-0" />}
                <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-ink">{r.label}</span>{r.sub ? <span className="block truncate text-[11px] text-stone">{r.sub}</span> : null}</span>
              </span>
              <span className="relative block h-5" aria-hidden="true">
                <span className="absolute inset-y-0 left-1/2 w-px bg-hairline-strong" />
                <span className={cn('absolute top-1/2 h-2.5 -translate-y-1/2', r.value >= 0 ? 'left-1/2 rounded-r-[4px] bg-up' : 'right-1/2 rounded-l-[4px] bg-down')} style={{ width: `${(Math.abs(r.value) / max) * 50}%`, minWidth: r.value === 0 ? 0 : 2 }} />
              </span>
              <span className="text-right text-[13px] tabular-nums text-ink">{signed(r.value)}%</span>
            </span>
            {r.note ? <span className="mt-0.5 block text-[11px] text-steel" style={{ paddingLeft: labelWidth + 10 }}>{r.note}</span> : null}
            <span role="tooltip" className="pointer-events-none invisible absolute right-2 top-full z-10 -mt-1 max-w-[260px] rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-left text-xs text-charcoal shadow-card group-hover:visible group-focus-visible:visible">{r.tip}</span>
          </>
        )
        const cls = 'group relative block w-full rounded-sm px-2 py-1.5 text-left'
        return (
          <li key={r.key}>
            {r.onClick
              ? <button type="button" onClick={r.onClick} aria-label={`${r.label} ${signed(r.value)}%`} className={cn(cls, 'hover:bg-surface-soft')}>{body}</button>
              : <div className={cls} tabIndex={0} aria-label={`${r.label} ${signed(r.value)}%`}>{body}</div>}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * 判断进度条：从发出判断时的价格（左）到「跌破就算说对」的那个价格（右），现在走了多远。
 * 走满即说对。价格反而上涨时进度为 0。
 */
export function JudgmentMeter({ j, className }: { j: Judgment; className?: string }) {
  const frac = (pct: number | null) => (pct == null ? 0 : Math.max(0, Math.min(1, pct / j.thr)))
  const p = j.status === 'hit' ? 1 : j.status === 'miss' ? frac(j.worst) : frac(j.latest)
  const text = j.status === 'hit' ? '已跌破' : j.status === 'void' ? '作废'
    : j.status === 'miss' ? `到期没跌破，最多走到 ${Math.round(p * 100)}%`
    : j.latest == null ? '今天开盘后开始计' : j.latest > 0 ? `反而涨了 ${signed(j.latest)}%` : `已走 ${Math.round(p * 100)}%`
  const tone = j.status === 'hit' ? ['bg-tint-rose', 'bg-up'] : j.status === 'pending' ? ['bg-tint-peach', 'bg-warning'] : ['bg-tint-gray', 'bg-stone']
  return (
    <div className={cn('min-w-0', className)} title={j.latest == null ? undefined : `目前相对起点 ${signed(j.latest)}%，最低到过 ${signed(j.worst ?? 0)}%`}>
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-steel"><span>离跌破线</span><span className="font-medium text-ink">{text}</span></div>
      <div className={cn('mt-1 h-2 overflow-hidden rounded-r-[4px]', tone[0])} role="img" aria-label={`从 ${j.base} 到跌破线 ${j.line.toFixed(2)}：${text}`}>
        <div className={cn('h-full rounded-r-[4px]', tone[1])} style={{ width: `${p * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-stone"><span>起点 {j.base}</span><span>跌破线 {j.line.toFixed(2)}</span></div>
    </div>
  )
}
