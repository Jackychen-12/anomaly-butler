/**
 * 投资画像：管家眼里的你。
 * 上面是一张概览（风险偏好、持有周期、集中度三条轴，同时标出「你说的」和「实际的」）；
 * 下面是你告诉管家的各项，每项下面写明它用在哪个功能上。
 * 管家观察到的你、以及这些了解起的作用，在「长期记忆」页（Observed.tsx）。
 */
import { useState } from 'react'
import { Button, cn } from '../kit'
import { EXPERIENCE_LABEL, filled, FOCUS_LABEL, GOAL_LABEL, HORIZON_LABEL, profileLabel, profileSet, REACTION_LABEL, riskScore, riskType, TOTAL, type Focus, type Profile } from '../profile'
import { useStore } from '../store'

/** 一条轴：左右两端是两种倾向，实心点是你说的，空心圈是管家从行为里看到的 */
function Axis({ label, left, right, said, seen, seenText }: { label: string; left: string; right: string; said: number | null; seen: number | null; seenText: string }) {
  const at = (v: number) => `${Math.max(3, Math.min(97, v * 100))}%`
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]"><span className="font-medium text-ink">{label}</span><span className="text-xs text-steel">{seenText}</span></div>
      <div className="relative mt-2 h-1.5 rounded-full bg-hairline" role="img" aria-label={`${label}：你说的${said == null ? '还没填' : `偏${said < 0.4 ? left : said > 0.6 ? right : '中间'}`}；${seenText}`}>
        {said != null ? <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-canvas" style={{ left: at(said) }} /> : null}
        {seen != null ? <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-canvas" style={{ left: at(seen) }} /> : null}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-stone"><span>{left}</span><span>{right}</span></div>
    </div>
  )
}

/** 一项设定：标题 + 几个选项 + 一句「用在哪」 */
function Choice<T extends string | number>({ label, use, options, picked, onPick }: { label: string; use: string; options: { v: T; label: string }[]; picked: (v: T) => boolean; onPick: (v: T, label: string) => void }) {
  return (
    <div className="border-b border-hairline-soft py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 basis-40 text-sm font-medium text-ink">{label}</p>
        <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
          {options.map((o) => (
            <button key={String(o.v)} type="button" aria-pressed={picked(o.v)} onClick={() => onPick(o.v, o.label)}
              className={cn('h-8 rounded-md border px-3 text-[13px] transition-colors', picked(o.v) ? 'border-primary bg-tint-lavender font-medium text-on-lavender' : 'border-hairline text-slate hover:bg-surface-soft')}>{o.label}</button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-steel">用在：{use}</p>
    </div>
  )
}

const opts = <T extends string>(m: Record<T, string>) => (Object.keys(m) as T[]).map((v) => ({ v, label: m[v] }))
const PCT = [10, 20, 30] as const

export function ProfileTab() {
  const { profile, setProfile, plans, holdings, openMe } = useStore()
  const [rule, setRule] = useState('')
  const set = (p: Partial<Profile>, note: string) => setProfile(p, note)
  const addRule = () => { const t = rule.trim(); if (!t || profile.rules.length >= 3) return; set({ rules: [...profile.rules, t] }, `加了一条原则：${t}`); setRule('') }

  // 概览里「实际的」那个圈：来自记下的调仓选择和持仓
  const choices = Object.values(plans)
  const cut = choices.filter((c) => c.keep < 1).length, more = choices.filter((c) => c.keep > 1).length, off = choices.filter((c) => c.off).length
  const held = Object.entries(holdings).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1])
  const mismatch = off >= 2 ? `有 ${off} 次调仓选择和设定的风格不一样。也许实际的你和设定的不同，可以改一下下面的设定。`
    : profile.reaction === 'hold' && choices.length >= 2 && cut / choices.length > 0.6 ? '你说大跌时「先不动，观察」，但实际多数时候选择了减仓。' : null

  // ── 三条轴：你说的 / 实际的
  const risk = riskScore(profile)
  const seenRisk = choices.length >= 2 ? 1 - cut / choices.length + (more / choices.length) * 0.3 : null
  const saidHorizon = profile.horizon ? { short: 0.12, mid: 0.5, long: 0.88 }[profile.horizon] : null
  const saidConc = profile.maxWeight ? { 10: 0.25, 20: 0.5, 30: 0.75 }[profile.maxWeight] : null
  const seenConc = held.length ? Math.min(1, held[0][1] / 0.4) : null

  return (
    <div className="pt-5">
      <section className="rounded-xl border border-hairline bg-surface-soft p-5">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-5 @min-[1000px]:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div>
            <p className="eyebrow">管家眼里的你</p>
            <p className="mt-1.5 text-[22px] font-semibold leading-snug tracking-tight">{profileSet(profile) ? profileLabel(profile) : '还不太了解你'}</p>
            <p className="mt-1.5 text-[13px] text-charcoal">
              {[profile.goal ? `目标是${GOAL_LABEL[profile.goal]}` : '', profile.experience ? `投资经验${EXPERIENCE_LABEL[profile.experience]}` : '', profile.focus.length ? `主要看${profile.focus.map((f) => FOCUS_LABEL[f]).join('、')}` : ''].filter(Boolean).join('，') || '填完下面几项，管家会按你的情况提醒和说明。'}
              {profileSet(profile) ? '。' : ''}
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-steel" aria-label={`已了解 ${filled(profile)} 项，共 ${TOTAL} 项`}>
              <span className="flex gap-0.5" aria-hidden="true">{Array.from({ length: TOTAL }, (_, i) => <span key={i} className={cn('h-1.5 w-5 rounded-full', i < filled(profile) ? 'bg-ink' : 'bg-hairline-strong')} />)}</span>
              已了解 {filled(profile)} / {TOTAL} 项
            </div>
            <p className="mt-3 flex items-center gap-3 text-xs text-steel"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink" />你说的</span><span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-primary bg-canvas" />管家观察到的</span></p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-5 sm:grid-cols-3">
            <Axis label="风险偏好" left="保守" right="积极" said={risk == null ? null : risk / 100} seen={seenRisk} seenText={risk == null ? '还没填' : `你说的：${riskType(risk)}`} />
            <Axis label="持有周期" left="短线" right="长线" said={saidHorizon} seen={null} seenText={profile.horizon ? `你说的：${HORIZON_LABEL[profile.horizon]}` : '还没填'} />
            <Axis label="持仓集中度" left="分散" right="集中" said={saidConc} seen={seenConc} seenText={held.length ? `实际最大一只 ${Math.round(held[0][1] * 100)}%` : '填了持仓才看得出'} />
          </div>
        </div>
        {mismatch ? <p className="mt-4 rounded-md bg-tint-yellow px-3 py-2 text-[13px] text-on-yellow">{mismatch}</p> : null}
      </section>

      <section className="mt-6 min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-x-4">
          <div><h2 className="text-base font-semibold">你告诉管家的</h2><p className="mt-0.5 text-[13px] text-steel">都可以不填，随时能改。每一项下面写着它用在哪。</p></div>
          <button type="button" onClick={() => openMe('memory')} className="text-[13px] text-link hover:underline">看管家观察到的你 →</button>
        </div>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-x-10 rounded-lg border border-hairline px-4 @min-[1000px]:grid-cols-2 [&>div]:border-b [&>div]:border-hairline-soft [&>div:last-child]:border-b-0">
            <Choice label="一只股票，最多能接受跌多少" use="每条看跌判断旁边的对照说明；调仓时的提示" options={PCT.map((v) => ({ v, label: `−${v}%` }))} picked={(v) => profile.tolerance === v} onPick={(v) => set({ tolerance: v }, `能接受的最大跌幅设为 ${v}%`)} />
            <Choice label="一般拿多久" use="异动的等级——长线少提醒短期的行情波动，短线多提醒" options={opts(HORIZON_LABEL)} picked={(v) => profile.horizon === v} onPick={(v, l) => set({ horizon: v }, `持有周期设为${l}`)} />
            <Choice label="遇到大跌，通常怎么做" use="判断第四步里，标出更接近你的做法；选得不一样时提醒一句" options={opts(REACTION_LABEL)} picked={(v) => profile.reaction === v} onPick={(v, l) => set({ reaction: v }, `遇到大跌的习惯设为：${l}`)} />
            <Choice label="一只股票，最多放多少仓位" use="持仓超过上限时主动提醒" options={PCT.map((v) => ({ v, label: `${v}%` }))} picked={(v) => profile.maxWeight === v} onPick={(v) => set({ maxWeight: v }, `单只股票的仓位上限设为 ${v}%`)} />
            <Choice label="这笔钱的目标" use="和上面两项一起，决定你的风险类型（保守、稳健、积极）" options={opts(GOAL_LABEL)} picked={(v) => profile.goal === v} onPick={(v, l) => set({ goal: v }, `投资目标设为：${l}`)} />
            <Choice label="做决定时主要看什么（可多选）" use="异动的等级——你看重的那几类上调，其余略下调" options={opts(FOCUS_LABEL)} picked={(v) => profile.focus.includes(v)}
              onPick={(v: Focus, l) => set({ focus: profile.focus.includes(v) ? profile.focus.filter((x) => x !== v) : [...profile.focus, v] }, `${profile.focus.includes(v) ? '不再' : ''}主要看：${l}`)} />
            <Choice label="投资经验" use="解释的多少——新手会在指标旁多看到一句名词解释" options={opts(EXPERIENCE_LABEL)} picked={(v) => profile.experience === v} onPick={(v, l) => set({ experience: v }, `投资经验设为：${l}`)} />
            <div className="py-3.5 @min-[1000px]:col-span-2">
              <p className="text-sm font-medium text-ink">我的原则 <span className="text-xs font-normal text-steel">最多 3 条</span></p>
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
              <p className="mt-1.5 text-xs text-steel">用在：判断第四步做选择时，摆在旁边给你对照</p>
            </div>
        </div>
      </section>
    </div>
  )
}
