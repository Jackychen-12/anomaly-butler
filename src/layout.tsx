/**
 * 页面骨架：PC 上左右分栏、各栏独立滚动；手机上收成一列。
 * 排版方式参考 daily_stock_analysis 的 Web 界面（左侧导航 + 次级列表 + 右侧内容，手机上列表变成先列表后详情）。
 */
import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { PRICE_SOURCE } from './engine'
import { cn } from './kit'

/** 监听一个媒体查询是否成立 */
export function useMedia(query: string) {
  const [on, setOn] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const change = () => setOn(mq.matches)
    mq.addEventListener('change', change)
    return () => mq.removeEventListener('change', change)
  }, [query])
  return on
}
/** 是否为 PC 宽度（≥1024px）。分栏页面用它决定默认是否选中第一项。 */
export const useIsDesktop = () => useMedia('(min-width: 1024px)')
/** 是否为宽屏（≥1280px）：主内容旁边放得下右侧栏 */
export const useIsWide = () => useMedia('(min-width: 1280px)')

/** 找到包住某个元素、实际在滚动的那一层 */
export function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

/** 单栏页面：整页一个滚动区。 */
export function Scroll({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('h-full overflow-y-auto', className)}>{children}<Disclaimer /></div>
}

/**
 * 主内容 + 右侧栏。宽屏（≥1280px）左右并排、各自滚动；窄屏叠成一列，railFirst 决定侧栏内容排在前还是后。
 * hideRailBelowXl：窄屏不显示侧栏（调用方另有安排，比如今日页把提问收进底部输入条）。
 */
export function WithRail({ children, rail, railFirst, hideRailBelowXl, railClassName }: { children: ReactNode; rail: ReactNode; railFirst?: boolean; hideRailBelowXl?: boolean; railClassName?: string }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto xl:grid xl:grid-cols-[minmax(0,1fr)_372px] xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden">
      <div className={cn('shrink-0 xl:min-h-0 xl:overflow-y-auto', railFirst && 'order-2 xl:order-none')}>{children}<Disclaimer /></div>
      <aside className={cn('shrink-0 border-hairline bg-surface-soft xl:min-h-0 xl:border-l', hideRailBelowXl ? 'hidden xl:block' : railFirst ? 'border-b xl:border-b-0' : 'border-t xl:border-t-0', railClassName ?? 'xl:overflow-y-auto')}>{rail}</aside>
    </div>
  )
}

/**
 * 列表 + 详情。PC 左列表右详情、各自滚动；手机上先看列表，点开一项后整屏看详情。
 * showDetail 为 false 时手机只显示列表。
 */
export function Split({ list, detail, showDetail }: { list: ReactNode; detail: ReactNode; showDetail: boolean }) {
  return (
    <div className="h-full overflow-y-auto lg:grid lg:grid-cols-[328px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
      <div className={cn('lg:flex lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-hairline', showDetail && 'hidden lg:flex')}>{list}</div>
      <div className={cn('@container lg:min-h-0 lg:overflow-y-auto', !showDetail && 'hidden lg:block')}>{detail}<Disclaimer /></div>
    </div>
  )
}

/** 底部弹出的面板：手机上放日期选择、提问对话。 */
export function Sheet({ title, onClose, children, tall }: { title: string; onClose: () => void; children: ReactNode; tall?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className={cn('flex w-full max-w-md flex-col rounded-t-xl bg-canvas shadow-modal sm:rounded-xl', tall ? 'h-[86dvh] sm:h-[640px]' : 'max-h-[86dvh]')} onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="关闭" className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-sm text-steel hover:bg-hover hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">{children}</div>
      </div>
    </div>
  )
}

/** 免责与数据说明。PC 上放在左侧栏底部，这里只在手机上显示。 */
export function Disclaimer({ always }: { always?: boolean }) {
  return (
    <p className={cn('px-4 pb-5 pt-8 text-xs leading-relaxed text-stone', always ? '' : 'lg:hidden')}>
      演示数据，不构成投资建议。行情：{PRICE_SOURCE}；事件为人工整理；示例持仓与预置表态为模拟数据。
    </p>
  )
}
