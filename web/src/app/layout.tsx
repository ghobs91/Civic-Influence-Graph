import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Civic Influence Graph',
  description:
    'Search and explore political funding, lobbying, and voting data.',
};

function NavHeader() {
  return (
    <header
      style={{
        borderBottom: '1px solid var(--color-border)',
        padding: '0.75rem 0',
      }}
    >
      <nav className="container" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <a href="/" style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--color-fg)' }}>
          CIG
        </a>
        <a href="/search">Search</a>
        <a href="/graph">Graph</a>
        <a href="/ai">AI Query</a>
      </nav>
    </header>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <NavHeader />
        <main className="container" style={{ paddingTop: '1.5rem', paddingBottom: '2rem' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
