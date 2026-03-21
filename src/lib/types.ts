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

