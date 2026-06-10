import type { Env } from '../index'

export class GeminiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'GeminiError'
    this.status = status
  }
}

export async function callGemini(
  env: Env,
  systemPrompt: string,
  userMessage: string
): Promise<{ text: string; model: string }> {
  const model = env.GEMINI_MODEL
  const proxyUrl = `${env.PADDLE_BACKEND_URL}/api/gemini`

  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Secret': env.GEMINI_PROXY_SECRET
    },
    body: JSON.stringify({
      model,
      systemPrompt,
      userMessage,
      temperature: 0.7
    })
  })

  if (res.ok) {
    const data = (await res.json()) as { text: string; model: string }
    return { text: data.text ?? '', model: data.model ?? model }
  }

  // 프록시는 {"error":"Gemini API error (429): ..."} 형태로 응답 — 내부 메시지만 추출
  const errorText = await res.text()
  let message = errorText
  try {
    const parsed = JSON.parse(errorText) as { error?: string }
    if (parsed.error) message = parsed.error
  } catch {
    // 비JSON 응답(게이트웨이 에러 등)은 원문 유지
  }
  console.error(`Gemini proxy error ${res.status}: ${message}`)
  throw new GeminiError(res.status, message)
}
