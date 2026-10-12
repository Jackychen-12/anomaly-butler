/** 把信号库导出成 docs/异动监测信息集.md。用法：npx tsx scripts/export-signals.ts */
import { writeFileSync } from 'node:fs'
import { signalsMarkdown } from '../src/engine'

writeFileSync(new URL('../docs/异动监测信息集.md', import.meta.url), signalsMarkdown() + '\n')
console.log('已写入 docs/异动监测信息集.md')
