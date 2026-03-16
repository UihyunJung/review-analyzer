export interface Review {
  id: string
  author: string
  rating: number
  text: string
  date: Date | null
  relativeDate: string
  language?: string
  verifiedPurchase?: boolean
  helpful?: number
}

export interface PlaceInfo {
  placeId: string
  name: string
  url: string
  category: string
  overallRating: number
  totalReviews: number
  address?: string
}

export interface AspectScore {
  aspect: 'food' | 'service' | 'value' | 'ambiance' | string
  score: number
  summary: string
  keywords: string[]
}

export interface TrendData {
  recentSentiment: string
  previousSentiment: string
  direction: 'improving' | 'declining' | 'stable'
  reason: string
}

export interface WaitTimeData {
  estimate: string
  basedOn: number
}

export interface PlaceAnalysis {
  aspects: AspectScore[]
  highlights: string[]
  warnings: string[]
  languageBreakdown: Record<string, number>
  reviewCount: number
  // Pro fields (optional)
  trend?: TrendData
  waitTime?: WaitTimeData
  bestFor?: string[]
}

export interface AnalyzeRequest {
  type: 'ANALYZE_PLACE'
  reviews: Review[]
  placeInfo: PlaceInfo
  site: SupportedSite
}

export interface AnalyzeResponse {
  success: boolean
  data?: PlaceAnalysis
  error?: string
  exceeded?: boolean
}

export interface UsageData {
  count: number
  limit: number
  isPro: boolean
  remaining: number
}

export type SupportedSite = (typeof SUPPORTED_SITES)[number]

export const SUPPORTED_SITES = ['google_maps', 'naver_place'] as const
