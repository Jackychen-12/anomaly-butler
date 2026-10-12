/** 我的：投资画像（风险承受与风格）、持仓（可选补充）与调仓方案、长期记忆（经验与管家记下的事）。 */
import { useEffect, useState } from 'react'
import { DEMO_HOLDINGS, STOCKS } from '../data/case'
import { signalOf } from '../data/signals'
import { JudgmentMeter } from '../charts'
import { fmtDate, judgmentsAt, recentlySettled, stockOf } from '../engine'
import { HORIZON_LABEL, observed, profileLabel, profileSet, RISK_LABEL, type Profile } from '../profile'
import { reasonStats } from '../review'
import { Button, cn, LevelTag } from '../kit'
import { Scroll } from '../layout'
import { useStore, type Memory, type MeTab } from '../store'

const TABS: { key: MeTab; label: string }[] = [{ key: 'settings', label: '投资画像' }, { key: 'holdings', label: '持仓' }, { key: 'memory', label: '长期记忆' }]
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
            className={cn('-mb-px h-9 border-b-2 px-3 text-sm', meTab === t.key ? 'border-ink font-medium text-ink' : 'border-transparent text-steel hover:text-ink')}>{t.label}</button>
        ))}
      </div>
      {meTab === 'holdings' ? <Holdings /> : meTab === 'memory' ? <MemoryList /> : <Settings />}
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
                    <td className="text-[13px] text-slate">{tj ? <span className="flex flex-wrap items-center gap-1.5">{hasHoldings ? <LevelTag level={gradeOf(tj.anomaly, s.code).level} /> : null}{tj.status === 'hit' ? '已跌破管家说的价格' : '有一条在等结果'}</span> : <span className="text-stone">—</span>}</td>
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
const KIND: Record<Memory['kind'], string> = { vote: '你的表态', note: '你说过的理由', plan: '调仓选择', rule: '规则调整', profile: '画像变化', pref: '提醒偏好', holding: '持仓变化', ask: '问过的问题' }

function MemoryList() {
  const { memory, forget, lessons, forgetLesson, openReview, setPage, tick, votes, reasons, profile, openMe } = useStore()
  const logic = reasonStats(judgmentsAt(tick), votes, reasons)
  const groups = (Object.keys(KIND) as Memory['kind'][]).map((k) => ({ k, items: memory.filter((m) => m.kind === k) })).filter((g) => g.items.length)
  const signals = [...new Set(lessons.map((l) => l.signal))]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 @min-[1000px]:grid-cols-2">
      <section className="mt-5 min-w-0 rounded-lg border border-hairline p-4 @min-[1000px]:col-span-2">
        <div className="flex flex-wrap items-baseline gap-x-3"><h2 className="text-base font-semibold">关于你</h2><span className="text-sm font-medium">{profileSet(profile) ? profileLabel(profile) : '画像还没设完'}{profile.maxWeight ? ` · 单只不超过 ${profile.maxWeight}%` : ''}</span>
          <button type="button" onClick={() => openMe('settings')} className="ml-auto text-[13px] text-link hover:underline">改画像 →</button></div>
        {profile.rules.length ? <p className="mt-1.5 text-[13px] text-charcoal">我的原则：{profile.rules.join('；')}</p> : null}
        <AboutMe />
      </section>
      <section className="min-w-0">
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

/** 管家从长期记下的表态和调仓选择里观察到的你。画像也是长期记忆的一部分 */
function AboutMe() {
  const { profile, plans, votes, holdings, tick } = useStore()
  const js = judgmentsAt(tick)
  const voted = js.filter((j) => votes[j.id] === 'agree' || votes[j.id] === 'disagree')
  const split = voted.filter((j) => votes[j.id] === 'disagree' && (j.status === 'hit' || j.status === 'miss'))
  const o = observed(profile, plans, { votes: voted.length, disagree: split.length, disagreeRight: split.filter((j) => j.status === 'miss').length }, holdings, (c) => stockOf(c).name)
  return (
    <>
      <p className="eyebrow mt-4">管家观察到的你</p>
      {o.facts.length ? <ul className="mt-1.5 flex flex-col gap-1 text-[13px] text-charcoal">{o.facts.map((f) => <li key={f}>{f}</li>)}</ul> : <p className="mt-1.5 text-[13px] text-steel">用得多了，这里会出现你实际的习惯。</p>}
      {o.mismatch ? <p className="mt-2 rounded-md bg-tint-yellow px-2.5 py-1.5 text-[13px] text-on-yellow">{o.mismatch}</p> : null}
    </>
  )
}

// ── 投资画像 ────────────────────────────────────────────
const Q1: { v: NonNullable<Profile['tolerance']>; hint: string }[] = [{ v: 10, hint: '跌一点就难受' }, { v: 20, hint: '能扛一阵' }, { v: 30, hint: '大跌也拿得住' }]
const Q2: { v: NonNullable<Profile['horizon']>; hint: string; span: number }[] = [{ v: 'short', hint: '几天到几周', span: 12 }, { v: 'mid', hint: '几个月', span: 45 }, { v: 'long', hint: '一年以上', span: 100 }]
const Q4: { v: NonNullable<Profile['maxWeight']>; hint: string }[] = [{ v: 10, hint: '很分散' }, { v: 20, hint: '适中' }, { v: 30, hint: '比较集中' }]
const Q3: { v: NonNullable<Profile['reaction']>; label: string }[] = [{ v: 'cut', label: '先减仓' }, { v: 'hold', label: '先不动，观察' }, { v: 'add', label: '越跌越买' }]
const CARD = 'rounded-lg border px-3.5 py-3 text-left transition-colors'
const cardCls = (on: boolean) => cn(CARD, on ? 'border-primary bg-tint-lavender' : 'border-hairline hover:bg-surface-soft')

function Settings() {
  const { profile, setProfile, setOnboarded, reset, setPage } = useStore()
  const [rule, setRule] = useState('')
  const [confirm, setConfirm] = useState(false)
  const set = (p: Partial<Profile>, note: string) => setProfile(p, note)
  const addRule = () => { const t = rule.trim(); if (!t || profile.rules.length >= 3) return; set({ rules: [...profile.rules, t] }, `加了一条原则：${t}`); setRule('') }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-7 @min-[1000px]:grid-cols-[minmax(0,1fr)_340px]">
      <div className="mt-5 flex min-w-0 flex-col gap-6">
        <fieldset>
          <legend className="text-base font-semibold">一只股票，最多能接受跌多少？</legend>
          <div className="mt-2.5 grid grid-cols-3 gap-2.5">
            {Q1.map((o) => (
              <button key={o.v} type="button" aria-pressed={profile.tolerance === o.v} onClick={() => set({ tolerance: o.v }, `能接受的最大跌幅设为 ${o.v}%`)} className={cardCls(profile.tolerance === o.v)}>
                <span className="flex h-12 items-start gap-1.5" aria-hidden="true"><span className="h-full w-px bg-hairline-strong" /><span className="w-5 rounded-b-[4px] bg-down" style={{ height: `${(o.v / 30) * 100}%` }} /></span>
                <span className="mt-2 block text-lg font-semibold tabular-nums">−{o.v}%</span>
                <span className="block text-xs text-steel">{o.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-base font-semibold">一般拿多久？</legend>
          <div className="mt-2.5 grid grid-cols-3 gap-2.5">
            {Q2.map((o) => (
              <button key={o.v} type="button" aria-pressed={profile.horizon === o.v} onClick={() => set({ horizon: o.v }, `持有周期设为${HORIZON_LABEL[o.v]}`)} className={cardCls(profile.horizon === o.v)}>
                <span className="block h-1.5 rounded-full bg-hairline" aria-hidden="true"><span className="block h-full rounded-full bg-ink" style={{ width: `${o.span}%` }} /></span>
                <span className="mt-2.5 block text-lg font-semibold">{HORIZON_LABEL[o.v]}</span>
                <span className="block text-xs text-steel">{o.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-base font-semibold">遇到大跌，你通常怎么做？</legend>
          <div className="mt-2.5 grid grid-cols-3 gap-2.5">
            {Q3.map((o) => (
              <button key={o.v} type="button" aria-pressed={profile.reaction === o.v} onClick={() => set({ reaction: o.v }, `遇到大跌的习惯设为：${o.label}`)} className={cardCls(profile.reaction === o.v)}>
                <span className="block text-[15px] font-semibold">{o.label}</span>
                <span className="block text-xs text-steel">{RISK_LABEL[o.v]}型</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-base font-semibold">一只股票，最多放多少仓位？</legend>
          <div className="mt-2.5 grid grid-cols-3 gap-2.5">
            {Q4.map((o) => (
              <button key={o.v} type="button" aria-pressed={profile.maxWeight === o.v} onClick={() => set({ maxWeight: o.v }, `单只股票的仓位上限设为 ${o.v}%`)} className={cardCls(profile.maxWeight === o.v)}>
                <span className="block h-1.5 rounded-full bg-hairline" aria-hidden="true"><span className="block h-full rounded-full bg-primary" style={{ width: `${o.v}%` }} /></span>
                <span className="mt-2.5 block text-lg font-semibold tabular-nums">{o.v}%</span>
                <span className="block text-xs text-steel">{o.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-base font-semibold">我的原则 <span className="text-[13px] font-normal text-steel">可选，最多 3 条</span></legend>
          <ul className="mt-2 flex flex-col gap-1.5">
            {profile.rules.map((r, i) => (
              <li key={i} className="flex items-center gap-2 rounded-md bg-surface px-3 py-2 text-sm"><span className="min-w-0 flex-1">{r}</span>
                <button type="button" onClick={() => set({ rules: profile.rules.filter((_, k) => k !== i) }, `删了一条原则：${r}`)} className="shrink-0 text-xs text-steel hover:text-up" aria-label={`删除原则：${r}`}>删除</button></li>
            ))}
          </ul>
          {profile.rules.length < 3 ? (
            <form onSubmit={(e) => { e.preventDefault(); addRule() }} className="mt-2 flex gap-2">
              <label htmlFor="rule" className="sr-only">写一条你自己的原则</label>
              <input id="rule" value={rule} onChange={(e) => setRule(e.target.value)} placeholder="比如：不因为短期波动卖出长期看好的公司" autoComplete="off" className="h-9 min-w-0 flex-1 rounded-md border border-hairline-strong bg-canvas px-3 text-sm outline-none placeholder:text-stone focus:border-primary focus:ring-1 focus:ring-primary" />
              <Button type="submit" disabled={!rule.trim()}>加上</Button>
            </form>
          ) : null}
        </fieldset>
      </div>

      <aside className="min-w-0 @min-[1000px]:mt-5">
        <div className="rounded-lg border border-hairline p-4">
          <p className="eyebrow">你的画像</p>
          <p className="mt-1.5 text-lg font-semibold leading-snug">{profileSet(profile) ? profileLabel(profile) : '还没设完'}</p>
          {profileSet(profile) ? null : <p className="mt-1 text-[13px] text-steel">选完左边三项就生效。</p>}
          <AboutMe />
          <p className="eyebrow mt-4">管家会怎么用</p>
          <ul className="mt-1.5 flex flex-col gap-1.5 text-[13px] text-charcoal">
            <li>按持有周期调整提醒：长线少提醒短期波动，短线多提醒。</li>
            <li>每条判断旁边，对照你的承受上限说一句。</li>
            <li>调仓时标出更接近你风格的做法；你选的不一样时提醒一句，决定仍由你做。</li>
            <li>持仓超过你设的单只上限时提醒。</li>
          </ul>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="xs" onClick={() => { setOnboarded(false); setPage('today') }}>重看新手引导</Button>
          {confirm
            ? <><Button size="xs" variant="dark" onClick={() => { reset(); setConfirm(false) }}>确认清空</Button><Button size="xs" variant="ghost" onClick={() => setConfirm(false)}>取消</Button></>
            : <Button size="xs" variant="ghost" onClick={() => setConfirm(true)}>清空本地数据</Button>}
        </div>
        <p className="mt-2 text-xs text-steel">清空会删除画像、表态、持仓、经验和记录，恢复到初次打开的状态。</p>
      </aside>
    </div>
  )
}
