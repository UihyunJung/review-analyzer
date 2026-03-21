import type { Env } from '../index'

interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ClaudeResponse {
  content: Array<{ type: string; text: string }>
  model: string
  usage: { input_tokens: number; output_tokens: number }
}

export async function callClaude(
  env: Env,
  systemPrompt: string,
  userMessage: string,
  maxRetries = 1
): Promise<{ text: string; model: string }> {
  const body = JSON.stringify({
    model: env.CLAUDE_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }] as ClaudeMessage[]
  })

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // 재시도 전 대기 (429 rate limit 대응)
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body
    })

    if (res.ok) {
      const data = (await res.json()) as ClaudeResponse
      const text = data.content[0]?.text ?? ''
      return { text, model: data.model }
    }

    const errorText = await res.text()
    lastError = new Error(`Claude API error ${res.status}: ${errorText}`)

    // 429 (rate limit) 또는 529 (overloaded)만 재시도
    if (res.status !== 429 && res.status !== 529) {
      throw lastError
    }

    // eslint-disable-next-line no-console
    console.error(`Claude API ${res.status}, retry ${attempt + 1}/${maxRetries}`)
  }

  throw lastError ?? new Error('Claude API failed')
}
