export const API_BASE = import.meta.env.VITE_PADDLE_API_BASE || 'https://paddle-extensions-backend.vercel.app'
export const WORKERS_BASE = import.meta.env.VITE_WORKERS_BASE || 'https://place-review-api.uihyun-jung.workers.dev'

export const FREE_DAILY_LIMIT = 3
export const MAX_REVIEWS = 50
export const MAX_REVIEW_LENGTH = 500

export const STORAGE_KEYS = {
  INSTALL_ID: 'pra_install_id',
  PREMIUM: 'pra_premium',
  PLAN_TYPE: 'pra_plan_type',
  EXPIRES_AT: 'pra_expires_at',
  SUB_STATUS: 'pra_sub_status',
  SYNC_FAILED: 'pra_sync_failed',
  LAST_ANALYSIS: 'pra_last_analysis',
  USAGE_CACHE: 'pra_usage_cache',
  LANGUAGE: 'pra_language'
}
