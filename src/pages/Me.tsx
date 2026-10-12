/**
 * 我的，五页各管一件事、互不重复：
 * 画像（管家眼里的你：你说的 + 它观察到的 + 用在哪）、持仓、长期记忆（经验、我的逻辑、记录）、设置（这个助理能做什么、何时找你、连着什么）、订阅（各档的模型用量）。
 */
import { digest } from '../digest'
import { chat, LLM_PRESETS, llmName, llmReady } from '../llm'
import { useEffect, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { DEMO_HOLDINGS, STOCKS } from '../data/case'
import { SIGNALS } from '../data/signals'
import { JudgmentMeter } from '../charts'
import { judgmentsAt, recentlySettled, stockOf } from '../engine'
import { Button, cn, LevelTag } from '../kit'
import { Scroll } from '../layout'
import { useStore, type MeTab } from '../store'
import { MemoryTab } from './Memory'
import { PlanTab, TIER_LABEL, usageNote, useUsage } from './Plan'
import { ProfileTab } from './Profile'

// 订阅和管家设置排在最前，然后才是画像、持仓、长期记忆
const TABS: { key: MeTab; label: string }[] = [{ key: 'plan', label: '订阅' }, { key: 'settings', label: '管家设置' }, { key: 'profile', label: '投资画像' }, { key: 'holdings', label: '持仓' }, { key: 'memory', label: '长期记忆' }]
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
      {meTab === 'holdings' ? <Holdings /> : meTab === 'memory' ? <MemoryTab /> : meTab === 'profile' ? <ProfileTab /> : meTab === 'plan' ? <PlanTab /> : <AgentSettings />}
    </div>
    </Scroll>
  )
}

// ── 持仓 ────────────────────────────────────────────────
/** 仓位分布：一条横条，每只股票一段，最后是现金。段与段之间留缝，最重的几只直接标名字 */
function Allocation({ nums }: { nums: Record<string, number> }) {
  const parts = STOCKS.map((s) => ({ name: s.name.replace('-W', ''), w: nums[s.code] })).filter((p) => p.w > 0).sort((a, b) => b.w - a.w)
  const cash = Math.max(0, 1 - parts.reduce((a, p) => a + p.w, 0))
  const tones = ['bg-ink', 'bg-charcoal', 'bg-slate', 'bg-steel', 'bg-stone', 'bg-hairline-strong']
  return (
    <div className="mt-3" role="img" aria-label={`仓位分布：${parts.map((p) => `${p.name} ${Math.round(p.w * 100)}%`).join('，')}，现金 ${Math.round(cash * 100)}%`}>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {parts.map((p, i) => <span key={p.name} title={`${p.name} ${Math.round(p.w * 100)}%`} className={cn('h-full', tones[Math.min(i, tones.length - 1)])} style={{ flexGrow: p.w }} />)}
        {cash > 0 ? <span title={`现金及其他 ${Math.round(cash * 100)}%`} className="h-full bg-surface [background-image:repeating-linear-gradient(135deg,transparent_0_3px,var(--hairline-strong)_3px_4px)]" style={{ flexGrow: cash }} /> : null}
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-steel">
        {parts.slice(0, 4).map((p, i) => <span key={p.name} className="flex items-center gap-1"><span className={cn('h-2 w-2 rounded-xs', tones[i])} />{p.name} <b className="font-medium tabular-nums text-ink">{Math.round(p.w * 100)}%</b></span>)}
        {parts.length > 4 ? <span>其余 {parts.length - 4} 只 {Math.round(parts.slice(4).reduce((a, p) => a + p.w, 0) * 100)}%</span> : null}
        <span>现金 {Math.round(cash * 100)}%</span>
      </p>
    </div>
  )
}

function Holdings() {
  const { holdings, setHoldings, hasHoldings, tick, gradeOf, openStock } = useStore()
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
        {sum > 0 ? <Allocation nums={nums} /> : null}
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
        <h2 className="text-base font-semibold">需要你定做法的持仓</h2>
        <p className="mt-0.5 text-[13px] text-steel">持仓股上管家有判断的，点开到自选里定做法。</p>
        {!hasHoldings ? <p className="mt-3 rounded-lg border border-dashed border-hairline-strong px-4 py-6 text-sm text-steel">填上持仓后，这里列出和你持仓有关的判断。</p>
          : targets.length === 0 ? <p className="mt-3 rounded-lg bg-surface-soft px-4 py-6 text-sm text-steel">目前没有。</p> : (
            <ul className="mt-3 overflow-hidden rounded-lg border border-hairline">
              {targets.map((t) => (
                <li key={t.id} className="border-b border-hairline-soft last:border-b-0">
                  <button type="button" onClick={() => openStock(t.code)} className="grid w-full grid-cols-[minmax(0,1fr)_230px] items-center gap-4 max-sm:grid-cols-[minmax(0,1fr)] px-3.5 py-2.5 text-left hover:bg-surface-soft">
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

/** 我想让管家记住的：用户自己写，管家不改 */
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
/** Pro 起才有的功能。演示里只是标出来，不限制使用 */

/** 这是一个金融场景下的个人助理：这里管它能做什么、记什么、什么时候主动找你、连着哪些数据和账户。 */
/** 开盘前会推到手机上的内容：和首页同一份归并结果，最多推「打扰预算」那么多条。推送通道还没接，这里只是预览 */
function PushPreview() {
  const { tick, prevTick, gradeOf, agent } = useStore()
  const dg = digest(tick, prevTick, gradeOf)
  const items = dg.need.slice(0, agent.budget)
  return (
    <section>
      <h2 className="eyebrow mb-1.5 px-1">今天开盘前会推给你的 <span className="font-normal normal-case">· 预览，推送通道规划中</span></h2>
      <div className="rounded-xl bg-surface p-3">
        {items.length ? items.map((t) => (
          <div key={t.id} className="mb-2 flex gap-2.5 rounded-lg bg-canvas px-3 py-2.5 shadow-subtle last:mb-0">
            <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-ink text-[11px] font-semibold text-canvas">异</span>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2 text-xs text-steel"><span className="font-medium text-ink">异动管家</span><span>08:30</span><span className="ml-auto">{t.level}</span></p>
              <p className="mt-0.5 text-[13px] font-medium leading-snug">{t.cause ? t.cause.title : `${t.reactions.length} 只自选股的行情指标有异动`}</p>
              <p className="mt-0.5 truncate text-xs text-steel">涉及 {[...new Set([...(t.cause?.hits ?? []), ...t.reactions.flatMap((r) => r.hits)])].map((c) => stockOf(c).name.replace('-W', '')).join('、')}</p>
            </div>
          </div>
        )) : <p className="px-1 py-2 text-[13px] text-steel">今天没有需要推送的事。没事的日子不打扰你。</p>}
        <p className="mt-2 px-1 text-xs text-steel">今天捕捉到 {dg.signals} 条信号，归并成 {dg.things.length} 件事，只推最重要的 {items.length} 件。</p>
      </div>
    </section>
  )
}

/** 大模型：填了 key 之后，问答、每天的开场白和「管家眼中的你」由模型来写。key 只存在这个浏览器里，不进代码仓库 */
function LlmSettings() {
  const { llm, setLlm } = useStore()
  const [test, setTest] = useState<{ state: 'idle' | 'busy' | 'ok' | 'fail'; msg?: string }>({ state: 'idle' })
  const run = async () => {
    setTest({ state: 'busy' })
    try { await chat({ ...llm, on: true }, '只回复两个字。', '收到', 8); setTest({ state: 'ok' }); if (!llm.on) setLlm({ ...llm, on: true }) }
    catch (e) { setTest({ state: 'fail', msg: e instanceof Error ? e.message : '连不上' }) }
  }
  const field = 'h-9 w-full rounded-md border border-hairline-strong bg-canvas px-3 text-sm outline-none placeholder:text-stone focus-visible:border-primary'
  return (
    <section>
      <h2 className="eyebrow mb-1.5 px-1">大模型</h2>
      <div className="rounded-lg border border-hairline p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">用大模型来回答和总结</p><p className="mt-0.5 text-[13px] text-steel">{llmReady(llm) ? `已接上 ${llmName(llm)}：问答、每天的开场白、「管家眼中的你」由它来写。` : '没接时，这些由内置规则生成。'}</p></div>
          <Toggle checked={llm.on} disabled={!llm.key} onChange={(v) => setLlm({ ...llm, on: v })} label="用大模型来回答和总结" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="服务商">
          {LLM_PRESETS.map((p) => <button key={p.name} type="button" aria-pressed={llm.url === p.url} onClick={() => setLlm({ ...llm, url: p.url, model: p.model })} className={cn('h-7 rounded-full border px-3 text-[13px]', llm.url === p.url ? 'border-primary bg-tint-lavender font-medium text-on-lavender' : 'border-hairline text-slate hover:bg-surface-soft')}>{p.name}</button>)}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block text-xs text-steel">接口地址<input value={llm.url} onChange={(e) => setLlm({ ...llm, url: e.target.value.trim() })} autoComplete="off" spellCheck={false} className={cn(field, 'mt-1')} /></label>
          <label className="block text-xs text-steel">模型<input value={llm.model} onChange={(e) => setLlm({ ...llm, model: e.target.value.trim() })} autoComplete="off" spellCheck={false} className={cn(field, 'mt-1')} /></label>
        </div>
        <label className="mt-2 block text-xs text-steel">API key<input type="password" value={llm.key} onChange={(e) => { setLlm({ ...llm, key: e.target.value.trim(), on: e.target.value.trim() ? llm.on : false }); setTest({ state: 'idle' }) }} placeholder="sk-…" autoComplete="off" spellCheck={false} className={cn(field, 'mt-1 font-mono')} /></label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" variant="dark" disabled={!llm.key || test.state === 'busy'} onClick={() => void run()}>{test.state === 'busy' ? '正在测试…' : '测试并启用'}</Button>
          <span className={cn('text-[13px]', test.state === 'ok' ? 'text-on-mint' : test.state === 'fail' ? 'text-warning' : 'text-steel')}>{test.state === 'ok' ? '连上了，已启用。' : test.state === 'fail' ? `没连上：${test.msg}` : ''}</span>
        </div>
        <p className="mt-3 text-xs text-steel">key 只存在这个浏览器里，由浏览器直接发给模型服务商，不经过别的服务器，也不会进代码仓库。换一台设备需要重新填。</p>
      </div>
    </section>
  )
}

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
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Group title="什么时候主动找你">
          <Item title="判断出结果、该复盘时" right={<Toggle checked={agent.notify.review} onChange={(v) => notify('review', v)} label="判断出结果、该复盘时提醒" />} />
          <Item title="持仓股有风险、仓位超限时" right={<Toggle checked={agent.notify.holdings} onChange={(v) => notify('holdings', v)} label="持仓股有风险、仓位超限时提醒" />} />
          <Item title="我让多留意的股票有新异动时" right={<Toggle checked={agent.notify.focus} onChange={(v) => notify('focus', v)} label="我让多留意的股票有新异动时提醒" />} />
          <Item title="每天最多几件事标成「高」" desc="打扰预算：超出的自动降到「中」，不会漏，只是不抢在最前面"
            right={<span className="flex shrink-0 gap-0.5 rounded-md border border-hairline-strong p-0.5" role="group" aria-label="每天最多几件事标成高">{[1, 3, 5].map((n) => <button key={n} type="button" aria-pressed={agent.budget === n} onClick={() => setAgent({ ...agent, budget: n })} className={cn('h-7 w-8 rounded-sm text-[13px] tabular-nums', agent.budget === n ? 'bg-ink font-medium text-canvas' : 'text-slate hover:bg-hover')}>{n}</button>)}</span>} />
        </Group>

        <PushPreview />

        <LlmSettings />

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
