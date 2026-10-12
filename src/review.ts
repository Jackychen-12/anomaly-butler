/** 判断页的逻辑：表态时可选的理由、我的逻辑战绩、同类信号以往记下的经验。 */
import type { Vote } from './data/case'
import { myResult, type Judgment } from './engine'
import type { Lesson, ReviewState } from './store'

/** 这条判断发出之前，同类信号已经记下的经验 */
export const priorLessons = (j: Judgment, lessons: Lesson[]) => lessons.filter((l) => l.signal === j.anomaly.signal && l.jid !== j.id && l.at < j.issued)

/**
 * 表态时可选的理由：把「同意 / 不同意」落到推理的某一环上——事件本身、传导路径、价格是否已经反映、后面会不会缓和。
 * 这几环就是产品想引导用户养成的思考顺序。
 */
export const REASONS: Record<'agree' | 'disagree', { key: string; label: string }[]> = {
  agree: [{ key: 'event', label: '事情影响确实大' }, { key: 'path', label: '传导到它很直接' }, { key: 'notpriced', label: '价格还没反映' }],
  disagree: [{ key: 'event', label: '事情本身没那么大' }, { key: 'path', label: '传不到这只股票' }, { key: 'priced', label: '价格里已经有了' }, { key: 'relief', label: '后面会反转或有对冲' }],
}
export const reasonLabel = (vote: Vote | undefined, key: string | undefined) => (vote && vote !== 'watch' ? REASONS[vote].find((r) => r.key === key)?.label : undefined)

/** 我用过的每种理由：用了几次，其中几次看对了（只算已有结果的判断） */
export function reasonStats(js: Judgment[], votes: Record<string, Vote>, reasons: Record<string, string>): { label: string; used: number; right: number }[] {
  const map = new Map<string, { label: string; used: number; right: number }>()
  for (const j of js) {
    const r = myResult(j, votes[j.id]), label = reasonLabel(votes[j.id], reasons[j.id])
    if (r == null || !label) continue
    const row = map.get(label) ?? { label, used: 0, right: 0 }
    row.used++; if (r) row.right++
    map.set(label, row)
  }
  return [...map.values()].sort((a, b) => b.used - a.used)
}

/** 已有结果但还没复盘的判断 */
export const unreviewed = (js: Judgment[], state: Record<string, ReviewState>) => js.filter((j) => j.status !== 'pending' && !state[j.id])
