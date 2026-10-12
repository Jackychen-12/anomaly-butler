/**
 * 大模型接口（OpenAI 兼容的 chat/completions）。纯前端直接从浏览器调用。
 * key 不写进代码和配置文件：由用户在「我的 → 管家设置」里填，只存在他自己的浏览器里（localStorage）。
 */
import { useEffect, useState } from 'react'

export type Llm = { on: boolean; url: string; key: string; model: string }
export const LLM_PRESETS = [
  { name: 'DeepSeek', url: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { name: '阿里百炼', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
] as const
/** 默认预设为 DeepSeek，key 留空，填了才启用 */
export const DEFAULT_LLM: Llm = { on: false, url: LLM_PRESETS[0].url, key: '', model: LLM_PRESETS[0].model }
export const llmReady = (l: Llm) => !!(l.on && l.url && l.key && l.model)
export const llmName = (l: Llm) => LLM_PRESETS.find((p) => p.url === l.url)?.name ?? '大模型'

export async function chat(llm: Llm, system: string, user: string, maxTokens = 400): Promise<string> {
  const res = await fetch(llm.url.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.key}` },
    body: JSON.stringify({ model: llm.model, temperature: 0.3, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  })
  if (!res.ok) throw new Error(res.status === 401 ? 'key 无效' : res.status === 402 ? '余额不足' : `接口返回 ${res.status}`)
  const text = (await res.json())?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new Error('接口没有返回内容')
  return text.trim()
}

/** 所有由模型写的文字都遵守的底线 */
export const GROUND = '你是「异动管家」，帮用户盯自选股的异动。只根据给出的资料写，资料里没有的不要编；不要使用资料之外的行情或新闻。用大白话，不用术语，不用列表和 Markdown。不给具体买卖指令。'

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) }
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* 存不了就下次再生成 */ } }

type Gen = { text: string | null; loading: boolean; error: string | null; refresh: () => void }
/**
 * 让模型根据一份资料写一段话。同样的资料只生成一次，结果缓存在浏览器里；资料变了才重新生成。
 * 没配好模型时返回空，由调用的地方显示规则生成的文字。
 */
export function useGenerated(llm: Llm, name: string, system: string, material: string, maxTokens = 300): Gen {
  const ready = llmReady(llm)
  const key = `anomaly-butler:gen:${name}:${hash(llm.model + system + material)}`
  const [state, setState] = useState<{ key: string; text: string | null; loading: boolean; error: string | null }>({ key, text: null, loading: false, error: null })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (!ready) { setState({ key, text: null, loading: false, error: null }); return }
    const cached = nonce === 0 ? read(key) : null
    if (cached) { setState({ key, text: cached, loading: false, error: null }); return }
    let alive = true
    setState({ key, text: null, loading: true, error: null })
    chat(llm, system, material, maxTokens)
      .then((t) => { write(key, t); if (alive) setState({ key, text: t, loading: false, error: null }) })
      .catch((e) => { if (alive) setState({ key, text: null, loading: false, error: e instanceof Error ? e.message : '未知错误' }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, nonce])
  return { text: state.key === key ? state.text : null, loading: state.key === key && state.loading, error: state.key === key ? state.error : null, refresh: () => setNonce((n) => n + 1) }
}
