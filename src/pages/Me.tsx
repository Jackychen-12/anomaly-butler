/** 我的：持仓（可选补充）与调仓方案、长期记忆（经验与管家记下的事）、设置。 */
import { useEffect, useState } from 'react'
import { DEMO_HOLDINGS, STOCKS } from '../data/case'
import { signalOf } from '../data/signals'
import { fmtDate, grade, judgmentsAt, recentlySettled, stockOf, type Judgment } from '../engine'
import { Button, cn, LevelTag, Tag } from '../kit'
import { Scroll } from '../layout'
import { useStore, type Memory, type MeTab } from '../store'

const TABS: { key: MeTab; label: string }[] = [{ key: 'holdings', label: '持仓与调仓' }, { key: 'memory', label: '长期记忆' }, { key: 'settings', label: '设置' }]
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
  const { holdings, setHoldings, hasHoldings, tick, prefs } = useStore()
  const toDraft = (h: Record<string, number>) => Object.fromEntries(STOCKS.map((s) => [s.code, h[s.code] ? String(Math.round(h[s.code] * 100)) : '']))
  const [draft, setDraft] = useState<Record<string, string>>(() => toDraft(holdings))
  useEffect(() => setDraft(toDraft(holdings)), [holdings])
  const nums = Object.fromEntries(STOCKS.map((s) => [s.code, Math.max(0, Number(draft[s.code]) || 0) / 100]))
  const sum = Object.values(nums).reduce((a, b) => a + b, 0)
  const over = sum > 1.0001
  const dirty = STOCKS.some((s) => Math.abs(nums[s.code] - (holdings[s.code] ?? 0)) > 0.0001)

  // 调仓只针对持仓股：还在等结果的判断（事前），和最近被说中的判断（事后）
  const js = judgmentsAt(tick)
  const justHit = recentlySettled(tick).filter((j) => j.status === 'hit')
  const targets = [...js.filter((j) => j.status === 'pending'), ...justHit].filter((j) => (holdings[j.code] ?? 0) > 0)
  const [jid, setJid] = useState<string | null>(null)
  const j = targets.find((x) => x.id === jid) ?? targets[0]

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-7 @min-[1000px]:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <section className="mt-5 min-w-0">
        <h2 className="text-base font-semibold">我的持仓</h2>
        <p className="mt-0.5 text-[13px] text-steel">可以不填，不影响使用。填了之后，管家会按你的仓位决定先提醒哪条，并给出调仓的几种做法。数据只存在你的浏览器里。</p>
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
                    <td className="text-[13px] text-slate">{tj ? <span className="flex flex-wrap items-center gap-1.5">{hasHoldings ? <LevelTag level={grade(tj.anomaly.strength, holdings[s.code] ?? 0, prefs[s.code] ?? 'normal').level} /> : null}{tj.status === 'hit' ? '已跌破管家说的价格' : '有一条在等结果'}</span> : <span className="text-stone">—</span>}</td>
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

      {!hasHoldings ? (
        <div className="hidden min-w-0 @min-[1000px]:mt-5 @min-[1000px]:block">
          <h2 className="text-base font-semibold">调仓方案</h2>
          <p className="mt-3 rounded-lg border border-dashed border-hairline-strong px-4 py-6 text-sm text-steel">在左边填上持仓后，这里会针对你持有的、管家有判断的股票，列出几种做法和各自的代价。</p>
        </div>
      ) : j ? (
        <section className="min-w-0 @min-[1000px]:mt-5">
          <h2 className="text-base font-semibold">调仓方案</h2>
          <p className="mt-0.5 text-[13px] text-steel">管家列出几种做法和各自的代价，决定由你来做。这里只做记录，不会下单。</p>
          {targets.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {targets.map((t) => (
                <button key={t.id} type="button" onClick={() => setJid(t.id)} aria-pressed={t.id === j.id}
                  className={cn('h-8 rounded-md border px-3 text-[13px]', t.id === j.id ? 'border-primary bg-tint-lavender font-medium text-on-lavender' : 'border-hairline text-slate hover:bg-surface')}>{stockOf(t.code).name}{t.status === 'hit' ? ' · 已跌破' : ''}</button>
              ))}
            </div>
          ) : null}
          <Planner key={j.id} j={j} />
        </section>
      ) : (
        <div className="min-w-0 @min-[1000px]:mt-5">
          <h2 className="text-base font-semibold">调仓方案</h2>
          <p className="mt-3 rounded-lg bg-surface-soft px-4 py-6 text-sm text-steel">你持有的股票上，目前没有需要应对的判断。有新情况时，管家会在「今日」里告诉你。</p>
        </div>
      )}
      <p className="text-xs text-stone @min-[1000px]:col-span-2">调仓方案属于投资顾问服务，正式产品中需由持牌机构提供。本页为演示，不构成投资建议。</p>
    </div>
  )
}

const PLANS = [
  { key: 'hold', label: '不动', keep: 1, before: '如果管家说对了，你要承受全部跌幅。', after: '如果继续下跌，你要承受全部跌幅。' },
  { key: 'half', label: '减到一半', keep: 0.5, before: '如果管家说错了、股价反弹，你少赚一半；还有交易成本。', after: '如果之后反弹，你只能收回一半；还有交易成本。' },
  { key: 'exit', label: '全部卖出', keep: 0, before: '如果管家说错了、股价反弹，你完全错过；还有交易成本，之后还要决定何时买回。', after: '亏损就此确定，之后反弹与你无关；还要决定何时买回。' },
] as const

/** 事前（判断还在等结果）和事后（已经跌破）共用：三种做法 + 自己拖比例，实时看到变化。 */
function Planner({ j }: { j: Judgment }) {
  const { holdings, remember } = useStore()
  const s = stockOf(j.code)
  const w = holdings[j.code] ?? 0
  const post = j.status === 'hit'
  const [keep, setKeep] = useState(1)
  const [saved, setSaved] = useState(false)
  useEffect(() => setSaved(false), [keep])
  const after = w * keep
  const drop = Math.abs(j.thr) / 100
  const cash = 1 - Object.values(holdings).reduce((a, b) => a + b, 0)
  const plan = PLANS.find((p) => p.keep === keep)

  return (
    <div className="@container mt-3 rounded-lg border border-hairline">
      <div className="border-b border-hairline px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-1.5"><Tag tone={post ? 'pink' : 'orange'}>{post ? '事后 · 已经跌破' : '事前 · 还在等结果'}</Tag><span className="text-xs text-steel">{post ? `${fmtDate(j.settledOn!)} 跌破` : j.dueDate ? `${fmtDate(j.dueDate)} 对答案` : ''}</span></div>
        <p className="mt-1.5 text-[15px] font-semibold">{j.anomaly.title}</p>
        <p className="mt-0.5 text-sm text-slate">管家认为：{j.text}。{post ? '这个价格已经跌破了。' : ''}</p>
      </div>
      <div className="grid gap-5 px-4 py-4 @min-[600px]:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <p className="eyebrow mb-2">三种做法</p>
          <div className="flex flex-col gap-2">
            {PLANS.map((p) => (
              <button key={p.key} type="button" onClick={() => setKeep(p.keep)} aria-pressed={keep === p.keep}
                className={cn('rounded-md border px-3.5 py-2.5 text-left', keep === p.keep ? 'border-primary bg-tint-lavender' : 'border-hairline hover:bg-surface-soft')}>
                <span className="flex items-baseline gap-2 text-sm font-semibold">{p.label}<span className="text-[13px] font-normal tabular-nums text-steel">{s.name} {pct(w, 0)} → {pct(w * p.keep, 0)}</span></span>
                <span className="mt-0.5 block text-[13px] text-slate">代价：{post ? p.after : p.before}</span>
              </button>
            ))}
          </div>
          <label className="mt-4 block text-[13px] text-steel" htmlFor="keep">或者自己定：保留 <b className="font-medium tabular-nums text-ink">{Math.round(keep * 100)}%</b> 的{s.name}仓位</label>
          <input id="keep" type="range" min={0} max={100} step={5} value={Math.round(keep * 100)} onChange={(e) => setKeep(Number(e.target.value) / 100)} className="mt-1.5 w-full accent-[var(--primary)]" />
        </div>
        <div className="rounded-lg bg-surface-soft p-4">
          <p className="eyebrow">这样调整之后</p>
          <Delta label={`${s.name}占总资产`} before={pct(w)} after={pct(after)} changed={keep !== 1} />
          <Delta label={post ? `如果再跌 ${Math.abs(j.thr)}%，总资产再少` : '如果管家说对了，总资产至少少'} before={pct(w * drop, 2)} after={pct(after * drop, 2)} changed={keep !== 1} />
          <Delta label="现金及其他" before={pct(cash)} after={pct(cash + w - after)} changed={keep !== 1} />
          <p className="mt-3 text-xs text-steel">{post ? '「再跌」只是一个假设的幅度，用来比较不同做法。' : `按管家说的跌幅（${Math.abs(j.thr)}%）估算，这是说对时的最小损失，实际可能更大。`}</p>
          <Button variant="primary" className="mt-3 w-full" disabled={saved}
            onClick={() => { setSaved(true); remember({ kind: 'plan', code: j.code, text: `${s.name}（${post ? '已跌破后' : '等结果期间'}）选择了：${plan ? plan.label : `保留 ${Math.round(keep * 100)}%`}` }) }}>{saved ? '已记下我的选择' : '记下我的选择'}</Button>
          <p className="mt-2 text-xs text-steel">只做记录，方便日后回头看，不会下单。</p>
        </div>
      </div>
    </div>
  )
}

function Delta({ label, before, after, changed }: { label: string; before: string; after: string; changed: boolean }) {
  return (
    <div className="mt-3">
      <p className="text-[13px] text-steel">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
        {changed ? <><span className="font-normal text-stone line-through">{before}</span><span className="mx-1.5 text-stone">→</span></> : null}{after}
      </p>
    </div>
  )
}

// ── 长期记忆 ────────────────────────────────────────────
const KIND: Record<Memory['kind'], string> = { vote: '你的表态', note: '你说过的理由', pref: '提醒偏好', plan: '调仓选择', holding: '持仓变化', ask: '问过的问题' }

function MemoryList() {
  const { memory, forget, lessons, forgetLesson, openReview, setPage } = useStore()
  const groups = (Object.keys(KIND) as Memory['kind'][]).map((k) => ({ k, items: memory.filter((m) => m.kind === k) })).filter((g) => g.items.length)
  const signals = [...new Set(lessons.map((l) => l.signal))]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 @min-[1000px]:grid-cols-2">
      <section className="mt-5 min-w-0">
        <h2 className="text-base font-semibold">经验 <span className="text-[13px] font-normal text-steel">{lessons.length} 条</span></h2>
        <p className="mt-0.5 text-[13px] text-steel">每条判断出结果后，管家和你复盘时总结出来的。按信号归类，以后同类信号再出现，会先拿出来参考。每一条都可以删掉。</p>
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
        <h2 className="text-base font-semibold">管家记下的事</h2>
        <p className="mt-0.5 text-[13px] text-steel">你表过的态、说过的理由、改过的提醒、做过的调仓选择和问过的问题。管家用它们在合适的时候主动提醒你。数据只存在你的浏览器里。</p>
        <p className="mt-1 text-[13px] text-steel">演示预置了 3 条表态（小米两条、英伟达一条），不在下面的记录里。</p>
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

// ── 设置 ────────────────────────────────────────────────
const FIELD = 'h-9 w-full rounded-md border border-hairline-strong bg-canvas px-3 text-sm outline-none placeholder:text-stone focus:border-primary focus:ring-1 focus:ring-primary'

function Settings() {
  const { llm, setLlm, setOnboarded, reset, setPage } = useStore()
  const [form, setForm] = useState(llm)
  const [confirm, setConfirm] = useState(false)
  const ready = form.url.trim() && form.key.trim() && form.model.trim()
  const dirty = JSON.stringify(form) !== JSON.stringify(llm)
  return (
    <>
      <section className="mt-5 max-w-[560px]">
        <h2 className="text-base font-semibold">模型接口</h2>
        <p className="mt-0.5 text-[13px] text-steel">接入后，「今日」里的提问由你的模型回答；不接入时用内置规则回答。需要兼容 OpenAI 的 chat/completions 格式。密钥只存在你的浏览器里，请求由浏览器直接发往你填写的地址。</p>
        <div className="mt-3 flex flex-col gap-3">
          <label className="text-[13px] text-slate">接口地址<input className={cn(FIELD, 'mt-1')} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/v1" autoComplete="off" /></label>
          <label className="text-[13px] text-slate">模型名称<input className={cn(FIELD, 'mt-1')} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} autoComplete="off" /></label>
          <label className="text-[13px] text-slate">密钥<input className={cn(FIELD, 'mt-1')} type="password" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} autoComplete="off" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.on} disabled={!ready} onChange={(e) => setForm({ ...form, on: e.target.checked })} className="accent-[var(--primary)]" />用这个模型回答提问{ready ? '' : '（先填完上面三项）'}</label>
          <div><Button variant="primary" disabled={!dirty} onClick={() => setLlm({ ...form, on: form.on && !!ready })}>保存</Button></div>
        </div>
      </section>
      <section className="mt-8 max-w-[560px]">
        <h2 className="text-base font-semibold">其他</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => { setOnboarded(false); setPage('today') }}>重新看一遍新手引导</Button>
          {confirm
            ? <><Button variant="dark" onClick={() => { reset(); setConfirm(false) }}>确认清空</Button><Button variant="ghost" onClick={() => setConfirm(false)}>取消</Button></>
            : <Button variant="ghost" onClick={() => setConfirm(true)}>清空本地数据</Button>}
        </div>
        <p className="mt-2 text-xs text-steel">清空会删除你的表态、提醒偏好、持仓、经验、复盘对话、记录和接口设置，恢复到初次打开的状态。</p>
      </section>
    </>
  )
}
