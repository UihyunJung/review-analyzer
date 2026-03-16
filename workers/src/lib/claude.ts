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
  userMessage: string
): Promise<{ text: string; model: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }] as ClaudeMessage[]
    })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Claude API error ${res.status}: ${text}`)
  }

  const data = (await res.json()) as ClaudeResponse
  const text = data.content[0]?.text ?? ''
  return { text, model: data.model }
}
