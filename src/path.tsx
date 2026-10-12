/**
 * 传导路径图：一件事 → 通过什么途径 → 影响到哪几只自选股。
 * 画成一棵向右展开的树：左边一条竖线把各个途径连到事件上，每个途径后面跟着受影响的股票。
 */
import { ArrowRight } from 'lucide-react'
import { changeOver, pathsOf, signed, stockOf, type Anomaly } from './engine'
import { cn } from './kit'
import { useStore } from './store'

/** 一只受影响的股票：名称 + 上一个交易日涨跌（箭头带颜色、文字不带）+ 仓位。judged 表示管家的判断落在它上面 */
export function StockChip({ code, judged, focus }: { code: string; judged?: boolean; focus?: boolean }) {
  const { tick, holdings, openStock } = useStore()
  const v = changeOver(code, tick, 1)
  const s = stockOf(code)
  return (
    <button type="button" onClick={() => openStock(code)} title={`${s.name}（${s.sector}）上一个交易日 ${signed(v)}%`}
      className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[13px] hover:bg-surface-soft', focus ? 'border-ink' : judged ? 'border-primary' : 'border-hairline')}>
      <span className="font-medium">{s.name.replace('-W', '')}</span>
      <span aria-hidden="true" className={cn('text-[10px]', v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-stone')}>{v > 0 ? '▲' : v < 0 ? '▼' : '■'}</span>
      <span className="tabular-nums text-slate">{signed(v)}%</span>
      {holdings[code] ? <span className="text-xs text-stone">仓位 {Math.round(holdings[code] * 100)}%</span> : null}
      {judged ? <span className="rounded-xs bg-tint-lavender px-1 text-[11px] font-medium text-on-lavender">判断</span> : null}
    </button>
  )
}

/** judged：管家给出了判断的股票代码；focus：当前正在看的股票（加深描边） */
export function PathTree({ a, judged = [], focus, showEvent = true }: { a: Anomaly; judged?: string[]; focus?: string; showEvent?: boolean }) {
  const branches = pathsOf(a)
  return (
    <div role="group" aria-label={`传导路径：${a.title}`}>
      {showEvent ? <p className="rounded-md bg-surface px-3 py-2 text-sm leading-snug text-charcoal">{a.chain[0].text}</p> : null}
      <ul className={cn('ml-3 border-l border-hairline-strong', showEvent ? 'pt-2.5' : '')}>
        {branches.map((b, i) => (
          <li key={i} className={cn('relative pl-5', i < branches.length - 1 ? 'pb-2.5' : '')}>
            {/* 最后一个分支把竖线截在拐角处 */}
            {i === branches.length - 1 ? <span aria-hidden="true" className="absolute -left-px bottom-0 top-3.5 w-px bg-canvas" /> : null}
            <span aria-hidden="true" className="absolute left-0 top-3.5 h-px w-4 bg-hairline-strong" />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="min-w-0 text-sm text-charcoal">{b.via}<ArrowRight className="ml-1.5 inline h-3.5 w-3.5 text-stone" aria-hidden="true" /></span>
              <span className="flex flex-wrap gap-1.5">{b.codes.map((c) => <StockChip key={c} code={c} judged={judged.includes(c)} focus={focus === c} />)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
