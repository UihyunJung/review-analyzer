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
    headers: { 'Content-Type': 'application/json' },
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

  const errorText = await res.text()
  console.error(`Gemini proxy error ${res.status}: ${errorText}`)
  throw new GeminiError(res.status, errorText)
}
