export function BestForTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null

  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 6 }}>Best For</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              background: '#e3f2fd',
              color: '#1565c0',
              padding: '4px 10px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 500
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  )
}
