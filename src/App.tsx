import { useEffect, useRef, useState } from 'react'
import { TICKS } from './data/case'
import { anomaliesAt, fmtDate, isFresh, PRICE_SOURCE, shortDate } from './engine'
import { Button, cn, Tag } from './kit'
import { useStore, type Page } from './store'
import { WatchPage } from './pages/Watch'
import { VerifyPage } from './pages/Verify'
import { RebalancePage } from './pages/Rebalance'

const NAV: { key: Page; label: string }[] = [{ key: 'watch', label: '自选' }, { key: 'verify', label: '验证' }, { key: 'rebalance', label: '调仓' }]

export function App() {
  const { page, setPage, authorized } = useStore()
  const [authOpen, setAuthOpen] = useState(false)
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-hairline px-4">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-ink text-xs text-canvas">异</span>异动管家
        </div>
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="主导航">
          {NAV.map((n) => (
            <button key={n.key} type="button" onClick={() => setPage(n.key)} aria-current={page === n.key ? 'page' : undefined}
              className={cn('h-8 rounded-sm px-3 text-sm text-slate hover:bg-hover', page === n.key && 'bg-hover font-medium text-ink')}>{n.label}</button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {authorized ? <Tag tone="green">已授权 · 模拟持仓</Tag> : <Button size="xs" onClick={() => setAuthOpen(true)}>授权证券账户</Button>}
        </div>
      </header>
      <TimeMachine />
      <main className="min-h-0 flex-1 overflow-y-auto">
        {page === 'watch' ? <WatchPage /> : page === 'verify' ? <VerifyPage /> : <RebalancePage onAuthorize={() => setAuthOpen(true)} />}
        <footer className="px-4 pb-6 pt-8 text-xs text-stone lg:px-6">
          案例回放演示，不构成投资建议。行情：{PRICE_SOURCE}；事件为人工整理；持仓与示例表态为模拟数据。
        </footer>
      </main>
      <nav className="flex shrink-0 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="主导航">
        {NAV.map((n) => (
          <button key={n.key} type="button" onClick={() => setPage(n.key)} aria-current={page === n.key ? 'page' : undefined}
            className={cn('flex-1 py-3 text-[13px] text-steel', page === n.key && 'font-semibold text-ink')}>{n.label}</button>
        ))}
      </nav>
      {authOpen ? <AuthModal onClose={() => setAuthOpen(false)} /> : null}
    </div>
  )
}

/** 时间机器：拖到某一天的盘前，只看得到那一刻之前的行情、异动与判断。 */
function TimeMachine() {
  const { tick, setTick } = useStore()
  const i = TICKS.indexOf(tick)
  const active = useRef<HTMLButtonElement>(null)
  // 当前刻度滚到可见范围中间（手机上刻度条可横向滚动）
  useEffect(() => {
    const el = active.current
    const box = el?.closest<HTMLElement>('[data-scroll]')
    if (el && box) box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2
  }, [tick])
  return (
    <div className="shrink-0 border-b border-hairline bg-surface-soft px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="eyebrow hidden sm:inline">时间机器 · 2025 年 4 月关税冲击</span>
        <span className="text-[13px] font-medium text-ink">{fmtDate(tick)} 盘前 08:30</span>
        <span className="ml-auto hidden text-xs text-steel md:inline">只显示这一刻之前已经发生的行情与事件</span>
        <div className="ml-auto flex gap-1 md:ml-0">
          <Button size="xs" variant="ghost" disabled={i === 0} onClick={() => setTick(TICKS[i - 1])} aria-label="前一天">←</Button>
          <Button size="xs" variant="ghost" disabled={i === TICKS.length - 1} onClick={() => setTick(TICKS[i + 1])} aria-label="后一天">→</Button>
        </div>
      </div>
      <div data-scroll className="no-scrollbar -mx-4 mt-2 overflow-x-auto px-4">
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
      </div>
    </div>
  )
}

/** 模拟的券商授权流程：不收集任何真实账号信息。 */
function AuthModal({ onClose }: { onClose: () => void }) {
  const { setAuthorized, setPage } = useStore()
  const [step, setStep] = useState(0)
  const [broker, setBroker] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="授权证券账户">
      <div className="w-full max-w-md rounded-t-xl bg-canvas p-5 shadow-modal sm:rounded-xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">授权证券账户</h2><Button size="xs" variant="ghost" onClick={onClose}>关闭</Button></div>
        <p className="mt-1 text-[13px] text-steel">演示流程：不会连接真实券商，也不收集账号密码，授权后载入一份模拟持仓。</p>
        {step === 0 ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="eyebrow">第 1 步 · 选择券商</p>
            {['模拟券商 A', '模拟券商 B'].map((b) => (
              <button key={b} type="button" onClick={() => setBroker(b)} className={cn('flex h-11 items-center rounded-md border px-3 text-left text-sm', broker === b ? 'border-primary bg-tint-lavender text-on-lavender' : 'border-hairline hover:bg-surface')}>{b}</button>
            ))}
            <Button variant="primary" size="md" className="mt-2" disabled={!broker} onClick={() => setStep(1)}>下一步</Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <p className="eyebrow">第 2 步 · 确认授权范围</p>
            <ul className="flex flex-col gap-2 text-sm text-charcoal">
              <li className="rounded-md bg-surface px-3 py-2">读取持仓与成本，用于按持仓权重调整异动等级</li>
              <li className="rounded-md bg-surface px-3 py-2">读取历史成交，用于生成调仓方案</li>
              <li className="rounded-md bg-surface px-3 py-2 text-steel">不包含交易权限，管家不会代你下单</li>
            </ul>
            <p className="text-xs text-steel">调仓方案属于投资顾问服务，正式产品中需由持牌机构提供。</p>
            <div className="flex gap-2">
              <Button size="md" onClick={() => setStep(0)}>上一步</Button>
              <Button variant="primary" size="md" className="flex-1" onClick={() => { setAuthorized(true); setPage('rebalance'); onClose() }}>同意并授权（{broker}）</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
