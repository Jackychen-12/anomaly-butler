/**
 * 订阅（演示），参考 Claude 的订阅制：各档能用的功能基本一样，差的是模型用量。
 * 用量按模型消耗的 token 计，每 5 小时一个时段、滚动重置，付费档另有每周上限；用完可以等重置、换大一档，或者（付费档）开额外用量按 token 计费。
 * 行情指标异动、对答案这些由内置规则完成的事不用模型，不占用量，用完了也照常。
 * 演示里没有真的调用大模型：用量按你在演示里做过的事折算；开通和取消只改变这里的状态，不扣费。价格、额度和折算都是示意。
 */
import { useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { anomaliesAt, fmtDate, isFresh } from '../engine'
import { Button, cn } from '../kit'
import { FREE_SUB, useStore, type Sub } from '../store'

type Tier = Sub['tier']
type Cycle = NonNullable<Sub['cycle']>
export const TIER_LABEL: Record<Tier, string> = { free: '免费版', pro: 'Pro', max5: 'Max 5 倍', max20: 'Max 20 倍' }
/** 示意价，单位元。Max 只有月付 */
const PRICE = { pro: { month: 25, year: 240 }, max5: 125, max20: 250 } as const
/** 每个时段（5 小时）的用量，单位千 token，示意。Pro 是免费版的 5 倍，Max 是 Pro 的 5 倍或 20 倍 */
const QUOTA: Record<Tier, number> = { free: 50, pro: 250, max5: 1250, max20: 5000 }
/** 每周上限是时段用量的多少倍。只有付费档有每周上限 */
const WEEK_X = 10
/** 各种事折算成多少千 token，示意 */
const COST = { brief: 12, event: 8, ask: 4, review: 5 }
/** 额外用量每月最多花多少元，示意 */
const EXTRA_CAP = 50
/** 演示停在开盘前，当前时段从 9:00 算起 */
const RESET = '14:00'
const UP: Record<Tier, Tier | null> = { free: 'pro', pro: 'max5', max5: 'max20', max20: null }

const priceOf = (tier: Tier, cycle: Cycle) => (tier === 'free' ? 0 : tier === 'pro' ? PRICE.pro[cycle] : PRICE[tier])
/** 到期或下次续费的日期：从演示里的「今天」往后推 */
function due(from: string, cycle: Cycle) {
  const t = new Date(`${from}T00:00:00Z`)
  if (cycle === 'month') t.setUTCMonth(t.getUTCMonth() + 1)
  else t.setUTCFullYear(t.getUTCFullYear() + 1)
  return t.toISOString().slice(0, 10)
}
function nextMonday(d: string) {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + ((8 - t.getUTCDay()) % 7 || 7))
  return t.toISOString().slice(0, 10)
}
const fmtFull = (d: string) => `${d.slice(0, 4)}年${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`
/** 千 token 写成好读的数：6 千、2.6 万、125 万 */
const fmtK = (k: number) => (k < 10 ? `${k} 千` : `${+(k / 10).toFixed(1)} 万`)
/** 「已用 8%」「已用不到 1%」：前面的词和百分比连成一句 */
const pctOf = (word: string, p: number) => (p > 0 && p < 0.01 ? `${word}不到 1%` : `${word} ${Math.min(100, Math.round(p * 100))}%`)

/** 一句话说清现在的订阅状态 */
function subLine(sub: Sub) {
  if (sub.tier === 'free' || !sub.cycle || !sub.until) return '用量按时段计，每 5 小时重置'
  return sub.cycle === 'year' ? `年付，有效期到 ${fmtFull(sub.until)}` : `月付，${fmtFull(sub.until)} 续费 ${priceOf(sub.tier, 'month')} 元`
}
/** 「管家设置」里用的一句用量 */
export const usageNote = (p: number) => `${pctOf('当前时段已用', p)}，${RESET} 重置`

/** 当前时段的模型用量：按演示里做过的事折算 */
export function useUsage() {
  const { sub, tick, prevTick, chat, memory, dialog } = useStore()
  const events = anomaliesAt(tick).filter((a) => !a.auto && isFresh(a, tick, prevTick)).length
  const asks = Math.max(chat.length, memory.filter((m) => m.kind === 'ask').length)
  const turns = Object.values(dialog).flat().filter((t) => t.who === 'me').length
  const rows = [
    { label: '开盘前简报', n: '1 次', k: COST.brief },
    { label: '读资讯、画传导路径、写判断', n: `${events} 件事`, k: events * COST.event },
    { label: '回答提问', n: `${asks} 次`, k: asks * COST.ask },
    { label: '复盘对话', n: `${turns} 句`, k: turns * COST.review },
  ]
  const used = rows.reduce((a, r) => a + r.k, 0)
  // 本周：今天之前的交易日按「简报 + 当天的事」估，再加上今天的
  const before = Math.max(0, new Date(`${tick}T00:00:00Z`).getUTCDay() - 1)
  const quota = QUOTA[sub.tier]
  return { rows, used, quota, pct: used / quota, weekPct: (used + before * (COST.brief + events * COST.event)) / (quota * WEEK_X) }
}

function Meter({ label, p, note }: { label: string; p: number; note: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]"><span className="font-medium text-ink">{label}</span><span className="text-xs text-steel">{note}</span></div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-hairline" role="img" aria-label={pctOf(`${label}已用`, p)}>
        <span className={cn('block h-full rounded-full', p >= 1 ? 'bg-up' : p >= 0.8 ? 'bg-warning' : 'bg-ink')} style={{ width: `${Math.max(1.5, Math.min(100, p * 100))}%` }} />
      </div>
    </div>
  )
}

/** 两三个选项里选一个 */
function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-md bg-surface p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}
          className={cn('h-6 rounded-sm px-2 text-xs', value === o.v ? 'bg-canvas font-medium text-ink shadow-subtle' : 'text-steel hover:text-ink')}>{o.label}</button>
      ))}
    </div>
  )
}

type Perk = { t: string; soon?: boolean }
/** 一档：名字、给谁用、价格、用量（这是各档真正差的地方）、附带的几样、开通按钮 */
function PlanCard({ name, who, pick, price, bill, usage, quota, perks, current, action }: { name: string; who: string; pick?: ReactNode; price: number; bill: string; usage: string; quota: string; perks: Perk[]; current: boolean; action: ReactNode }) {
  return (
    <div className={cn('flex flex-col rounded-lg border p-4', current ? 'border-ink' : 'border-hairline')}>
      <div className="flex min-h-7 flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{name}</h3>
        {current ? <span className="rounded-xs bg-tint-gray px-1.5 text-[11px] font-medium leading-4 text-on-gray">当前</span> : null}
        <span className="ml-auto">{pick}</span>
      </div>
      <p className="text-xs text-steel">{who}</p>
      <p className="mt-3"><span className="text-[26px] font-semibold tabular-nums leading-none tracking-tight">¥{price}</span><span className="text-[13px] text-steel"> / 月</span></p>
      <p className="mt-1 text-xs text-steel">{bill}</p>
      <div className="mt-3 rounded-md bg-surface-soft px-3 py-2">
        <p className="eyebrow">模型用量</p>
        <p className="mt-0.5 text-[15px] font-semibold">{usage}</p>
        <p className="text-xs text-steel">{quota}</p>
      </div>
      <ul className="mt-3 flex flex-1 flex-col gap-1.5 text-[13px] text-charcoal">
        {perks.map((p) => (
          <li key={p.t} className="flex items-start gap-1.5">
            <Check aria-hidden="true" className="mt-[3px] h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0">{p.t}{p.soon ? <span className="ml-1.5 whitespace-nowrap rounded-xs bg-tint-gray px-1 text-[11px] leading-4 text-on-gray">规划中</span> : null}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4">{action}</div>
    </div>
  )
}

export function PlanTab() {
  const { sub, setSub, tick } = useStore()
  const u = useUsage()
  const [cycle, setCycle] = useState<Cycle>(sub.tier === 'pro' && sub.cycle ? sub.cycle : 'year')
  const [max, setMax] = useState<'max5' | 'max20'>(sub.tier === 'max20' ? 'max20' : 'max5')
  const paid = sub.tier !== 'free'
  const pick = (tier: Tier, c: Cycle) => setSub(tier === 'free' ? FREE_SUB : { tier, cycle: c, until: due(tick, c), extra: sub.extra })
  /** 某一档的按钮：已经是它就不能点 */
  const act = (tier: Tier, c: Cycle, label: string) => {
    const current = sub.tier === tier && (tier === 'free' || sub.cycle === c)
    return <Button variant={current ? 'secondary' : tier === 'free' ? 'secondary' : 'primary'} size="md" className="w-full" disabled={current} onClick={() => pick(tier, c)}>{current ? '当前方案' : label}</Button>
  }
  const up = UP[sub.tier]
  const full = u.pct >= 1

  return (
    <div className="pt-5">
      <section className="rounded-xl border border-hairline bg-surface-soft p-5">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-5 @min-[1000px]:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div>
            <p className="eyebrow">当前订阅</p>
            <p className="mt-1.5 text-[22px] font-semibold leading-snug tracking-tight">{paid ? `异动管家 ${TIER_LABEL[sub.tier]}` : '免费版'}</p>
            <p className="mt-1.5 text-[13px] text-charcoal">{subLine(sub)}。</p>
            {paid ? <Button variant="ghost" size="xs" className="-ml-2.5 mt-1.5" onClick={() => setSub(FREE_SUB)}>取消订阅</Button> : null}
          </div>
          <div className="flex flex-col justify-center gap-4">
            <Meter label="当前时段" p={u.pct} note={`${pctOf('已用', u.pct)}（约 ${fmtK(u.used)} / ${fmtK(u.quota)} token）· ${RESET} 重置`} />
            {paid ? <Meter label="本周" p={u.weekPct} note={`${pctOf('已用', u.weekPct)} · ${fmtDate(nextMonday(tick))}重置`} />
              : <p className="text-xs text-steel">免费版只按时段计。付费档用量更多，另有每周上限。</p>}
          </div>
        </div>
        {u.pct >= 0.8 ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-tint-yellow px-3.5 py-2.5">
            <p className="min-w-0 flex-1 basis-60 text-[13px] text-on-yellow">
              {!full ? `当前时段的用量快用完了，${RESET} 重置。` : sub.extra ? '当前时段的用量用完了，接下来算额外用量，按 token 计费，到每月上限为止。' : `当前时段的用量用完了，${RESET} 重置。行情指标的异动和对答案不用模型，照常；要用模型的功能先停。`}
            </p>
            {up ? <Button variant="primary" onClick={() => pick(up, up === 'pro' ? cycle : 'month')}>换成 {TIER_LABEL[up]}</Button> : null}
          </div>
        ) : null}
      </section>

      <section className="mt-7">
        <h2 className="text-base font-semibold">三档差在哪</h2>
        <p className="mt-0.5 text-[13px] text-steel">各档能用的功能基本一样，差的是模型用量。没有固定的次数：问题越长、读的资讯越多、盯的自选越多，用得越快。</p>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 @min-[760px]:grid-cols-3">
          <PlanCard name="免费版" who="先用起来" price={0} bill="不用付费" usage="基础用量" quota={`每个时段约 ${fmtK(QUOTA.free)} token`} current={!paid} action={act('free', 'month', '换回免费版')}
            perks={[{ t: '所有页面的功能都能用' }, { t: '标准模型' }, { t: '每天开盘前一次简报' }]} />
          <PlanCard name="Pro" who="每天都看盘" price={cycle === 'year' ? PRICE.pro.year / 12 : PRICE.pro.month} bill={cycle === 'year' ? `年付，一次付 ¥${PRICE.pro.year}` : '按月付，随时可以取消'}
            usage="免费版的 5 倍" quota={`每个时段约 ${fmtK(QUOTA.pro)} token，另有每周上限`} current={sub.tier === 'pro'} action={act('pro', cycle, sub.tier === 'pro' ? `换成${cycle === 'year' ? '年付' : '月付'}` : paid ? '换成 Pro' : '开通 Pro')}
            pick={<Seg label="Pro 的付费方式" value={cycle} onChange={setCycle} options={[{ v: 'year', label: '年付' }, { v: 'month', label: '月付' }]} />}
            perks={[{ t: '更强的模型做归因和复盘', soon: true }, { t: '盘中实时盯盘', soon: true }, { t: '推送到微信、飞书', soon: true }, { t: '用完了可以开额外用量' }]} />
          <PlanCard name="Max" who="自选多，盘中一直开着管家" price={PRICE[max]} bill="只有月付" usage={`Pro 的 ${max === 'max5' ? 5 : 20} 倍`} quota={`每个时段约 ${fmtK(QUOTA[max])} token，另有每周上限`}
            current={sub.tier === 'max5' || sub.tier === 'max20'} action={act(max, 'month', `${paid ? '换成' : '开通'} ${TIER_LABEL[max]}`)}
            pick={<Seg label="Max 的用量" value={max} onChange={setMax} options={[{ v: 'max5', label: '5 倍' }, { v: 'max20', label: '20 倍' }]} />}
            perks={[{ t: 'Pro 有的都有' }, { t: '开盘和出大事时优先响应', soon: true }, { t: '一次能读更多资讯原文', soon: true }, { t: '新功能先用' }]} />
        </div>
      </section>

      <div className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-7 @min-[1000px]:grid-cols-2">
        <section className="min-w-0">
          <h2 className="text-base font-semibold">这个时段用在哪</h2>
          <p className="mt-0.5 text-[13px] text-steel">用量按模型消耗的 token 计。合计约 {fmtK(u.used)} token，{pctOf('占这个时段的', u.pct)}。</p>
          <ul className="mt-3 overflow-hidden rounded-lg border border-hairline">
            {u.rows.map((r) => (
              <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_72px_64px] items-center gap-3 border-b border-hairline-soft px-3.5 py-2.5 text-sm last:border-b-0">
                <span className="min-w-0">{r.label}<span className="ml-1.5 text-xs text-steel">{r.n}</span></span>
                <span className="h-2 overflow-hidden rounded-r-[4px] bg-tint-gray" aria-hidden="true"><span className="block h-full rounded-r-[4px] bg-ink" style={{ width: `${(r.k / u.used) * 100}%` }} /></span>
                <span className="text-right text-[13px] tabular-nums text-steel">{r.k ? fmtK(r.k) : '—'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-lg bg-surface-soft px-4 py-3 text-[13px] text-charcoal"><b className="font-semibold">不用模型，不占用量：</b>行情指标的异动、对答案与战绩、表态、调仓做法、调阈值与评测、画像和持仓。这些由内置规则完成，用量用完了也照常，不会因此漏掉行情上的异动。</p>
        </section>

        <div className="flex min-w-0 flex-col gap-7">
          <section>
            <h2 className="text-base font-semibold">用量怎么算，用完了怎么办</h2>
            <ul className="mt-3 overflow-hidden rounded-lg border border-hairline text-[13px] text-charcoal [&>li]:border-b [&>li]:border-hairline-soft [&>li]:px-4 [&>li]:py-2.5 [&>li:last-child]:border-b-0">
              <li>每 5 小时一个时段，滚动重置；付费档另有每周上限。</li>
              <li>App、微信、飞书里用的，算在同一份用量里。</li>
              <li>用到 80% 时提醒一次。用完后可以等重置、换大一档，或者开额外用量。</li>
              <li>连续两周都用完，管家会建议换大一档；其余时候不提升级。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold">额外用量</h2>
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-hairline px-4 py-3">
              <p className="min-w-0 flex-1 text-[13px] text-charcoal">用量用完后接着用，按实际消耗的 token 计费，每月最多 {EXTRA_CAP} 元。<span className="block text-xs text-steel">{paid ? (sub.extra ? '已开启。' : '没有开启，用完后等重置。') : 'Pro 和 Max 可以开启。'}</span></p>
              <Button disabled={!paid} onClick={() => setSub({ ...sub, extra: !sub.extra })}>{sub.extra ? '关闭' : '开启'}</Button>
            </div>
          </section>

          <p className="rounded-lg bg-surface-soft px-4 py-3 text-xs leading-relaxed text-steel">演示说明：演示里没有真的调用大模型，用量是按你在演示里做过的事折算的，去问管家一个问题再回来，数字会变。开通、换档和取消只改变这里的状态，不会扣费；其他页面的功能暂不受限。价格、各档用量和折算方式是示意，还没定。</p>
        </div>
      </div>
    </div>
  )
}
