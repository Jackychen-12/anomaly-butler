import { useState } from 'react'
import { ClipboardCheck, House, Radar, Star, User, type LucideIcon } from 'lucide-react'
import { anomaliesAt, fmtDate, isFresh, judgmentsAt, PRICE_SOURCE, weekday } from './engine'
import { Button, cn } from './kit'
import { profileLabel, profileSet } from './profile'
import { unreviewed } from './review'
import { useStore, type Page } from './store'
import { TodayPage } from './pages/Today'
import { WatchPage } from './pages/Watch'
import { ReviewPage } from './pages/Review'
import { SignalsPage } from './pages/Signals'
import { MePage } from './pages/Me'

const NAV: { key: Page; label: string; icon: LucideIcon }[] = [
  { key: 'today', label: '今日', icon: House }, { key: 'watch', label: '自选', icon: Star }, { key: 'review', label: '判断', icon: ClipboardCheck },
  { key: 'signals', label: '信号库', icon: Radar }, { key: 'me', label: '我的', icon: User },
]

/** PC：左侧导航栏 + 右侧内容；手机：顶栏 + 内容 + 底部标签栏。 */
export function App() {
  const { page, setPage, onboarded, setOnboarded, tick, prevTick, reviewState, profile, openMe } = useStore()
  // 导航上的数字：今天新出现的异动、还没复盘的判断
  const badge: Partial<Record<Page, number>> = {
    today: anomaliesAt(tick).filter((a) => isFresh(a, tick, prevTick)).length,
    review: unreviewed(judgmentsAt(tick), reviewState).length,
  }
  return (
    <div className="flex h-full flex-col lg:flex-row">
      <aside className="hidden w-[208px] shrink-0 flex-col border-r border-hairline bg-surface px-2 py-3 lg:flex">
        <button type="button" onClick={() => setPage('today')} className="mb-3 flex items-center gap-2.5 px-2.5 py-1.5 text-left">
          <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-ink text-xs font-semibold text-canvas">异</span>
          <span className="text-sm font-semibold">异动管家</span>
        </button>
        <nav className="flex flex-col gap-0.5" aria-label="主导航">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setPage(key)} aria-current={page === key ? 'page' : undefined}
              className={cn('flex h-9 w-full items-center gap-2.5 rounded-sm px-2.5 text-sm text-slate transition-colors hover:bg-hover hover:text-ink', page === key && 'bg-hover font-medium text-ink')}>
              <Icon className="h-4 w-4 shrink-0" /><span>{label}</span>
              {badge[key] ? <span className={cn('ml-auto rounded-xs px-1.5 text-xs font-medium tabular-nums', key === 'review' ? 'bg-tint-lavender text-on-lavender' : 'bg-tint-rose text-on-rose')} title={key === 'review' ? '还没复盘的判断' : '今天新出现的异动'}>{badge[key]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-2.5 text-xs leading-relaxed text-steel">
          <button type="button" onClick={() => openMe('settings')} className="mb-2.5 block w-full rounded-md border border-hairline bg-canvas px-2.5 py-2 text-left hover:bg-surface-soft">
            <span className="block text-[11px] text-steel">我的画像</span>
            <span className="block text-[13px] font-medium text-ink">{profileSet(profile) ? profileLabel(profile) : '去设置 →'}</span>
          </button>
          <p className="font-medium text-slate">{fmtDate(tick)} {weekday(tick)} · 开盘前</p>
          <p className="mt-1">演示数据，不构成投资建议。</p>
          <details className="mt-1">
            <summary className="cursor-pointer hover:text-ink">数据说明</summary>
            <p className="mt-1">行情：{PRICE_SOURCE}；事件为人工整理；示例持仓与预置表态、预置经验为模拟数据。</p>
          </details>
        </div>
      </aside>

      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-4 lg:hidden">
        <button type="button" onClick={() => setPage('today')} className="flex items-center gap-2 font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-ink text-xs text-canvas">异</span>异动管家
        </button>
        <span className="ml-auto text-xs text-steel">{fmtDate(tick)} {weekday(tick)} · 演示数据</span>
      </header>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {page === 'today' ? <TodayPage /> : page === 'watch' ? <WatchPage /> : page === 'review' ? <ReviewPage /> : page === 'signals' ? <SignalsPage /> : <MePage />}
      </main>

      <nav className="flex shrink-0 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="主导航">
        {NAV.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => setPage(key)} aria-current={page === key ? 'page' : undefined}
            className={cn('relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] text-steel', page === key && 'font-semibold text-ink')}>
            <Icon className="h-5 w-5" strokeWidth={page === key ? 2.2 : 1.8} />{label}
            {badge[key] ? <span aria-label={`${badge[key]} 条`} className={cn('absolute right-[calc(50%-20px)] top-1 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold leading-4 text-white', key === 'review' ? 'bg-primary' : 'bg-up')}>{badge[key]}</span> : null}
          </button>
        ))}
      </nav>
      {onboarded ? null : <Onboarding onDone={() => setOnboarded(true)} />}
    </div>
  )
}

const STEPS = [
  { title: '管家帮你盯着自选股', body: '首页两张图：每只自选股和每个板块的涨跌，有异动的会打上圆点。下面是今天和你有关的事。' },
  { title: '每个看法到期都能对答案', body: '管家的看法写成一句能验证的话，比如「5 个交易日内会跌破 34.97」，旁边的进度条显示离这个价格还有多远。你可以表态，到期看谁对。' },
  { title: '每条判断按五步想清楚', body: '发生了什么、管家怎么看、你怎么看、你打算怎么做、对答案与复盘。说对说错都把经验记进长期记忆，下次同类情况拿出来参考。' },
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
        {step === STEPS.length - 1 ? <p className="mt-2 text-[13px] text-steel">目前展示的是演示数据，行情和事件都是真实发生过的。</p> : null}
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
