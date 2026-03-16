import type { AspectScore } from '~lib/types'

const ASPECT_COLORS: Record<string, string> = {
  food: '#4caf50',
  service: '#2196f3',
  value: '#ff9800',
  ambiance: '#9c27b0'
}

const ASPECT_ICONS: Record<string, string> = {
  food: '\uD83C\uDF7D\uFE0F',
  service: '\uD83D\uDC4B',
  value: '\uD83D\uDCB0',
  ambiance: '\u2728'
}

export function AspectScoreCard({ aspect }: { aspect: AspectScore }) {
  const color = ASPECT_COLORS[aspect.aspect] ?? '#667eea'
  const icon = ASPECT_ICONS[aspect.aspect] ?? '\u2B50'
  const percentage = (aspect.score / 10) * 100

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.icon}>{icon}</span>
        <span style={styles.name}>
          {aspect.aspect.charAt(0).toUpperCase() + aspect.aspect.slice(1)}
        </span>
        <span style={{ ...styles.score, color }}>{aspect.score.toFixed(1)}</span>
      </div>
      <div style={styles.barBg}>
        <div
          style={{
            ...styles.barFill,
            width: `${percentage}%`,
            background: color
          }}
        />
      </div>
      <p style={styles.summary}>{aspect.summary}</p>
      {aspect.keywords.length > 0 && (
        <div style={styles.keywords}>
          {aspect.keywords.map((kw) => (
            <span key={kw} style={{ ...styles.tag, borderColor: color, color }}>
              {kw}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6
  },
  icon: { fontSize: 16 },
  name: { fontSize: 13, fontWeight: 600, flex: 1 },
  score: { fontSize: 16, fontWeight: 700 },
  barBg: {
    height: 4,
    background: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.3s ease'
  },
  summary: { fontSize: 12, color: '#555', margin: 0, lineHeight: 1.4 },
  keywords: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tag: {
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid',
    background: 'white'
  }
}
