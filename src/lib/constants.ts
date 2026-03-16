export const FREE_DAILY_LIMIT = 5
export const MAX_REVIEWS = 50
export const MAX_REVIEW_LENGTH = 500
export const ASPECTS = ['food', 'service', 'value', 'ambiance'] as const

// Cloudflare Workers API URL
export const EDGE_FUNCTION_URL = process.env.PLASMO_PUBLIC_API_URL ?? ''

export const SUPABASE_URL = process.env.PLASMO_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const STORAGE_KEYS = {
  DEVICE_ID: 'place_review_device_id',
  LAST_ANALYSIS: 'place_review_last_analysis',
  USAGE_CACHE: 'place_review_usage_cache'
} as const
