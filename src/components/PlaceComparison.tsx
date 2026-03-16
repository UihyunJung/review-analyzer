import { useEffect, useState } from 'react'

import type { PlaceAnalysis, PlaceInfo } from '~lib/types'

interface HistoryEntry {
  data?: PlaceAnalysis
  placeInfo?: PlaceInfo
  timestamp?: number
}

export function PlaceComparison() {
  const [history, setHistory] = useState<HistoryEntry[]>([])

  useEffect(() => {
    // analysis_history에서 최근 분석 3개 로드 (로컬 캐시 기반)
    chrome.storage.local.get('place_review_comparison_list', (result) => {
      const list = (result['place_review_comparison_list'] as HistoryEntry[]) ?? []
      setHistory(list.slice(0, 3))
    })
  }, [])

  if (history.length < 2) {
    return (
      <div style={{ fontSize: 12, color: '#999', textAlign: 'center', padding: 16 }}>
        Analyze 2+ places to compare them side by side
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={thStyle}>Aspect</th>
            {history.map((entry, i) => (
              <th key={i} style={thStyle}>
                {entry.placeInfo?.name?.slice(0, 15) ?? `Place ${i + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {['food', 'service', 'value', 'ambiance'].map((aspect) => (
            <tr key={aspect}>
              <td style={tdStyle}>{aspect.charAt(0).toUpperCase() + aspect.slice(1)}</td>
              {history.map((entry, i) => {
                const score = entry.data?.aspects.find((a) => a.aspect === aspect)?.score
                return (
                  <td key={i} style={{ ...tdStyle, fontWeight: 600, color: scoreColor(score) }}>
                    {score != null ? score.toFixed(1) : '-'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function scoreColor(score?: number): string {
  if (score == null) return '#999'
  if (score >= 8) return '#2e7d32'
  if (score >= 6) return '#f57f17'
  return '#c62828'
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '2px solid #e0e0e0',
  fontSize: 11,
  color: '#666'
}

const tdStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid #f0f0f0'
}
