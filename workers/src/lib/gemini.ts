import type { Env } from '../index'

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>
    }
  }>
  modelVersion?: string
}

export async function callGemini(
  env: Env,
  systemPrompt: string,
  userMessage: string,
  maxRetries = 1
): Promise<{ text: string; model: string }> {
  const model = env.GEMINI_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userMessage }] }],
    generationConfig: { temperature: 0.7 }
  })

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY
      },
      body
    })

    if (res.ok) {
      const data = (await res.json()) as GeminiResponse
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      return { text, model: data.modelVersion ?? model }
    }

    const errorText = await res.text()
    console.error(`Gemini API error ${res.status}: ${errorText}`)
    lastError = new Error(`AI service error (${res.status})`)

    // 429 (rate limit) 또는 503 (overloaded)만 재시도
    if (res.status !== 429 && res.status !== 503) {
      throw lastError
    }

    console.error(`Gemini API ${res.status}, retry ${attempt + 1}/${maxRetries}`)
  }

  throw lastError ?? new Error('Gemini API failed')
}
