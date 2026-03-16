import type { WaitTimeData } from '~lib/types'

export function WaitTimeEstimate({ waitTime }: { waitTime: WaitTimeData }) {
  const hasData = waitTime.basedOn > 0

  return (
    <div
      style={{
        background: '#f3e5f5',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>{'\u23F1\uFE0F'}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#6a1b9a' }}>Wait Time</span>
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#333', margin: 0 }}>
        {hasData ? waitTime.estimate : 'Insufficient data'}
      </p>
      {hasData && (
        <p style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
          Based on {waitTime.basedOn} reviews mentioning wait times
        </p>
      )}
    </div>
  )
}
