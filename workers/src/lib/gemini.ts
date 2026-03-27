import type { Env } from '../index'

export async function callGemini(
  env: Env,
  systemPrompt: string,
  userMessage: string,
  maxRetries = 1
): Promise<{ text: string; model: string }> {
  const model = env.GEMINI_MODEL
  const proxyUrl = `${env.PADDLE_BACKEND_URL}/api/gemini`

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }

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
    lastError = new Error(`AI service error (${res.status})`)

    // 429 (rate limit) 또는 503 (overloaded)만 재시도
    if (res.status !== 429 && res.status !== 503) {
      throw lastError
    }

    console.error(`Gemini proxy ${res.status}, retry ${attempt + 1}/${maxRetries}`)
  }

  throw lastError ?? new Error('Gemini API failed')
}
