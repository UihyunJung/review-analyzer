import type { PlasmoCSConfig } from 'plasmo'
import { useEffect, useState } from 'react'

import { extractNaverPlaceReviews } from '~lib/scrapers/naver-place'
import type { UsageData } from '~lib/types'

export const config: PlasmoCSConfig = {
  matches: ['https://m.place.naver.com/*', 'https://pcmap.place.naver.com/*']
}

const NaverPlaceReviewButton = () => {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exceeded, setExceeded] = useState(false)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_USAGE' }, (response) => {
      if (response?.success && response.data) {
        const usage = response.data as UsageData
        if (!usage.isPro && usage.remaining <= 0) setExceeded(true)
      }
    })
  }, [])

  const handleAnalyze = async () => {
    if (exceeded) return
    setLoading(true)
    setError(null)

    try {
      const { reviews, placeInfo } = await extractNaverPlaceReviews(document, window.location.href)

      if (reviews.length === 0) {
        setError('\uB9AC\uBDF0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4')
        setLoading(false)
        return
      }

      chrome.runtime.sendMessage(
        { type: 'ANALYZE_PLACE', reviews, placeInfo, site: 'naver_place' },
        (response) => {
          setLoading(false)
          if (response?.success) {
            setDone(true)
            chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' })
            setTimeout(() => setDone(false), 3000)
          } else if (response?.exceeded) {
            setExceeded(true)
          } else {
            setError(response?.error ?? '\uBD84\uC11D \uC2E4\uD328')
            setTimeout(() => setError(null), 5000)
          }
        }
      )
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : '\uB9AC\uBDF0 \uCD94\uCD9C \uC2E4\uD328')
      setTimeout(() => setError(null), 5000)
    }
  }

  const bgColor = done ? '#43a047' : exceeded ? '#ff9800' : error ? '#e53935' : '#667eea'

  return (
    <button
      onClick={exceeded ? undefined : handleAnalyze}
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
        cursor: loading ? 'wait' : exceeded ? 'default' : 'pointer',
        fontSize: 14,
        fontWeight: 600,
        zIndex: 10000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        transition: 'all 0.2s ease',
        opacity: loading ? 0.8 : 1
      }}
    >
      {loading
        ? '\uBD84\uC11D \uC911...'
        : done
          ? '\u2713 \uC644\uB8CC'
          : exceeded
            ? 'Pro\uB85C \uC5C5\uADF8\uB808\uC774\uB4DC'
            : '\u2605 \uB9AC\uBDF0 \uBD84\uC11D\uD558\uAE30'}
    </button>
  )
}

export default NaverPlaceReviewButton
