/**
 * 我的，五页各管一件事、互不重复：
 * 画像（管家眼里的你：你说的 + 它观察到的 + 用在哪）、持仓、长期记忆（经验、我的逻辑、记录）、设置（这个助理能做什么、何时找你、连着什么）、订阅（各档的模型用量）。
 */
import { useEffect, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { DEMO_HOLDINGS, STOCKS } from '../data/case'
import { SIGNALS } from '../data/signals'
import { signalOf } from '../data/signals'
import { JudgmentMeter } from '../charts'
import { fmtDate, judgmentsAt, recentlySettled, stockOf } from '../engine'
import { reasonStats } from '../review'
import { Button, cn, LevelTag } from '../kit'
import { Scroll } from '../layout'
import { useStore, type Memory, type MeTab } from '../store'
import { ObservedPanel } from './Observed'
import { PlanTab, TIER_LABEL, usageNote, useUsage } from './Plan'
import { ProfileTab } from './Profile'

// 管家设置和订阅排在最前，然后才是画像、持仓、长期记忆
const TABS: { key: MeTab; label: string }[] = [{ key: 'settings', label: '管家设置' }, { key: 'plan', label: '订阅' }, { key: 'profile', label: '投资画像' }, { key: 'holdings', label: '持仓' }, { key: 'memory', label: '长期记忆' }]
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`

export function MePage() {
  const { meTab, openMe } = useStore()
  return (
    <Scroll>
    <div className="@container mx-auto max-w-[1240px] px-4 py-5 lg:px-8 lg:py-6">
      <h1 className="text-[22px] font-semibold tracking-tight">我的</h1>
      <div className="mt-3 flex gap-0.5 border-b border-hairline" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={meTab === t.key} onClick={() => openMe(t.key)}
            className={cn('-mb-px h-9 whitespace-nowrap border-b-2 px-2 text-sm sm:px-3', meTab === t.key ? 'border-ink font-medium text-ink' : 'border-transparent text-steel hover:text-ink')}>{t.label}</button>
        ))}
      </div>
      {meTab === 'holdings' ? <Holdings /> : meTab === 'memory' ? <><OwnNotes /><ObservedPanel /><MemoryList /></> : meTab === 'profile' ? <ProfileTab /> : meTab === 'plan' ? <PlanTab /> : <AgentSettings />}
    </div>
    </Scroll>
  )
}

// ── 持仓 ────────────────────────────────────────────────
function Holdings() {
  const { holdings, setHoldings, hasHoldings, tick, gradeOf, openReview } = useStore()
  const toDraft = (h: Record<string, number>) => Object.fromEntries(STOCKS.map((s) => [s.code, h[s.code] ? String(Math.round(h[s.code] * 100)) : '']))
  const [draft, setDraft] = useState<Record<string, string>>(() => toDraft(holdings))
  useEffect(() => setDraft(toDraft(holdings)), [holdings])
  const nums = Object.fromEntries(STOCKS.map((s) => [s.code, Math.max(0, Number(draft[s.code]) || 0) / 100]))
  const sum = Object.values(nums).reduce((a, b) => a + b, 0)
  const over = sum > 1.0001
  const dirty = STOCKS.some((s) => Math.abs(nums[s.code] - (holdings[s.code] ?? 0)) > 0.0001)

  // 持仓股上需要应对的判断：还在等结果的（事前），和最近被说中的（事后）。做法在每条判断里看
  const js = judgmentsAt(tick)
  const targets = [...js.filter((j) => j.status === 'pending'), ...recentlySettled(tick).filter((j) => j.status === 'hit')].filter((j) => (holdings[j.code] ?? 0) > 0)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-7 @min-[1000px]:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <section className="mt-5 min-w-0">
        <h2 className="text-base font-semibold">我的持仓</h2>
        <p className="mt-0.5 text-[13px] text-steel">可以不填。填了之后按你的仓位排提醒，并给出调仓做法。只存在你的浏览器里。</p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-hairline">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="text-left text-xs text-steel [&>th]:whitespace-nowrap [&>th]:border-b [&>th]:border-hairline [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium"><th>股票</th><th className="w-[96px]">占总资产</th><th>管家的判断</th></tr></thead>
            <tbody className="[&>tr:last-child>td]:border-b-0 [&_td]:border-b [&_td]:border-hairline-soft [&_td]:px-3 [&_td]:py-2">
              {STOCKS.map((s) => {
                const tj = targets.find((x) => x.code === s.code)
                return (
                  <tr key={s.code}>
                    <td className="font-medium">{s.name}<span className="block font-mono text-[11px] font-normal text-stone">{s.symbol}</span></td>
                    <td>
                      <label className="flex items-center gap-1.5"><span className="sr-only">{s.name}占总资产的百分比</span>
                        <input inputMode="numeric" value={draft[s.code]} placeholder="0" onChange={(e) => setDraft({ ...draft, [s.code]: e.target.value.replace(/[^\d.]/g, '') })}
                          className="h-8 w-14 rounded-sm border border-hairline-strong bg-canvas px-2 text-right text-sm tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                        <span className="text-steel">%</span></label>
                    </td>
                    <td className="text-[13px] text-slate">{tj ? <span className="flex flex-wrap items-center gap-1.5">{hasHoldings ? <LevelTag level={gradeOf(tj.anomaly, s.code).level} /> : null}{tj.status === 'hit' ? (tj.up ? '已涨过管家说的价格' : '已跌破管家说的价格') : tj.up ? '管家看涨，在等结果' : '管家看跌，在等结果'}</span> : <span className="text-stone">—</span>}</td>
                  </tr>
                )
              })}
              <tr><td className="text-steel">现金及其他</td><td className={cn('tabular-nums', over && 'text-up')}>{over ? '超过 100%' : pct(1 - sum, 0)}</td><td /></tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={!dirty || over} onClick={() => setHoldings(Object.fromEntries(Object.entries(nums).filter(([, w]) => w > 0)), '手动更新了持仓')}>保存持仓</Button>
          <Button onClick={() => setHoldings(DEMO_HOLDINGS, '从模拟券商导入了持仓')}>从模拟券商导入</Button>
          {hasHoldings ? <Button variant="ghost" onClick={() => setHoldings({}, '清空了持仓')}>清空</Button> : null}
        </div>
        <p className="mt-2 text-xs text-steel">「模拟券商导入」是演示：不连接真实券商，载入一份示例持仓。</p>
      </section>

      <section className="min-w-0 @min-[1000px]:mt-5">
        <h2 className="text-base font-semibold">需要你看的判断</h2>
        <p className="mt-0.5 text-[13px] text-steel">持仓股上管家有判断的，点开看做法。</p>
        {!hasHoldings ? <p className="mt-3 rounded-lg border border-dashed border-hairline-strong px-4 py-6 text-sm text-steel">填上持仓后，这里列出和你持仓有关的判断。</p>
          : targets.length === 0 ? <p className="mt-3 rounded-lg bg-surface-soft px-4 py-6 text-sm text-steel">目前没有。</p> : (
            <ul className="mt-3 overflow-hidden rounded-lg border border-hairline">
              {targets.map((t) => (
                <li key={t.id} className="border-b border-hairline-soft last:border-b-0">
                  <button type="button" onClick={() => openReview(t.id)} className="grid w-full grid-cols-[minmax(0,1fr)_180px] items-center gap-4 px-3.5 py-2.5 text-left hover:bg-surface-soft">
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{stockOf(t.code).name} <span className="font-normal text-steel">仓位 {Math.round((holdings[t.code] ?? 0) * 100)}%</span></span><span className="block truncate text-xs text-steel">{t.anomaly.title}</span></span>
                    <JudgmentMeter j={t} />
                  </button>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  )
}

// ── 长期记忆 ────────────────────────────────────────────
const KIND: Record<Memory['kind'], string> = { own: '我自己写的', vote: '你的表态', note: '你说过的理由', plan: '调仓选择', rule: '规则调整', profile: '画像变化', pref: '提醒偏好', holding: '持仓变化', ask: '问过的问题' }

/** 我想让管家记住的：用户自己写，管家不改 */
function OwnNotes() {
  const { memory, remember, forget } = useStore()
  const [text, setText] = useState('')
  const mine = memory.filter((m) => m.kind === 'own')
  const add = () => { const t = text.trim(); if (!t) return; remember({ kind: 'own', text: t }); setText('') }
  return (
    <section className="mt-5 rounded-lg border border-hairline p-4">
      <h2 className="text-base font-semibold">我想让管家记住的</h2>
      <p className="mt-0.5 text-[13px] text-steel">你自己写的投资逻辑、教训或提醒。管家不会改，只会在合适的时候拿出来。</p>
      <form onSubmit={(e) => { e.preventDefault(); add() }} className="mt-3 flex gap-2">
        <label htmlFor="own-note" className="sr-only">写一条想让管家记住的话</label>
        <input id="own-note" value={text} onChange={(e) => setText(e.target.value)} placeholder="比如：消费电子我只做长线，关税消息不追着卖" autoComplete="off" className="h-9 min-w-0 flex-1 rounded-md border border-hairline-strong bg-canvas px-3 text-sm outline-none placeholder:text-stone focus:border-primary focus:ring-1 focus:ring-primary" />
        <Button type="submit" variant="primary" disabled={!text.trim()}>记下</Button>
      </form>
      {mine.length ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {mine.map((m) => (
            <li key={m.id} className="flex items-start gap-2 rounded-md bg-surface px-3 py-2 text-sm"><span className="min-w-0 flex-1">{m.text}</span>
              <button type="button" onClick={() => forget(m.id)} className="shrink-0 text-xs text-steel hover:text-up" aria-label={`删除：${m.text}`}>删除</button></li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function MemoryList() {
  const { memory, forget, lessons, forgetLesson, openReview, setPage, tick, votes, reasons } = useStore()
  const logic = reasonStats(judgmentsAt(tick), votes, reasons)
  const groups = (Object.keys(KIND) as Memory['kind'][]).filter((k) => k !== 'own').map((k) => ({ k, items: memory.filter((m) => m.kind === k) })).filter((g) => g.items.length)
  const signals = [...new Set(lessons.map((l) => l.signal))]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 @min-[1000px]:grid-cols-2">
      <section className="mt-5 min-w-0">
        <h2 className="text-base font-semibold">经验 <span className="text-[13px] font-normal text-steel">{lessons.length} 条</span></h2>
        <p className="mt-0.5 text-[13px] text-steel">复盘时总结的。按信号归类，同类信号再出现时拿出来参考。</p>
        {lessons.length === 0 ? (
          <p className="mt-3 rounded-lg bg-surface-soft px-4 py-6 text-sm text-steel">还没有经验。<button type="button" onClick={() => setPage('review')} className="text-link hover:underline">去复盘</button>里和管家聊一条有结果的判断。</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {signals.map((sig) => (
              <div key={sig} className="rounded-lg border border-hairline">
                <h3 className="border-b border-hairline px-3.5 py-2 text-sm font-semibold">{signalOf(sig)?.name ?? sig}</h3>
                <ul>
                  {lessons.filter((l) => l.signal === sig).map((l) => (
                    <li key={l.id} className="flex items-start gap-2.5 border-b border-hairline-soft px-3.5 py-2.5 text-sm last:border-b-0">
                      <span className={cn('mt-0.5 shrink-0 rounded-xs px-1.5 text-xs font-medium leading-5', l.by === 'me' ? 'bg-tint-lavender text-on-lavender' : 'bg-tint-gray text-on-gray')}>{l.by === 'me' ? '我' : '管家'}</span>
                      <span className="min-w-0 flex-1 text-charcoal">{l.text}
                        <span className="mt-0.5 block text-xs text-stone">
                          <button type="button" onClick={() => openReview(l.jid)} className="hover:text-ink hover:underline">来自{stockOf(l.code).name}那条判断（{fmtDate(l.at)}出结果）</button>{l.seed ? ' · 演示预置' : ''}
                        </span>
                      </span>
                      <button type="button" onClick={() => forgetLesson(l.id)} className="shrink-0 text-xs text-steel hover:text-up" aria-label={`删除这条经验：${l.text}`}>删除</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="min-w-0 @min-[1000px]:mt-5">
        <h2 className="text-base font-semibold">我的逻辑</h2>
        <p className="mt-0.5 text-[13px] text-steel">你表态时选过的理由，各用了几次、看对几次。看得出哪种想法靠得住。</p>
        {logic.length === 0 ? <p className="mt-3 rounded-lg bg-surface-soft px-4 py-5 text-sm text-steel">表态时选一个理由，结果出来后这里就有记录。</p> : (
          <ul className="mt-3 overflow-hidden rounded-lg border border-hairline">
            {logic.map((r) => (
              <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_120px_auto] items-center gap-3 border-b border-hairline-soft px-3.5 py-2.5 text-sm last:border-b-0">
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="h-2 overflow-hidden rounded-r-[4px] bg-tint-gray" role="img" aria-label={`用过 ${r.used} 次，看对 ${r.right} 次`}><span className="block h-full rounded-r-[4px] bg-ink" style={{ width: `${(r.right / r.used) * 100}%` }} /></span>
                <span className="text-[13px] tabular-nums text-steel">对 {r.right} / 用 {r.used}</span>
              </li>
            ))}
          </ul>
        )}
        <h2 className="mt-7 text-base font-semibold">管家记下的事</h2>
        <p className="mt-0.5 text-[13px] text-steel">表态、理由、调仓选择、规则和画像的改动。只存在你的浏览器里。演示预置了 3 条表态和理由，不在下面。</p>
        {groups.length === 0 ? <p className="mt-3 rounded-lg bg-surface-soft px-4 py-6 text-sm text-steel">还没有新的记录。去「今日」对一条判断表个态，或者问管家一个问题。</p> : null}
        <div className="mt-3 flex flex-col gap-3">
          {groups.map(({ k, items }) => (
            <div key={k} className="rounded-lg border border-hairline">
              <h3 className="border-b border-hairline px-3.5 py-2 text-sm font-semibold">{KIND[k]} <span className="font-normal text-stone">{items.length}</span></h3>
              <ul>
                {items.slice(0, 8).map((m) => (
                  <li key={m.id} className="flex items-start gap-2 border-b border-hairline-soft px-3.5 py-2 text-[13px] last:border-b-0">
                    <span className="min-w-0 flex-1 text-charcoal">{m.text}</span>
                    <button type="button" onClick={() => forget(m.id)} className="shrink-0 text-xs text-steel hover:text-up" aria-label={`删除这条记录：${m.text}`}>删除</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// ── 管家设置 ────────────────────────────────────────────
function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-40', checked ? 'bg-primary' : 'bg-hairline-strong')}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-canvas shadow-subtle transition-[left]', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2 className="eyebrow mb-1.5 px-1">{title}</h2><ul className="overflow-hidden rounded-lg border border-hairline">{children}</ul></section>
}
/** 一行设置：左边标题和一句说明，右边是开关、状态或去处 */
function Item({ title, desc, right, onClick }: { title: string; desc?: ReactNode; right?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">{title}</span>{desc ? <span className="mt-0.5 block text-[13px] text-steel">{desc}</span> : null}</span>
      {right}{onClick ? <ChevronRight className="h-4 w-4 shrink-0 text-stone" /> : null}
    </>
  )
  return (
    <li className="border-b border-hairline-soft last:border-b-0">
      {onClick ? <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-soft">{body}</button> : <div className="flex items-center gap-3 px-3.5 py-3">{body}</div>}
    </li>
  )
}
const On = () => <span className="shrink-0 text-xs text-steel">已开启</span>
const Soon = () => <span className="shrink-0 rounded-xs bg-tint-gray px-1.5 text-xs leading-5 text-on-gray">规划中</span>
/** Pro 起才有的功能。演示里只是标出来，不限制使用 */

/** 这是一个金融场景下的个人助理：这里管它能做什么、记什么、什么时候主动找你、连着哪些数据和账户。 */
function AgentSettings() {
  const { agent, setAgent, lessons, rules, tick, openMe, setPage, setOnboarded, reset, sub } = useStore()
  const usage = useUsage()
  const [confirm, setConfirm] = useState(false)
  const live = SIGNALS.filter((x) => x.kind !== 'planned')
  const settled = judgmentsAt(tick).filter((j) => j.status !== 'pending').length
  const notify = (k: keyof typeof agent.notify, v: boolean) => setAgent({ ...agent, notify: { ...agent.notify, [k]: v } })
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-6 pt-5 @min-[1000px]:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-6">
        <section className="relative overflow-hidden rounded-xl border border-hairline bg-surface-soft p-5">
          <div aria-hidden="true" className="absolute inset-0 opacity-60 [background-image:radial-gradient(var(--hairline-strong)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:linear-gradient(120deg,transparent_35%,black)]" />
          <div className="relative">
            <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-base font-semibold text-canvas">异</span><div><p className="text-base font-semibold leading-tight">异动管家</p><p className="text-xs text-steel">你的自选股个人助理</p></div></div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[[STOCKS.length, '只自选在盯'], [lessons.length, '条经验记着'], [settled, '次对过答案']].map(([n, l]) => (
                <div key={l} className="rounded-md bg-canvas px-2 py-2"><dd className="text-xl font-semibold tabular-nums leading-none">{n}</dd><dt className="mt-1 text-xs text-steel">{l}</dt></div>
              ))}
            </dl>
            <button type="button" onClick={() => openMe('plan')} className="mt-2 flex w-full items-center gap-2.5 rounded-md bg-canvas px-3 py-2 text-left hover:bg-hover">
              <span className={cn('shrink-0 rounded-xs px-1.5 text-xs font-medium leading-5', sub.tier === 'free' ? 'bg-tint-gray text-on-gray' : 'bg-tint-lavender text-on-lavender')}>{TIER_LABEL[sub.tier]}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-charcoal">{usageNote(usage.pct)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-stone" />
            </button>
          </div>
        </section>

        <Group title="它能做什么">
          <Item title="盯异动" desc={`宏观政策与行情指标，已开 ${live.filter((x) => !rules.off.includes(x.id)).length} / ${live.length} 类信号`} onClick={() => setPage('signals')} />
          <Item title="画出传导路径" desc="一件事怎么传到你的自选股" right={<On />} />
          <Item title="给判断，到期对答案" desc="每个看法都写成能验证的话" right={<On />} />
          <Item title="复盘并总结经验" desc="说对说错都记一条，由你决定留不留" right={<On />} />
          <Item title="列出调仓做法" desc="只列做法和代价，不替你下单" right={<On />} />
        </Group>

        <Group title="什么时候主动找你">
          <Item title="判断出结果、该复盘时" right={<Toggle checked={agent.notify.review} onChange={(v) => notify('review', v)} label="判断出结果、该复盘时提醒" />} />
          <Item title="持仓股有风险、仓位超限时" right={<Toggle checked={agent.notify.holdings} onChange={(v) => notify('holdings', v)} label="持仓股有风险、仓位超限时提醒" />} />
          <Item title="我让多留意的股票有新异动时" right={<Toggle checked={agent.notify.focus} onChange={(v) => notify('focus', v)} label="我让多留意的股票有新异动时提醒" />} />
          <Item title="每天开盘前推送简报" desc="推送到手机" right={<Soon />} />
        </Group>

        <Group title="通用">
          <Item title="重看新手引导" onClick={() => { setOnboarded(false); setPage('today') }} />
          <Item title="清空本地数据" desc="删除画像、表态、持仓、经验和记录，恢复到初次打开的状态"
            right={confirm ? <span className="flex shrink-0 gap-1.5"><Button size="xs" variant="dark" onClick={() => { reset(); setConfirm(false) }}>确认清空</Button><Button size="xs" variant="ghost" onClick={() => setConfirm(false)}>取消</Button></span> : <Button size="xs" onClick={() => setConfirm(true)}>清空</Button>} />
          <Item title="关于" desc="演示版本，不构成投资建议。数据只存在你的浏览器里。" />
        </Group>
      </div>
    </div>
  )
}
