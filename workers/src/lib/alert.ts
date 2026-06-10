// 운영자 Telegram 알림 — fire-and-forget 전용.
// 어떤 실패도 분석 응답에 영향을 주면 안 됨 (전체 try-catch로 삼킴).
import type { ExecutionContext } from '@cloudflare/workers-types'
import type { Env } from '../index'
import { supabaseRpc } from './supabase'
import type { ClassifiedError } from './error-classify'

export interface AlertContext {
  status: number // HTTP status (fetch 자체 실패는 0)
  errorCode: string // 사용자 응답에 나간 errorCode (참고 표기용)
  detail: string // 에러 원문 (DB는 1000자, 메시지는 300자로 절단)
}

const DETAIL_MAX_LENGTH = 300

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🚨',
  warning: '⚠️'
}

// 순수 함수 (테스트 대상). Telegram parse_mode를 쓰지 않으므로 이스케이프 불필요.
export function formatAlertMessage(
  classified: ClassifiedError,
  ctx: AlertContext,
  envLabel: string,
  timestamp: string
): string {
  const emoji = SEVERITY_EMOJI[classified.severity] ?? '📌'
  const detail =
    ctx.detail.length > DETAIL_MAX_LENGTH
      ? `${ctx.detail.slice(0, DETAIL_MAX_LENGTH)}…`
      : ctx.detail
  return [
    `[Place Review Analyzer] ${emoji} ${classified.classification} (${classified.severity})`,
    `env: ${envLabel} | HTTP ${ctx.status} | errorCode: ${ctx.errorCode}`,
    `원인: ${classified.adminHint}`,
    `원문: ${detail}`,
    `time: ${timestamp}`
  ].join('\n')
}

async function sendTelegram(env: Env, text: string): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN
  const chatId = env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return // 미설정 환경은 no-op

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  })
  if (!res.ok) {
    // 토큰 노출 방지 — URL/응답 바디는 로깅하지 않고 상태 코드만
    // eslint-disable-next-line no-console
    console.error(`[Alert] Telegram send failed: ${res.status}`)
  }
}

/**
 * 에러 이벤트를 Supabase에 적재하고, RPC 판정(critical 즉시 / warning 10분 내 3건,
 * 동일 분류 60분 dedup)이 true면 Telegram 발송. ctx.waitUntil로 응답과 분리.
 */
export function reportGeminiFailure(
  env: Env,
  ctx: ExecutionContext,
  classified: ClassifiedError,
  alertCtx: AlertContext
): void {
  ctx.waitUntil(
    (async () => {
      try {
        const shouldAlert = await supabaseRpc(env, 'record_error_and_check_alert', {
          p_classification: classified.classification,
          p_severity: classified.severity,
          p_status: alertCtx.status,
          p_error_code: alertCtx.errorCode,
          p_message: alertCtx.detail,
          p_env: env.ENV_LABEL
        })
        if (shouldAlert === true) {
          await sendTelegram(
            env,
            formatAlertMessage(classified, alertCtx, env.ENV_LABEL, new Date().toISOString())
          )
        }
      } catch (err) {
        // 알림 실패는 분석 플로우에 절대 영향 없음
        // eslint-disable-next-line no-console
        console.error('[Alert] failed:', err instanceof Error ? err.message : err)
      }
    })()
  )
}
