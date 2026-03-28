/**
 * Extension popup UI (T074).
 * Integrates SummaryCard and BallotExplorer with tab navigation.
 */

import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { SummaryCard, type SummaryCardProps } from './SummaryCard.js';
import { BallotExplorer } from '../ballot/BallotExplorer.js';

type Tab = 'summary' | 'ballot';

export function Popup() {
  const [tab, setTab] = useState<Tab>('summary');
  const [summary, setSummary] = useState<SummaryCardProps | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load any active entity summary from background worker
    chrome.storage.session.get('activeSummary', (result) => {
      if (result.activeSummary) {
        setSummary(result.activeSummary);
      }
      setLoading(false);
    });
  }, []);

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>CIG</h1>
        <nav style={navStyle}>
          <button
            style={tab === 'summary' ? activeTabStyle : tabStyle}
            onClick={() => setTab('summary')}
          >
            Summary
          </button>
          <button
            style={tab === 'ballot' ? activeTabStyle : tabStyle}
            onClick={() => setTab('ballot')}
          >
            Ballot
          </button>
        </nav>
      </header>

      <main style={mainStyle}>
        {tab === 'summary' && (
          <>
            {loading && <p style={emptyStyle}>Loading...</p>}
            {!loading && summary && <SummaryCard {...summary} />}
            {!loading && !summary && (
              <p style={emptyStyle}>
                Click on a highlighted entity name on any web page to see its influence summary here.
              </p>
            )}
          </>
        )}

        {tab === 'ballot' && <BallotExplorer />}
      </main>

      <footer style={footerStyle}>
        <a
          href="http://localhost:3000"
          target="_blank"
          rel="noopener noreferrer"
          style={footerLinkStyle}
        >
          Open CIG Dashboard
        </a>
      </footer>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  width: '380px',
  minHeight: '420px',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const headerStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #e5e7eb',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '16px',
  fontWeight: 700,
  color: '#1e3a5f',
};

const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
};

const tabStyle: React.CSSProperties = {
  padding: '4px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '4px',
  background: '#fff',
  cursor: 'pointer',
  fontSize: '12px',
};

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: '#2563eb',
  color: '#fff',
  borderColor: '#2563eb',
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px',
  overflowY: 'auto',
};

const emptyStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '13px',
  textAlign: 'center',
  padding: '48px 16px',
};

const footerStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderTop: '1px solid #e5e7eb',
  textAlign: 'center',
};

const footerLinkStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#2563eb',
  textDecoration: 'none',
};

// Mount into DOM
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<Popup />);
}
