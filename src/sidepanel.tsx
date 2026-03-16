import { useEffect, useState } from 'react'

import { STORAGE_KEYS } from '~lib/constants'
import type { PlaceAnalysis, PlaceInfo, UsageData } from '~lib/types'
import { AspectScoreCard } from '~components/AspectScoreCard'
import { TrendBadge } from '~components/TrendBadge'
import { WaitTimeEstimate } from '~components/WaitTimeEstimate'
import { BestForTags } from '~components/BestForTags'
import { PlaceComparison } from '~components/PlaceComparison'

interface StoredAnalysis {
  success: boolean
  data?: PlaceAnalysis
  placeInfo?: PlaceInfo
  error?: string
  exceeded?: boolean
  timestamp?: number
}

function SidePanel() {
  const [analysis, setAnalysis] = useState<StoredAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPro, setIsPro] = useState(false)

  useEffect(() => {
    // 1. storage에서 최신 결과 읽기 (유실 방어)
    chrome.storage.local.get(STORAGE_KEYS.LAST_ANALYSIS, (result) => {
      const stored = result[STORAGE_KEYS.LAST_ANALYSIS] as StoredAnalysis | undefined
      if (stored) setAnalysis(stored)
      setLoading(false)
    })

    // Pro 상태 확인
    chrome.storage.local.get(STORAGE_KEYS.USAGE_CACHE, (result) => {
      const usage = result[STORAGE_KEYS.USAGE_CACHE] as UsageData | undefined
      if (usage?.isPro) setIsPro(true)
    })

    // 2. 실시간 메시지 수신
    const listener = (message: { type: string; data?: StoredAnalysis }) => {
      if (message.type === 'ANALYSIS_RESULT' && message.data) {
        setAnalysis(message.data)
        setLoading(false)
      }
      if (message.type === 'ANALYSIS_LOADING') {
        setLoading(true)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Analyzing reviews...</div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>
          <h2 style={styles.emptyTitle}>Place Review Analyzer</h2>
          <p style={styles.emptyText}>
            Visit a Google Maps place page and click "Analyze This Place" to get started.
          </p>
        </div>
      </div>
    )
  }

  if (!analysis.success || !analysis.data) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          {analysis.exceeded
            ? 'Daily limit reached. Upgrade to Pro for unlimited analyses!'
            : (analysis.error ?? 'Analysis failed')}
        </div>
      </div>
    )
  }

  const { data, placeInfo } = analysis
  const languageEntries = Object.entries(data.languageBreakdown ?? {}).sort(([, a], [, b]) => b - a)

  return (
    <div style={styles.container}>
      {placeInfo && (
        <header style={styles.header}>
          <h1 style={styles.placeName}>{placeInfo.name}</h1>
          <p style={styles.category}>{placeInfo.category}</p>
        </header>
      )}

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Aspect Scores</h2>
        {data.aspects.map((aspect) => (
          <AspectScoreCard key={aspect.aspect} aspect={aspect} />
        ))}
      </section>

      {data.highlights.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Highlights</h2>
          <ul style={styles.list}>
            {data.highlights.map((h, i) => (
              <li key={i} style={styles.highlight}>
                {h}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.warnings.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Watch Out</h2>
          <ul style={styles.list}>
            {data.warnings.map((w, i) => (
              <li key={i} style={styles.warning}>
                {w}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Pro Features */}
      {data.trend || data.waitTime || data.bestFor ? (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Pro Insights</h2>
          {data.trend && <TrendBadge trend={data.trend} />}
          {data.waitTime && <WaitTimeEstimate waitTime={data.waitTime} />}
          {data.bestFor && <BestForTags tags={data.bestFor} />}
        </section>
      ) : !isPro ? (
        <section style={styles.proGate}>
          <p style={styles.proGateText}>Trend analysis, wait times & more</p>
          <button style={styles.proGateButton}>Unlock with Pro</button>
        </section>
      ) : null}

      {/* Place Comparison (Pro) */}
      {isPro && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Compare Places</h2>
          <PlaceComparison />
        </section>
      )}

      {languageEntries.length > 0 && (
        <section style={styles.section}>
          <p style={styles.langInfo}>
            Reviews:{' '}
            {languageEntries
              .map(([lang, count]) => {
                const pct = Math.round((count / data.reviewCount) * 100)
                return `${pct}% ${lang.toUpperCase()}`
              })
              .join(', ')}
          </p>
        </section>
      )}

      <footer style={styles.footer}>
        <p>Based on {data.reviewCount} reviews</p>
      </footer>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: 16,
    maxWidth: 400,
    color: '#1a1a1a'
  },
  loading: { textAlign: 'center', padding: 40, color: '#666' },
  empty: { textAlign: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, marginBottom: 8 },
  emptyText: { color: '#666', fontSize: 14, lineHeight: 1.5 },
  error: {
    background: '#fff3f3',
    color: '#e53935',
    padding: 16,
    borderRadius: 8,
    fontSize: 14,
    textAlign: 'center'
  },
  header: { marginBottom: 16 },
  placeName: { fontSize: 18, fontWeight: 700, margin: 0 },
  category: { fontSize: 13, color: '#666', marginTop: 2 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#333' },
  list: { listStyle: 'none', padding: 0, margin: 0 },
  highlight: {
    padding: '6px 0',
    borderBottom: '1px solid #f0f0f0',
    fontSize: 13,
    color: '#2e7d32'
  },
  warning: {
    padding: '6px 0',
    borderBottom: '1px solid #f0f0f0',
    fontSize: 13,
    color: '#e65100'
  },
  langInfo: { fontSize: 12, color: '#999' },
  footer: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 8 },
  proGate: {
    background: 'linear-gradient(135deg, #667eea22 0%, #764ba222 100%)',
    border: '1px dashed #667eea',
    borderRadius: 8,
    padding: 16,
    textAlign: 'center',
    marginBottom: 16
  },
  proGateText: { fontSize: 13, color: '#555', marginBottom: 8 },
  proGateButton: {
    background: '#667eea',
    color: 'white',
    border: 'none',
    padding: '8px 20px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer'
  }
}

export default SidePanel
