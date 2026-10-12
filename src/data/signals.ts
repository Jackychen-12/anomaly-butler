/**
 * 异动监测信息集（信号库）：每类信号的「内容」。评测部分由 engine.ts 的 evaluateSignal 计算。
 * kind：rule = 由行情按规则自动识别；event = 人工整理的事件；planned = 尚未接入数据。
 */
import type { Market } from './case'

export type SignalGroup = '宏观政策' | '跨市场传导' | '公司事件' | '价量' | '资金'
export type SignalDef = {
  id: string
  group: SignalGroup
  name: string
  /** 一句大白话：这个信号在看什么 */
  define: string
  source: string
  rule: string
  markets: Market[]
  kind: 'rule' | 'event' | 'planned'
  /** 触发后管家是否给出判断 */
  judges: boolean
  /** 规则类信号里用户可以调的那个阈值（对应 engine 的 Rules） */
  param?: 'pct' | 'vol' | 'ma' | 'turnover' | 'streak' | 'low'
}

const ALL: Market[] = ['A', 'HK', 'US']

export const SIGNALS: SignalDef[] = [
  { id: 'tariff', group: '宏观政策', name: '关税与贸易政策', define: '关税加征、豁免、反制等贸易政策变化，影响出口链和跨境业务。', source: '政府公告、行政令、海关指引', rule: '政策涉及的行业或产品与自选股主营业务相关时触发；加征类给出判断，缓解类只提示。', markets: ALL, kind: 'event', judges: true },
  { id: 'export-control', group: '宏观政策', name: '出口管制与产业监管', define: '针对特定产品或行业的出口许可、采购限制、行业监管规则。', source: '政府公告、公司披露文件、权威媒体报道', rule: '管制对象是自选股的主要产品或主要市场时触发；未经官方确认的报道强度下调。', markets: ALL, kind: 'event', judges: true },
  { id: 'market-support', group: '宏观政策', name: '稳市政策', define: '国家队增持、回购增持潮等托底市场的举措。', source: '机构公告、交易所公告', rule: '属于风险缓解信号，只提示、不出判断；出现后暂缓「大跌后续跌」类判断。', markets: ['A', 'HK'], kind: 'event', judges: false },
  { id: 'monetary', group: '宏观政策', name: '货币与利率', define: '降准降息、美联储议息、汇率与国债收益率的大幅变化。', source: '央行公告、议息决议', rule: '尚未接入。', markets: ALL, kind: 'planned', judges: false },
  { id: 'cross-market', group: '跨市场传导', name: '海外龙头隔夜大幅波动', define: '美股产业链龙头大涨大跌，对 A 股、港股对应产业链的映射。', source: '美股收盘与盘后行情', rule: '尚未单独接入，目前只作为宏观事件的证据出现。', markets: ['A', 'HK'], kind: 'planned', judges: false },
  { id: 'placement', group: '公司事件', name: '折价配售与再融资', define: '公司以低于市价的价格配售新股或大额再融资。', source: '交易所公告', rule: '配售折让超过 5% 时触发并给出判断。', markets: ['HK', 'A'], kind: 'event', judges: true },
  { id: 'incident', group: '公司事件', name: '安全事故与舆情', define: '产品安全事故、重大负面舆情。', source: '公司声明、权威媒体报道', rule: '事故涉及公司核心产品且公司已公开回应时触发并给出判断。', markets: ALL, kind: 'event', judges: true },
  { id: 'earnings', group: '公司事件', name: '财报与业绩指引', define: '业绩预告、财报不及预期、指引下调。', source: '公司公告', rule: '尚未接入。', markets: ALL, kind: 'planned', judges: false },
  { id: 'unlock', group: '公司事件', name: '解禁、减持与质押', define: '限售股解禁、大股东减持、高比例质押。', source: '交易所公告', rule: '尚未接入。', markets: ['A', 'HK'], kind: 'planned', judges: false },
  { id: 'price-drop', group: '价量', name: '单日大跌', define: '一天之内跌了很多，可能是坏消息的反应，也可能是恐慌。', source: '日线行情', rule: '单日跌幅达到阈值即触发；跌幅越大强度越高。', markets: ALL, kind: 'rule', judges: true, param: 'pct' },
  { id: 'price-surge', group: '价量', name: '单日大涨', define: '一天之内涨了很多，通常对应利好或超跌反弹。', source: '日线行情', rule: '单日涨幅达到阈值即触发；只提醒。', markets: ALL, kind: 'rule', judges: false, param: 'pct' },
  { id: 'vol-ratio', group: '价量', name: '量比放大', define: '成交量比前几天明显放大，说明买卖突然变多，常出现在消息落地或资金进出时。', source: '日线行情', rule: '量比 = 当天成交量 ÷ 前 5 个交易日平均成交量，达到阈值即触发。', markets: ALL, kind: 'rule', judges: false, param: 'vol' },
  { id: 'ma-break', group: '价量', name: '跌破均线', define: '收盘价从均线上方跌到下方，短期走势转弱的常用信号。', source: '日线行情', rule: '前一日收盘价不低于均线、当日收盘价低于均线时触发。', markets: ALL, kind: 'rule', judges: false, param: 'ma' },
  { id: 'turnover', group: '价量', name: '换手率异常', define: '一天之内换手的股份占比很高，说明筹码在快速易手。', source: '日线行情', rule: '当日换手率达到阈值即触发。', markets: ALL, kind: 'rule', judges: false, param: 'turnover' },
  { id: 'losing-streak', group: '价量', name: '连续下跌', define: '连着好几天收跌，下跌有了惯性。', source: '日线行情', rule: '连续收跌的天数达到阈值即触发；之后每多跌一天强度再升。', markets: ALL, kind: 'rule', judges: false, param: 'streak' },
  { id: 'new-low', group: '价量', name: '创阶段新低', define: '收盘价是最近一段时间里最低的。', source: '日线行情', rule: '当日收盘价不高于近 N 个交易日的全部收盘价时触发。', markets: ALL, kind: 'rule', judges: false, param: 'low' },
  { id: 'margin', group: '资金', name: '融资余额连续下降', define: '借钱买股票的资金在持续撤出。', source: '交易所融资融券数据', rule: '尚未接入。', markets: ['A'], kind: 'planned', judges: false },
  { id: 'flow', group: '资金', name: '北向与南向资金', define: '跨境资金对个股的大额净买卖。', source: '交易所互联互通数据', rule: '尚未接入。', markets: ['A', 'HK'], kind: 'planned', judges: false },
]

export const SIGNAL_GROUPS: SignalGroup[] = ['宏观政策', '跨市场传导', '公司事件', '价量', '资金']
/** 宏观：政策与跨市场；微观：公司自己的事件、行情指标、资金 */
export const SIGNAL_SECTIONS: { name: '宏观' | '微观'; groups: SignalGroup[] }[] = [
  { name: '宏观', groups: ['宏观政策', '跨市场传导'] },
  { name: '微观', groups: ['公司事件', '价量', '资金'] },
]
export const GROUP_LABEL: Record<SignalGroup, string> = { 宏观政策: '宏观政策', 跨市场传导: '跨市场传导', 公司事件: '公司事件', 价量: '行情指标', 资金: '资金' }
/** 一个信号属于宏观还是微观 */
export const scopeOf = (signalId: string): '宏观' | '微观' => (SIGNAL_SECTIONS[0].groups.includes(signalOf(signalId)?.group ?? '价量') ? '宏观' : '微观')
export const signalOf = (id: string) => SIGNALS.find((s) => s.id === id)
