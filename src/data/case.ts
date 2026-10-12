/**
 * 演示数据：2025 年 4 月关税冲击前后。
 * 行情是真实日线（见 prices.json）；宏观与公司事件为人工整理的真实事件；
 * 持仓与「我的表态」是演示用的模拟数据。
 */
export type Market = 'A' | 'HK' | 'US'
export type Stock = { code: string; name: string; symbol: string; market: Market; sector: string }

export const STOCKS: Stock[] = [
  { code: '002475', name: '立讯精密', symbol: '002475.SZ', market: 'A', sector: '消费电子' },
  { code: '600519', name: '贵州茅台', symbol: '600519.SH', market: 'A', sector: '白酒' },
  { code: '300750', name: '宁德时代', symbol: '300750.SZ', market: 'A', sector: '新能源' },
  { code: '00700', name: '腾讯控股', symbol: '00700.HK', market: 'HK', sector: '互联网' },
  { code: '01810', name: '小米集团-W', symbol: '01810.HK', market: 'HK', sector: '消费电子' },
  { code: 'AAPL', name: '苹果', symbol: 'AAPL.US', market: 'US', sector: '消费电子' },
  { code: 'NVDA', name: '英伟达', symbol: 'NVDA.US', market: 'US', sector: '半导体' },
  { code: 'PDD', name: '拼多多', symbol: 'PDD.US', market: 'US', sector: '互联网' },
]
/** 「模拟券商导入」载入的演示持仓（占比）。没列出的股票只在自选里、没有持仓。 */
export const DEMO_HOLDINGS: Record<string, number> = { '002475': 0.18, '600519': 0.22, '300750': 0.15, '00700': 0.12, AAPL: 0.1, NVDA: 0.08 }
/** 自选股所属的板块，按首页图表的显示顺序 */
export const SECTORS = ['消费电子', '半导体', '互联网', '新能源', '白酒']
export const MARKET_LABEL: Record<Market, string> = { A: 'A股', HK: '港股', US: '美股' }

/** 演示数据覆盖的交易日。产品只展示其中一天（见 TODAY）早上开盘前的状态，只用这一刻之前的行情与事件。 */
export const TICKS = [
  '2025-03-31', '2025-04-01', '2025-04-02', '2025-04-03', '2025-04-07', '2025-04-08', '2025-04-09',
  '2025-04-10', '2025-04-11', '2025-04-14', '2025-04-15', '2025-04-16', '2025-04-17',
]
/**
 * 演示里的「今天」。选这一天是因为它同时有新事件、在等结果的判断和已有结果的复盘。
 * 汇报时要换一天验证，可在网址后加 ?date=2025-04-03 这样的参数（须是 TICKS 里的日期）。
 */
export const TODAY = '2025-04-09'

export type Category = '宏观政策' | '跨市场传导' | '公司事件' | '价量'
export type JudgmentDef = {
  id: string
  code: string
  /** 收盘价较基准价下跌超过多少（负数，百分比） */
  thr: number
  /** 观察窗口：多少个交易日 */
  n: number
  /** 事前写明的失效条件 */
  invalid: string
  /** 失效条件实际触发的时间与说明 */
  voidOn?: { tick: string; text: string }
}
export type EventDef = {
  id: string
  /** 属于信号库里的哪一类信号 */
  signal: string
  /** 从哪一格开始可见 */
  tick: string
  /** 事件发生时间的说明 */
  when: string
  cat: Category
  title: string
  /** 信号强度 0–100 */
  strength: number
  /** relief = 风险缓解类，不出判断 */
  tone: 'risk' | 'relief'
  hits: string[]
  chain: { label: string; text: string }[]
  evidence: { label: string; text: string; source: string }[]
  judgments: JudgmentDef[]
}

const TARIFF_INVALID = '美方将智能手机、电脑等消费电子列入关税豁免'

export const EVENTS: EventDef[] = [
  {
    id: 'xm-place', signal: 'placement', tick: '2025-03-25', when: '3月25日 盘前', cat: '公司事件', tone: 'risk', strength: 62,
    title: '小米集团配售 8 亿股，每股 53.25 港元',
    hits: ['01810'],
    chain: [
      { label: '事件', text: '公司公告以先旧后新方式配售 8 亿股，配售价较前一日收盘价折让约 6.6%' },
      { label: '影响', text: '折价配售通常在短期内压制股价，并摊薄现有股东权益' },
    ],
    evidence: [{ label: '公告摘要', text: '配售 8 亿股 B 类股份，每股 53.25 港元，募资净额用于业务扩张、研发投资及一般公司用途。', source: '港交所公告 · 3月25日' }],
    judgments: [{ id: 'j-xm-place', code: '01810', thr: -8, n: 5, invalid: '配售取消或大股东同步增持' }],
  },
  {
    id: 'nv-energy', signal: 'export-control', tick: '2025-03-27', when: '3月26日', cat: '宏观政策', tone: 'risk', strength: 55,
    title: '媒体报道：中国拟出台的能效规则或限制英伟达 H20 在华销售',
    hits: ['NVDA'],
    chain: [
      { label: '政策', text: '报道称监管部门建议数据中心采购符合新能效标准的芯片，H20 未达标' },
      { label: '行业', text: '英伟达对华特供芯片收入面临不确定性' },
      { label: '自选', text: '英伟达' },
    ],
    evidence: [{ label: '报道摘要', text: '相关能效规则若严格执行，英伟达在中国市场销量最大的 H20 芯片可能被排除在采购范围之外。', source: '英国《金融时报》· 3月26日' }],
    judgments: [{ id: 'j-nv-energy', code: 'NVDA', thr: -8, n: 5, invalid: '监管部门澄清规则不针对特定产品' }],
  },
  {
    id: 'xm-su7', signal: 'incident', tick: '2025-04-01', when: '3月29日 事故，4月1日 公司回应', cat: '公司事件', tone: 'risk', strength: 66,
    title: '小米 SU7 高速事故引发关注，公司回应将配合调查',
    hits: ['01810'],
    chain: [
      { label: '事件', text: '3月29日一辆小米 SU7 在高速公路发生碰撞事故，造成人员伤亡' },
      { label: '影响', text: '智能驾驶宣传与安全性受到舆论质疑，汽车业务估值预期承压' },
    ],
    evidence: [{ label: '公司说明', text: '事故发生前车辆处于智能辅助驾驶状态，公司已成立专项小组并配合警方调查。', source: '小米公司发言人 · 4月1日' }],
    judgments: [{ id: 'j-xm-su7', code: '01810', thr: -8, n: 5, invalid: '调查结论排除车辆责任' }],
  },
  {
    id: 'tariff', signal: 'tariff', tick: '2025-04-03', when: '4月3日 04:00（北京时间）', cat: '宏观政策', tone: 'risk', strength: 92,
    title: '美国宣布「对等关税」，对华加征 34%',
    hits: ['002475', 'AAPL', 'PDD'],
    chain: [
      { label: '政策', text: '4月2日（美东）签署行政令：10% 基准关税 4月5日生效，对华 34% 对等关税 4月9日生效' },
      { label: '行业', text: '消费电子代工、跨境电商直接承压；同日宣布 5月2日起取消中国小额包裹免税' },
      { label: '自选', text: '立讯精密 · 苹果 · 拼多多' },
    ],
    evidence: [
      { label: '政策原文', text: '对所有进口商品征收 10% 基准关税，对贸易逆差较大的经济体征收更高的对等关税，其中中国为 34%。', source: '白宫行政令 · 4月2日' },
      { label: '盘后反应', text: '苹果在美股盘后交易中一度下跌约 7%。', source: '美股盘后报价（约数）' },
    ],
    judgments: [
      { id: 'j-lx-tariff', code: '002475', thr: -10, n: 5, invalid: TARIFF_INVALID },
      { id: 'j-aapl-tariff', code: 'AAPL', thr: -8, n: 5, invalid: TARIFF_INVALID },
      { id: 'j-pdd-tariff', code: 'PDD', thr: -8, n: 5, invalid: '小额包裹免税政策恢复' },
    ],
  },
  {
    id: 'retaliate', signal: 'tariff', tick: '2025-04-07', when: '4月4日 傍晚', cat: '宏观政策', tone: 'risk', strength: 88,
    title: '中国宣布对美全部进口商品加征 34% 关税',
    hits: ['00700', '300750', '01810'],
    chain: [
      { label: '政策', text: '4月10日起对原产于美国的所有进口商品加征 34% 关税，并对部分中重稀土实施出口管制' },
      { label: '市场', text: '清明假期期间美股连续两日大跌，A股与港股开市后面临集中补跌' },
      { label: '自选', text: '腾讯控股 · 宁德时代 · 小米集团' },
    ],
    evidence: [
      { label: '公告摘要', text: '自 2025年4月10日 12时01分起，对原产于美国的所有进口商品，在现行适用关税税率基础上加征 34% 关税。', source: '国务院关税税则委员会 · 4月4日' },
      { label: '跨市场', text: '4月3日至4日两个交易日，苹果累计下跌 16.0%，英伟达累计下跌 14.7%。', source: '美股收盘行情' },
    ],
    judgments: [{ id: 'j-tx-retaliate', code: '00700', thr: -8, n: 5, invalid: '中美宣布重启谈判并暂缓加征' }],
  },
  {
    id: 'huijin', signal: 'market-support', tick: '2025-04-08', when: '4月7日 盘中', cat: '宏观政策', tone: 'relief', strength: 38,
    title: '中央汇金公告增持 ETF，多家央企宣布增持回购',
    hits: ['600519', '300750', '002475'],
    chain: [
      { label: '政策', text: '中央汇金表示坚定看好中国资本市场，已再次增持交易型开放式指数基金' },
      { label: '影响', text: '对指数权重股形成托底，不改变出口链个股面临的关税压力' },
    ],
    evidence: [{ label: '公告摘要', text: '已再次增持交易型开放式指数基金（ETF），未来将继续增持，坚决维护资本市场平稳运行。', source: '中央汇金公告 · 4月7日' }],
    judgments: [],
  },
  {
    id: 'tariff-104', signal: 'tariff', tick: '2025-04-09', when: '4月8日（美东）', cat: '宏观政策', tone: 'risk', strength: 84,
    title: '美国对华关税叠加至 104%，4月9日生效',
    hits: ['NVDA', 'AAPL', 'PDD', '002475'],
    chain: [
      { label: '政策', text: '美方在原有基础上再加征 50%，对华累计税率升至 104%' },
      { label: '行业', text: '半导体与硬件供应链成本上升，对华收入与在华制造同时承压' },
      { label: '自选', text: '英伟达 · 苹果 · 拼多多 · 立讯精密' },
    ],
    evidence: [{ label: '官方表态', text: '白宫确认对中国商品加征的 104% 关税于 4月9日零时生效。', source: '白宫新闻发布会 · 4月8日' }],
    judgments: [{
      id: 'j-nv-104', code: 'NVDA', thr: -8, n: 5, invalid: '美方宣布暂缓或下调对等关税',
      voidOn: { tick: '2025-04-10', text: '4月9日美方宣布对多数经济体暂缓对等关税 90 天，失效条件触发' },
    }],
  },
  {
    id: 'pause', signal: 'tariff', tick: '2025-04-10', when: '4月9日（美东）午后', cat: '宏观政策', tone: 'relief', strength: 60,
    title: '美国对多数经济体暂缓对等关税 90 天，对华升至 125%',
    hits: ['NVDA', 'AAPL', '002475', 'PDD'],
    chain: [
      { label: '政策', text: '除中国外的多数经济体对等关税暂缓 90 天，期间适用 10% 基准税率' },
      { label: '影响', text: '全球风险偏好快速修复；对华税率不降反升，出口链个股压力仍在' },
    ],
    evidence: [{ label: '跨市场', text: '消息公布当日，英伟达上涨 18.8%，苹果上涨 15.5%。', source: '美股收盘行情 · 4月9日' }],
    judgments: [],
  },
  {
    id: 'exempt', signal: 'tariff', tick: '2025-04-14', when: '4月11日（美东）深夜', cat: '宏观政策', tone: 'relief', strength: 58,
    title: '美国豁免智能手机、电脑等产品的对等关税',
    hits: ['002475', 'AAPL', '01810'],
    chain: [
      { label: '政策', text: '海关指引将智能手机、电脑、半导体设备等列入对等关税豁免范围' },
      { label: '影响', text: '果链代工与品牌厂商压力缓解。4月3日关税判断写明的失效条件在此时出现，但已晚于结算' },
    ],
    evidence: [{ label: '指引摘要', text: '智能手机、笔记本电脑、存储芯片等产品不适用对等关税。', source: '美国海关与边境保护局指引 · 4月11日' }],
    judgments: [],
  },
  {
    id: 'nv-h20', signal: 'export-control', tick: '2025-04-16', when: '4月15日（美东）盘后', cat: '公司事件', tone: 'risk', strength: 78,
    title: '英伟达披露 H20 对华出口需许可，预计计提约 55 亿美元',
    hits: ['NVDA'],
    chain: [
      { label: '政策', text: '美国政府通知英伟达，H20 芯片出口中国需获得许可，且要求无限期有效' },
      { label: '公司', text: '一季度预计计提与 H20 库存、采购承诺相关的费用约 55 亿美元' },
      { label: '自选', text: '英伟达' },
    ],
    evidence: [{ label: '公告摘要', text: '公司预计第一财季业绩将包含与 H20 产品相关的最高约 55 亿美元费用。', source: '英伟达 8-K 文件 · 4月15日' }],
    judgments: [{ id: 'j-nv-h20', code: 'NVDA', thr: -8, n: 5, invalid: '出口许可获批或管制范围收窄' }],
  },
]

/** 由价量规则自动识别出的异动里，这几条管家额外给出了判断（大跌之后是否续跌）。key = 代码|日期 */
export const AUTO_JUDGMENTS: Record<string, Omit<JudgmentDef, 'code'>> = {
  '300750|2025-04-07': { id: 'j-catl-drop', thr: -5, n: 5, invalid: '公司公告大额回购' },
  '01810|2025-04-07': { id: 'j-xm-drop', thr: -8, n: 5, invalid: '公司公告大额回购' },
}

export type Vote = 'agree' | 'disagree' | 'watch'
/** 演示用的「我的表态」，可以在界面里改。 */
export const SEED_VOTES: Record<string, Vote> = { 'j-xm-place': 'disagree', 'j-nv-energy': 'disagree', 'j-xm-su7': 'agree' }

/**
 * 事后复盘：判断结算之后，为什么对或错、当时漏看了什么、对信号规则有什么启示。
 * expect 是写这段文字时对应的结算结果；与按真实行情算出的结果不一致时不展示。
 */
export type Review = { expect: 'hit' | 'miss' | 'void'; why: string; missed: string; lesson: string }
export const REVIEWS: Record<string, Review> = {
  'j-xm-place': { expect: 'hit', why: '折价配售叠加前期涨幅较大，获利盘集中兑现，窗口内跌破了触发价。', missed: '判断只依据配售折价，没有考虑当时股价处在阶段高位这一放大因素。', lesson: '折价配售信号可以加入「前 20 日涨幅」作为强度修正。' },
  'j-nv-energy': { expect: 'miss', why: '报道没有得到官方确认，市场当日消化后没有继续下跌。', missed: '把单一媒体报道当成了政策落地。', lesson: '未经官方确认的报道，强度应下调一档，或只做记录、不出判断。' },
  'j-xm-su7': { expect: 'hit', why: '事故舆情持续发酵，股价很快跌破触发价。', missed: '同期大盘走弱也贡献了一部分跌幅，判断没有剔除市场因素。', lesson: '事故舆情类信号应改用相对板块的超额跌幅来结算。' },
  'j-lx-tariff': { expect: 'hit', why: '关税直接打击对美出口链，消息后第一个交易日即跌停。', missed: '命中之后股价继续大幅下跌，判断只说了方向，没有给出幅度区间。', lesson: '高强度的宏观事件应给出分档触发价（例如 −10% 和 −20%）。' },
  'j-aapl-tariff': { expect: 'hit', why: '关税公布后的第一个交易日，苹果收跌 9.3%。', missed: '判断发出时美股尚未开盘，盘后跌幅其实已经提示了方向和力度。', lesson: '盘后的大幅波动可以用来即时校验宏观事件的强度。' },
  'j-pdd-tariff': { expect: 'hit', why: '取消小额包裹免税直接影响跨境业务，窗口内跌破触发价。', missed: '免税取消要到 5 月才生效，市场提前一个月就完成了定价。', lesson: '政策生效日晚于公布日时，仍应以公布日作为判断起点。' },
  'j-tx-retaliate': { expect: 'hit', why: '假期积压的抛压在开市当日集中释放，腾讯当日下跌 12.8%。', missed: '腾讯业务与关税的直接关联不强，下跌主要来自市场整体恐慌，而不是传导链本身。', lesson: '应区分「直接受影响」和「跟随大盘」两种命中，后者不应记为传导链的功劳。' },
  'j-catl-drop': { expect: 'miss', why: '大跌之后稳市资金入场，股价企稳，窗口内没有跌破触发价。', missed: '判断发出前一天，中央汇金已经公告增持，这个稳市信号被忽略了。', lesson: '出现稳市政策后，「大跌后续跌」类判断应暂停或下调强度。' },
  'j-xm-drop': { expect: 'miss', why: '单日下跌 20.6% 之后连续反弹，窗口内没有再创新低。', missed: '稳市信号被忽略；而且单日跌幅越极端，短期反弹的可能性越高。', lesson: '单日跌幅超过 15% 时，不宜再做续跌判断。' },
  'j-nv-104': { expect: 'void', why: '判断发出当天美方宣布暂缓对等关税，事前写明的失效条件触发，不计入战绩。', missed: '政策反复本身就是这一阶段的主要特征，判断的有效期可能撑不过一天。', lesson: '政策类判断的失效条件要写得可以检验，这一条做到了。' },
}
