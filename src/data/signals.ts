/**
 * 信号库：异动监测信息集的 38 项指标。内容来自《异动监测指标设计与分级规则》（经 scripts/import_indicators.py 导入成 indicators.json），
 * 这里补上每项在演示里的接入状态：live = 用真实日线计算；event = 有人工整理的事件对应；need = 缺数据，暂不计算。
 * 每项有三档提醒门槛（稳健 / 平衡 / 进取）和一套不随偏好变的固定等级（S1–S3）。
 */
import raw from './indicators.json'
import infoset from './infoset.json'
import type { Market } from './case'

export type Tier = 'steady' | 'balanced' | 'aggressive'
export const TIER_LABEL: Record<Tier, string> = { steady: '稳健型', balanced: '平衡型', aggressive: '进取型' }
export const TIER_HINT: Record<Tier, string> = { steady: '更早提醒', balanced: '默认', aggressive: '容忍波动' }

type Spec = { id: string; layer: string; name: string; steady: string; balanced: string; aggressive: string; levels: string; impact: string; example: string; exclude: string; inputs: string; formula: string; window: string; source: string; boundary: string }
export type SignalGroup = '宏观政策' | '行业' | '价量' | '公司事件' | '质量' | '用户'
export type SignalDef = {
  id: string
  group: SignalGroup
  name: string
  /** 定义：它是什么。和提交的《异动监测信息集》「指标一览」同一句话 */
  intro: string
  /** 怎么衡量、异动标准（平衡档）：同样取自信息集 */
  measure: string
  standard: string
  /** 可能的影响（不是涨跌预测） */
  define: string
  source: string
  /** 平衡型的提醒门槛 */
  rule: string
  markets: Market[]
  /** rule = 用日线计算；event = 人工整理的事件；planned = 缺数据，暂不计算 */
  kind: 'rule' | 'event' | 'planned'
  /** 触发后管家是否给出判断 */
  judges: boolean
  /** 评测时看哪个方向的延续。both = 跟当天的涨跌方向 */
  dir?: 'down' | 'up' | 'both'
  /** 缺什么数据（kind 为 planned 时） */
  need?: string
  /** 表里的完整内容 */
  spec: Spec
}

const GROUP: Record<string, SignalGroup> = { P: '价量', M: '宏观政策', I: '行业', C: '公司事件', Q: '质量', U: '用户' }
/** 用日线能算的 */
const LIVE: Record<string, 'down' | 'both'> = { P02: 'both', P05: 'down', P06: 'down', P10: 'both', P11: 'both' }
/** 有人工整理的事件对应的 */
const EVENT = ['M03', 'C07', 'C08']
const NEED: [RegExp, string][] = [
  [/^P0[1]$|^P12$/, '需要分钟或逐笔行情'], [/^P04$/, '需要盘口数据'], [/^P07$/, '需要交易所规则与状态'], [/^P08$/, '需要两地同步行情和汇率'],
  [/^P09$/, '需要换手率（流通股本）数据'], [/^P03$|^I01$/, '需要行业指数'], [/^M/, '需要宏观数据和发布前的预期'], [/^I/, '需要行业和上下游数据'],
  [/^C/, '需要公告和财报'], [/^Q/, '数据质量门槛：接入多个数据源后启用'], [/^U01$/, '已用于持仓上限提醒，见投资画像'], [/^U02$/, '在本页逐项选择提醒档位，就是你的个人阈值'],
]

/** 每项指标的大白话介绍：它在看什么、为什么值得留意。表里的术语太专业，这里重写一遍 */
const INTRO: Record<string, string> = {
  P01: '看股价在几分钟、几十分钟里有没有突然急涨急跌。短时间走得太急，通常是有消息或有大单。',
  P02: '量比 = 今天的成交量 ÷ 过去 20 天同一时段的平常水平。到 2 就是比平时多一倍的人在买卖，说明有事发生，方向要结合涨跌看。',
  P03: '拿这只股票和它所在的行业比。行业没怎么动、它自己跌得多，问题多半出在公司自己身上。',
  P04: '看买卖报价之间的差距和挂单的多少。差距变大、挂单变少，想卖的时候就更难卖到好价钱。',
  P05: '回撤 = 从最近的高点跌下来多少。跌得深、每天波动又在变大，说明这只股票最近不稳。',
  P06: '均线是最近若干天的平均价（MA20 就是 20 天）。跌到均线下面，说明最近买的人整体在亏，走势转弱。',
  P07: '涨停、跌停、熔断、临时停牌这类交易规则被触发。这时候可能买不进、卖不出。',
  P08: '同一家公司在两个市场上市（比如 A 股和港股），两边价格差得太多时提醒。',
  P09: '换手率 = 今天成交的股数占能流通股数的比例。换手突然变高，说明很多人在换手，看法分歧变大。',
  P10: '把涨跌和成交量放在一起看。放量下跌是很多人在卖；放量上涨是很多人在买；量没跟上的涨跌，分量要打折。',
  P11: '跳空 = 今天一开盘就比昨天收盘高出或低出一截，通常是隔夜出了消息。ATR 是它平时一天的波动幅度，用来判断这一跳算不算大。',
  P12: 'VWAP 是今天所有成交的平均价。现价明显低于它，说明今天买进的人多数已经在亏，短时间内卖的人更多。',
  M01: '央行加息降息、调整放出来的钱。利率变了，公司借钱的成本和股票的估值都会跟着变。',
  M02: '物价、就业、经济增长这些数据公布时，和市场原先预期差得多不多。差得多，市场会重新估计利率和需求。',
  M03: '关税、出口管制、行业监管、补贴这类政策。它直接改变公司能卖给谁、成本多少、能不能继续做这门生意。',
  M04: '汇率大幅变动。有海外收入、进口原料或外币债务的公司，利润会被汇率带着走。',
  M05: '原油、金属、粮食等大宗商品价格大涨大跌，或者供应链断了。上游和下游公司受到的影响常常相反。',
  M06: '整个市场一起恐慌、资金变紧的时候。这时个股下跌多半不是公司自己出了问题。',
  I01: '看一个行业整体比大盘强还是弱。行业整体走弱时，里面的股票多数会被拖累。',
  I02: '行业的销量、订单、库存、价格这些经营数据在变好还是变差，会影响下一期的业绩。',
  I03: '你的自选股的大客户或供应商出了事（比如苹果大跌），会沿着产业链传过来。',
  I04: '同行出了大事（被查、产品出问题、丢了大订单），市场会担心同行业的其他公司也有类似问题。',
  C01: '公司公布的业绩或对未来的预期，比市场原先想的好还是差。',
  C02: '账面上赚了钱，但现金有没有真的收回来。利润高而现金少，要小心。',
  C03: '公司欠的债多不多、近期要还多少、还不还得上。',
  C04: '审计师不肯签字、换审计师，或者公司更正以前的财报。这说明以前的数字可能靠不住。',
  C05: '公司被监管调查、被处罚，或者卷进大的官司。',
  C06: '大股东减持、股份质押、高管离职。可能带来卖压，也可能说明内部人对公司的看法变了。',
  C07: '公司增发新股、配售（会摊薄每股的价值），或者回购股票（相反）。',
  C08: '事故、停产、产品召回、丢掉大客户这类直接影响经营的大事。',
  C09: '停牌、被标记风险警示、可能退市。最坏的情况是想卖也卖不掉。',
  C10: '拆股、分红除权会让股价在图上「跌」一截，但其实不是真的跌。这一项用来避免误报。',
  Q01: '一条消息是谁说的、有没有别的独立来源能证实。传闻和转载不能当成多份证据。',
  Q02: '数据是不是最新的。数据断了或者延迟了，要告诉你，而不是装作没事。',
  Q03: '同一件事被很多媒体重复报道时只提醒一次；但事情有了新进展（恶化、澄清）要再提醒。',
  Q04: '不同来源的数字对不上（单位、口径、修订前后）时，先核对再用。',
  U01: '你的仓位是不是太集中在一只股票或一个主题上。',
  U02: '你当初买入的理由还在不在，以及你自己设的提醒门槛。',
}

/** 提交的《异动监测信息集》里每项的定义、衡量方式和平衡档标准（src/data/infoset.json 由那份 Excel 的「指标一览」导出），平台上显示的就是这几句 */
const INFO = infoset as Record<string, { define: string; measure: string; standard: string; status: string }>

export const SIGNALS: SignalDef[] = (raw as { indicators: Spec[] }).indicators.map((s) => {
  const live = LIVE[s.id], event = EVENT.includes(s.id) || s.id === 'I03'
  return {
    id: s.id, group: GROUP[s.id[0]], name: s.name, intro: INFO[s.id]?.define ?? INTRO[s.id] ?? s.impact, measure: INFO[s.id]?.measure ?? s.formula, standard: INFO[s.id]?.standard ?? s.balanced, define: s.impact, source: s.source, rule: s.balanced, markets: ['A', 'HK', 'US'],
    kind: live ? 'rule' : event ? 'event' : 'planned',
    judges: s.id === 'P10' || EVENT.includes(s.id),
    dir: live ?? (s.id === 'I03' ? 'both' : undefined),
    need: live || event ? undefined : NEED.find(([re]) => re.test(s.id))?.[1],
    spec: s,
  }
})
/** I03（客户与供应商传导）用美股龙头隔夜涨跌按规则识别，评测走规则那一路 */
SIGNALS.find((s) => s.id === 'I03')!.kind = 'rule'

export const POLICIES = (raw as { policies: { id: string; name: string; content: string; path: string; trigger: string; example: string }[] }).policies
export const RULE_NOTES = (raw as { rules: { topic: string; item: string; rule: string; boundary: string }[] }).rules

export const SIGNAL_GROUPS: SignalGroup[] = ['宏观政策', '行业', '价量', '公司事件', '质量', '用户']
export const SIGNAL_SECTIONS: { name: string; groups: SignalGroup[] }[] = [
  { name: '宏观', groups: ['宏观政策', '行业'] },
  { name: '微观', groups: ['价量', '公司事件'] },
  { name: '门槛与个人', groups: ['质量', '用户'] },
]
export const GROUP_LABEL: Record<SignalGroup, string> = { 宏观政策: '宏观风险', 行业: '中观 · 行业', 价量: '量价交易', 公司事件: '公司基本面', 质量: '信息质量门槛', 用户: '用户与记忆' }
export const signalOf = (id: string) => SIGNALS.find((s) => s.id === id)
/** 一个信号属于宏观还是微观 */
export const scopeOf = (signalId: string): '宏观' | '微观' => (SIGNAL_SECTIONS[0].groups.includes(signalOf(signalId)?.group ?? '价量') ? '宏观' : '微观')
