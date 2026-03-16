import type { TrendData } from '~lib/types'

const TREND_CONFIG = {
  improving: { color: '#2e7d32', bg: '#e8f5e9', icon: '\u2191', label: 'Improving' },
  declining: { color: '#c62828', bg: '#ffebee', icon: '\u2193', label: 'Declining' },
  stable: { color: '#f57f17', bg: '#fff8e1', icon: '\u2192', label: 'Stable' }
}

export function TrendBadge({ trend }: { trend: TrendData }) {
  const config = TREND_CONFIG[trend.direction]

  return (
    <div style={{ background: config.bg, borderRadius: 8, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 18, color: config.color }}>{config.icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: config.color }}>{config.label}</span>
      </div>
      <p style={{ fontSize: 12, color: '#555', margin: 0, lineHeight: 1.4 }}>{trend.reason}</p>
    </div>
  )
}
