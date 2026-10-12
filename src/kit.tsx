/** 通用组件：按钮、标签、圆点、印章、等级。沿用 WealthPilot 的 Notion 规范。 */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Level, Status } from './engine'

export const cn = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

const BTN = {
  primary: 'bg-primary text-white hover:bg-primary-pressed',
  dark: 'bg-ink text-canvas hover:opacity-85',
  secondary: 'border border-hairline-strong bg-canvas text-ink hover:bg-surface',
  ghost: 'text-slate hover:bg-hover hover:text-ink',
} as const
const BTN_SIZE = { xs: 'h-7 px-2.5 text-[13px] rounded-sm', sm: 'h-8 px-3 text-sm rounded-md', md: 'h-9 px-4 text-sm rounded-md' } as const
export function Button({ variant = 'secondary', size = 'sm', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN; size?: keyof typeof BTN_SIZE }) {
  return <button type="button" className={cn('inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors disabled:opacity-40', BTN[variant], BTN_SIZE[size], className)} {...rest} />
}

const TAG = {
  gray: 'bg-tint-gray text-on-gray', purple: 'bg-tint-lavender text-on-lavender', orange: 'bg-tint-peach text-on-peach',
  green: 'bg-tint-mint text-on-mint', blue: 'bg-tint-sky text-on-sky', pink: 'bg-tint-rose text-on-rose', yellow: 'bg-tint-yellow text-on-yellow',
} as const
export type Tone = keyof typeof TAG
export function Tag({ tone = 'gray', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium leading-5', TAG[tone], className)}>{children}</span>
}

const DOT = { red: 'bg-up', orange: 'bg-warning', purple: 'bg-primary', gray: 'bg-stone', green: 'bg-down' } as const
export const Dot = ({ tone = 'gray' }: { tone?: keyof typeof DOT }) => <span aria-hidden="true" className={cn('inline-block h-2 w-2 shrink-0 rounded-full', DOT[tone])} />

const LEVEL_TONE: Record<Level, Tone> = { 高: 'pink', 中: 'orange', 低: 'gray' }
const LEVEL_DOT: Record<Level, keyof typeof DOT> = { 高: 'red', 中: 'orange', 低: 'gray' }
export const LevelTag = ({ level }: { level: Level }) => <Tag tone={LEVEL_TONE[level]}><Dot tone={LEVEL_DOT[level]} />{level}</Tag>
export const LevelDot = ({ level }: { level: Level }) => <Dot tone={LEVEL_DOT[level]} />

const STAMP: Record<Exclude<Status, 'pending'>, { label: string; cls: string }> = {
  hit: { label: '命中', cls: 'border-up text-up' },
  miss: { label: '未中', cls: 'border-stone text-steel' },
  void: { label: '作废', cls: 'border-dashed border-hairline-strong text-stone' },
}
export const Stamp = ({ status }: { status: Exclude<Status, 'pending'> }) => <span className={cn('stamp', STAMP[status].cls)}>{STAMP[status].label}</span>

/** 涨跌幅色块：A 股习惯红涨绿跌 */
export function PctPill({ v }: { v: number }) {
  return <span className={cn('inline-block min-w-[64px] rounded-xs px-1.5 py-0.5 text-center text-[13px] font-medium tabular-nums text-white', v > 0 ? 'bg-up' : v < 0 ? 'bg-down' : 'bg-stone')}>{v > 0 ? '+' : v < 0 ? '−' : ''}{Math.abs(v).toFixed(2)}%</span>
}
