import DonationLeaderboard from '@/components/dashboard/DonationLeaderboard';

export default function HomePage() {
  return (
    <div style={{ paddingTop: '2rem', maxWidth: '56rem', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
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

      <div className="card" style={{ padding: '1.5rem' }}>
        <DonationLeaderboard />
      </div>
    </div>
  );
}
