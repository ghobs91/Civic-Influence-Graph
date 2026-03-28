export default function HomePage() {
  return (
    <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>
        Civic Influence Graph
      </h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: '2rem' }}>
        Explore political funding, lobbying, and voting data.
      </p>
      <a
        href="/search"
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          background: 'var(--color-primary)',
          color: '#fff',
          borderRadius: 'var(--radius-md)',
          fontWeight: 600,
        }}
      >
        Start Searching
      </a>
    </div>
  );
}
