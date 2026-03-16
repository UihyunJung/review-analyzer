import type { PlasmoCSConfig } from 'plasmo'
import { useEffect, useState } from 'react'

import { extractGoogleMapsReviews } from '~lib/scrapers/google-maps'
import type { UsageData } from '~lib/types'

export const config: PlasmoCSConfig = {
  matches: ['https://www.google.com/maps/place/*']
}

const GoogleMapsReviewButton = () => {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exceeded, setExceeded] = useState(false)

  // 마운트 시 사용량 확인
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_USAGE' }, (response) => {
      if (response?.success && response.data) {
        const usage = response.data as UsageData
        if (!usage.isPro && usage.remaining <= 0) {
          setExceeded(true)
        }
      }
    })
  }, [])

  const handleAnalyze = async () => {
    if (exceeded) return

    setLoading(true)
    setError(null)

    try {
      const { reviews, placeInfo } = await extractGoogleMapsReviews(document, window.location.href)

      if (reviews.length === 0) {
        setError('No reviews found')
        setLoading(false)
        return
      }

      chrome.runtime.sendMessage(
        {
          type: 'ANALYZE_PLACE',
          reviews,
          placeInfo,
          site: 'google_maps'
        },
        (response) => {
          setLoading(false)
          if (response?.success) {
            setDone(true)
            chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' })
            setTimeout(() => setDone(false), 3000)
          } else if (response?.exceeded) {
            setExceeded(true)
          } else {
            setError(response?.error ?? 'Analysis failed')
            setTimeout(() => setError(null), 5000)
          }
        }
      )
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : 'Failed to extract reviews')
      setTimeout(() => setError(null), 5000)
    }
  }

  const isExceeded = exceeded
  const bgColor = done ? '#43a047' : isExceeded ? '#ff9800' : error ? '#e53935' : '#667eea'

  return (
    <button
      onClick={isExceeded ? undefined : handleAnalyze}
      disabled={loading}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        padding: '12px 24px',
        background: bgColor,
        color: 'white',
        border: 'none',
        borderRadius: 12,
        cursor: loading ? 'wait' : isExceeded ? 'default' : 'pointer',
        fontSize: 14,
        fontWeight: 600,
        zIndex: 10000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'all 0.2s ease',
        opacity: loading ? 0.8 : 1
      }}
    >
      {loading
        ? 'Analyzing...'
        : done
          ? '\u2713 Done'
          : isExceeded
            ? 'Upgrade to Pro \u2014 Unlimited'
            : error
              ? error
              : '\u2605 Analyze This Place'}
    </button>
  )
}

export default GoogleMapsReviewButton
