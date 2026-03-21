import type { Env } from '../index'
import { supabaseQuery } from '../lib/supabase'

/**
 * Paddle 웹훅 이벤트 → subscriptions 테이블 관리.
 * 이벤트 → status 매핑:
 *   subscription_created (trialing) → trialing
 *   subscription_activated → active
 *   subscription_updated → plan/period_end만 업데이트
 *   subscription_canceled → canceled
 *   subscription_past_due → past_due
 *   subscription_paused → paused
 */

interface PaddleEvent {
  event_type: string
  data: {
    id: string // subscription_id
    customer_id: string
    status?: string
    custom_data?: { userId?: string }
    current_billing_period?: { ends_at?: string }
    items?: Array<{ price?: { id?: string } }>
  }
}

const EVENT_STATUS_MAP: Record<string, string> = {
  'subscription.created': 'trialing',
  'subscription.activated': 'active',
  'subscription.canceled': 'canceled',
  'subscription.past_due': 'past_due',
  'subscription.paused': 'paused'
}

export async function handlePaddleWebhook(
  request: Request,
  env: Env,
  jsonResponse: (data: unknown, status?: number) => Response,
  errorResponse: (message: string, status: number) => Response
): Promise<Response> {
  try {
    // TODO: Paddle 시그니처 검증 (Paddle Webhook Signature Verification 문서 참조)
    // const signature = request.headers.get('Paddle-Signature')
    // if (!verifyPaddleSignature(signature, body, env.PADDLE_WEBHOOK_SECRET)) {
    //   return errorResponse('Invalid signature', 401)
    // }

    const event = (await request.json()) as PaddleEvent
    const eventType = event.event_type
    const subData = event.data

    if (!subData?.id) {
      return errorResponse('Missing subscription data', 400)
    }

    const userId = subData.custom_data?.userId
    if (!userId) {
      return errorResponse('Missing userId in custom_data', 400)
    }

    // subscription.updated → status가 포함되어 있으면 반영, period/plan도 업데이트
    if (eventType === 'subscription.updated') {
      const periodEnd = subData.current_billing_period?.ends_at ?? null
      const plan = subData.items?.[0]?.price?.id?.includes('annual') ? 'annual' : 'monthly'

      const updateBody: Record<string, unknown> = {
        current_period_end: periodEnd,
        plan,
        updated_at: new Date().toISOString()
      }

      // Paddle이 status를 포함한 경우 반영 (status 변경도 updated 이벤트로 올 수 있음)
      if (subData.status) {
        updateBody.status = subData.status
      }

      await supabaseQuery(
        env,
        `subscriptions?user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          body: updateBody,
          headers: { Prefer: 'return=minimal' }
        }
      )

      return jsonResponse({ success: true, action: 'updated', status: subData.status ?? 'unchanged' })
    }

    // 나머지 이벤트: status 변경
    const newStatus = EVENT_STATUS_MAP[eventType]
    if (!newStatus) {
      return jsonResponse({ success: true, action: 'ignored', eventType })
    }

    const periodEnd = subData.current_billing_period?.ends_at ?? null
    const plan = subData.items?.[0]?.price?.id?.includes('annual') ? 'annual' : 'monthly'

    // UPSERT: 새 구독이면 insert, 기존이면 update
    await supabaseQuery(env, 'subscriptions', {
      method: 'POST',
      body: {
        user_id: userId,
        paddle_subscription_id: subData.id,
        paddle_customer_id: subData.customer_id,
        status: newStatus,
        plan,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString()
      },
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal'
      }
    })

    return jsonResponse({ success: true, action: newStatus })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook processing failed'
    return errorResponse(message, 500)
  }
}
