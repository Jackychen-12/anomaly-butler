import { useEffect, useRef, useState } from 'react'
import { TICKS } from './data/case'
import { anomaliesAt, fmtDate, isFresh, PRICE_SOURCE, shortDate } from './engine'
import { Button, cn } from './kit'
import { useStore, type Page } from './store'
import { TodayPage } from './pages/Today'
import { WatchPage } from './pages/Watch'
import { ReviewPage } from './pages/Review'
import { SignalsPage } from './pages/Signals'
import { MePage } from './pages/Me'

const NAV: { key: Page; label: string }[] = [
  { key: 'today', label: '今日' }, { key: 'watch', label: '自选' }, { key: 'review', label: '复盘' }, { key: 'signals', label: '信号库' }, { key: 'me', label: '我的' },
]

export function App() {
  const { page, setPage, onboarded, setOnboarded } = useStore()
  const main = useRef<HTMLElement>(null)
  // 换页面后回到顶部
  useEffect(() => { if (main.current) main.current.scrollTop = 0 }, [page])
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-hairline px-4">
        <button type="button" onClick={() => setPage('today')} className="flex items-center gap-2 font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-ink text-xs text-canvas">异</span>异动管家
        </button>
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="主导航">
          {NAV.map((n) => (
            <button key={n.key} type="button" onClick={() => setPage(n.key)} aria-current={page === n.key ? 'page' : undefined}
              className={cn('h-8 rounded-sm px-3 text-sm text-slate hover:bg-hover', page === n.key && 'bg-hover font-medium text-ink')}>{n.label}</button>
          ))}
        </nav>
        <span className="ml-auto text-xs text-steel">演示 · 案例回放</span>
      </header>
      <Replay />
      <main ref={main} className="min-h-0 flex-1 overflow-y-auto">
        {page === 'today' ? <TodayPage /> : page === 'watch' ? <WatchPage /> : page === 'review' ? <ReviewPage /> : page === 'signals' ? <SignalsPage /> : <MePage />}
        <footer className="px-4 pb-6 pt-8 text-xs text-stone lg:px-6">
          案例回放演示，不构成投资建议。行情：{PRICE_SOURCE}；事件为人工整理；示例持仓与预置表态为模拟数据。
        </footer>
      </main>
      <nav className="flex shrink-0 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="主导航">
        {NAV.map((n) => (
          <button key={n.key} type="button" onClick={() => setPage(n.key)} aria-current={page === n.key ? 'page' : undefined}
            className={cn('flex-1 py-3 text-[13px] text-steel', page === n.key && 'font-semibold text-ink')}>{n.label}</button>
        ))}
      </nav>
      {onboarded ? null : <Onboarding onDone={() => setOnboarded(true)} />}
    </div>
  )
}

/** 案例回放条：说清「你现在看到的是哪一天」，并给一个明显的「下一天」。 */
function Replay() {
  const { tick, setTick, prevTick, nextTick } = useStore()
  const i = TICKS.indexOf(tick)
  const [open, setOpen] = useState(false)
  const active = useRef<HTMLButtonElement>(null)
  // 当前日期滚到可见范围中间（手机上日期条可横向滚动）
  useEffect(() => {
    const el = active.current
    const box = el?.closest<HTMLElement>('[data-scroll]')
    if (el && box) box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2
  }, [tick, open])
  return (
    <div className="shrink-0 border-b border-hairline bg-surface-soft px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="min-w-0 flex-1 text-[13px] text-slate">
          <span className="font-medium text-ink"><span className="sm:hidden">回放：{fmtDate(tick)} 早上</span><span className="hidden sm:inline">案例回放：你现在看到的是 {fmtDate(tick)} 早上</span></span>
          <span className="hidden md:inline"> · 2025 年 4 月关税冲击的真实历史，只显示这一刻之前已经发生的事</span>
        </p>
        <div className="flex items-center gap-1.5">
          <Button size="xs" variant="ghost" disabled={!prevTick} onClick={() => prevTick && setTick(prevTick)}>← 前一天</Button>
          <Button size="xs" variant="primary" disabled={!nextTick} onClick={() => nextTick && setTick(nextTick)}>下一天 →</Button>
          <Button size="xs" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '收起日期' : '选日期'}</Button>
        </div>
      </div>
      {open ? (
        <div data-scroll className="no-scrollbar -mx-4 mt-2 overflow-x-auto px-4 pb-1">
          <div className="relative flex min-w-[640px]">
            <span aria-hidden="true" className="absolute left-0 right-0 top-[6px] h-0.5 bg-hairline-strong" />
            {TICKS.map((t, k) => {
              const alert = anomaliesAt(t).some((a) => isFresh(a, t, TICKS[k - 1]) && a.tone === 'risk' && a.strength >= 70)
              return (
                <button key={t} ref={t === tick ? active : undefined} type="button" onClick={() => setTick(t)} aria-pressed={t === tick}
                  className={cn('relative flex flex-1 flex-col items-center gap-1 text-xs tabular-nums', t === tick ? 'font-semibold text-ink' : 'text-steel hover:text-ink')}>
                  <span className={cn('h-3.5 w-3.5 rounded-full border-2',
                    t === tick ? 'border-primary bg-primary ring-4 ring-tint-lavender' : k < i ? 'border-hairline-strong bg-hairline-strong' : 'border-hairline-strong bg-canvas',
                    alert && t !== tick && 'border-up')} />
                  {shortDate(t)}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-xs text-steel">红圈表示那天有影响较大的事件。</p>
        </div>
      ) : null}
    </div>
  )
}

const STEPS = [
  { title: '管家帮你盯着自选股', body: '有事情可能影响到你的自选股时，管家会告诉你三件事：发生了什么、为什么和你有关、它怎么看。你不用自己在一堆行情和新闻里找。' },
  { title: '每个看法到期都能对答案', body: '管家的看法会写成一句能验证的话，比如「5 个交易日内会跌破 34.97」。你可以表态同意或不同意，到期按真实价格看谁对。说对说错，管家都会写原因。' },
  { title: '现在是一段真实历史的回放', body: '为了让你马上看到完整过程，这里回放的是 2025 年 4 月关税冲击那两周。你从 4 月 3 日早上开始，点上方的「下一天」，看后来发生了什么。' },
]

/** 首次打开的三步说明，可以跳过，之后能在「我的 → 设置」里重看。 */
function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const s = STEPS[step]
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="新手引导">
      <div className="w-full max-w-md rounded-t-xl bg-canvas p-5 shadow-modal sm:rounded-xl">
        <p className="eyebrow">第 {step + 1} 步，共 {STEPS.length} 步</p>
        <h2 className="mt-1.5 text-xl font-semibold tracking-tight">{s.title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-charcoal">{s.body}</p>
        <div className="mt-5 flex items-center gap-2">
          <Button variant="ghost" size="md" onClick={onDone}>跳过</Button>
          <span className="ml-auto" />
          {step > 0 ? <Button size="md" onClick={() => setStep(step - 1)}>上一步</Button> : null}
          <Button variant="primary" size="md" onClick={() => (step < STEPS.length - 1 ? setStep(step + 1) : onDone())}>{step < STEPS.length - 1 ? '下一步' : '开始使用'}</Button>
        </div>
      </div>
    </div>
  )
}
