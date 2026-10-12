/** 复盘：每条判断到期对答案，说对说错都写原因。这是管家改进的依据。 */
import type { ReactNode } from 'react'
import { judgmentsAt, reviewBySignal, score, type Judgment } from '../engine'
import { Dot } from '../kit'
import { JudgmentCard } from '../parts'
import { useStore } from '../store'

export function ReviewPage() {
  const { tick, votes, openStock, setPage } = useStore()
  const js = judgmentsAt(tick)
  const sc = score(js, votes)
  const fresh = js.filter((j) => j.status === 'pending' && j.issued === tick)
  const pending = js.filter((j) => j.status === 'pending' && j.issued !== tick)
  const settled = js.filter((j) => j.status !== 'pending').sort((a, b) => (a.settledOn! < b.settledOn! ? 1 : -1))
  const bySignal = reviewBySignal(tick)
  const open = (j: Judgment) => openStock(j.code)

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-5 lg:px-6">
      <h1 className="text-[22px] font-semibold tracking-tight">复盘</h1>
      <p className="mt-0.5 text-sm text-steel">管家的每条判断都事先写明「跌破哪个价算说对」，到期按真实收盘价对答案。说对说错都留在这里，并写下原因。</p>

      <div className="mt-4 grid overflow-hidden rounded-lg border border-hairline sm:grid-cols-3">
        <Metric label={`管家 · 已有结果 ${sc.butler.hit + sc.butler.miss + sc.butler.void} 条`}>
          {sc.butler.hit}<small>说对</small>{sc.butler.miss}<small>说错</small>{sc.butler.void}<small>作废</small>
        </Metric>
        <Metric label={`我 · 表过态且已有结果 ${sc.me.right + sc.me.wrong} 条`}>
          {sc.me.right}<small>看对</small>{sc.me.wrong}<small>看错</small>
        </Metric>
        <Metric label="我不同意管家的时候，谁对">
          <span className="text-lg">管家</span> {sc.split.butler}<small>：</small><span className="text-lg">我</span> {sc.split.me}
        </Metric>
      </div>

      {bySignal.length ? (
        <section className="mt-5">
          <h2 className="mb-2 text-[13px] font-medium">哪类信号准，哪类不准</h2>
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead><tr className="text-left text-xs text-steel [&>th]:border-b [&>th]:border-hairline [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium [&>th]:whitespace-nowrap"><th>信号</th><th className="text-right">说对</th><th className="text-right">说错</th><th className="text-right">作废</th><th>占比</th></tr></thead>
              <tbody className="[&>tr:last-child>td]:border-b-0 [&_td]:border-b [&_td]:border-hairline-soft [&_td]:px-3 [&_td]:py-2">
                {bySignal.map((r) => {
                  const n = r.hit + r.miss
                  return (
                    <tr key={r.def.id}>
                      <td><button type="button" onClick={() => setPage('signals')} className="font-medium hover:underline">{r.def.name}</button></td>
                      <td className="text-right tabular-nums">{r.hit}</td><td className="text-right tabular-nums">{r.miss}</td><td className="text-right tabular-nums text-steel">{r.void}</td>
                      <td className="w-[36%]"><span className="flex h-2 overflow-hidden rounded-full bg-hairline" aria-label={n ? `说对 ${r.hit} 条，说错 ${r.miss} 条` : '没有可计入的结果'}>{n ? <span className="bg-up" style={{ width: `${(r.hit / n) * 100}%` }} /> : null}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-xs text-steel">样本很少，只能看出倾向。每类信号的定义和历史回测在信号库里。</p>
        </section>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Lane tone="red" title="今天新发出的判断" list={fresh} empty="今天没有新发出的判断。" onOpen={open} />
        <Lane tone="purple" title="在等结果" list={pending} empty="没有在等结果的判断。" onOpen={open} />
        <Lane tone="gray" title="已有结果（附复盘）" list={settled} empty="还没有到期的判断。点上方的「下一天」往后看。" onOpen={open} compact />
      </div>
    </div>
  )
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-hairline px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums [&>small]:mx-1.5 [&>small]:text-[13px] [&>small]:font-normal [&>small]:text-steel">{children}</p>
    </div>
  )
}

function Lane({ tone, title, list, empty, onOpen, compact }: { tone: 'red' | 'purple' | 'gray'; title: string; list: Judgment[]; empty: string; onOpen: (j: Judgment) => void; compact?: boolean }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-medium"><Dot tone={tone} />{title}<span className="font-normal text-stone">{list.length}</span></h2>
      <div className="flex flex-col gap-2.5">
        {list.map((j) => <JudgmentCard key={j.id} j={j} compact={compact} onOpen={() => onOpen(j)} />)}
        {list.length === 0 ? <p className="rounded-lg bg-surface-soft px-4 py-5 text-[13px] text-steel">{empty}</p> : null}
      </div>
    </section>
  )
}
