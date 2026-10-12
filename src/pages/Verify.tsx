/** 验证页：每条判断到期盖章，并排对照管家和我的战绩。PC 是三列看板，手机上下排列。 */
import type { ReactNode } from 'react'
import { judgmentsAt, score, type Judgment } from '../engine'
import { Dot } from '../kit'
import { JudgmentCard } from '../parts'
import { useStore } from '../store'

export function VerifyPage() {
  const { tick, votes, setCode, setPage } = useStore()
  const js = judgmentsAt(tick)
  const sc = score(js, votes)
  const fresh = js.filter((j) => j.status === 'pending' && j.issued === tick)
  const pending = js.filter((j) => j.status === 'pending' && j.issued !== tick)
  const settled = js.filter((j) => j.status !== 'pending').sort((a, b) => (a.settledOn! < b.settledOn! ? 1 : -1))
  const open = (j: Judgment) => { setCode(j.code); setPage('watch') }

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-5 lg:px-6">
      <h1 className="text-[22px] font-semibold tracking-tight">判断与验证</h1>
      <p className="mt-0.5 text-sm text-steel">每条判断事前写明触发线和失效条件，到期按真实收盘价结算。命中和未中都留在这里。</p>

      <div className="mt-4 grid overflow-hidden rounded-lg border border-hairline sm:grid-cols-3">
        <Metric label={`管家 · 已结算 ${sc.butler.hit + sc.butler.miss + sc.butler.void} 条`}>
          {sc.butler.hit}<small>命中</small>{sc.butler.miss}<small>未中</small>{sc.butler.void}<small>作废</small>
        </Metric>
        <Metric label={`我 · 表态并已结算 ${sc.me.right + sc.me.wrong} 条`}>
          {sc.me.right}<small>判断对</small>{sc.me.wrong}<small>判断错</small>
        </Metric>
        <Metric label="我不认同管家时，谁对">
          <span className="text-lg">管家</span> {sc.split.butler}<small>：</small><span className="text-lg">我</span> {sc.split.me}
        </Metric>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Lane tone="red" title="新判断" list={fresh} empty="这一刻没有新发出的判断。" onOpen={open} />
        <Lane tone="purple" title="待验证" list={pending} empty="没有等待结算的判断。" onOpen={open} />
        <Lane tone="gray" title="已结算" list={settled} empty="还没有结算的判断。往后拖动时间机器。" onOpen={open} compact />
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
