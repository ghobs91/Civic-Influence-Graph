/**
 * Entity summary overlay card component (T071).
 * Shows top funding sectors, major donors, voting-pattern highlights,
 * and a "Full dashboard" link.
 */

export interface SummaryCardProps {
  id: string;
  name: string;
  entityType: string;
  party: string | null;
  topSectors: Array<{ sector: string; amount: number }>;
  topDonors: Array<{ name: string; amount: number }>;
  totalRaised: number;
  voteCount: number;
  dashboardBaseUrl?: string;
}

export function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

export function SummaryCard(props: SummaryCardProps) {
  const baseUrl = props.dashboardBaseUrl ?? 'http://localhost:3000';
  const dashboardUrl = `${baseUrl}/entities/${encodeURIComponent(props.id)}`;

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <span style={nameStyle}>{props.name}</span>
        <span style={badgeStyle}>{props.entityType}</span>
        {props.party && <span style={partyStyle}>{props.party}</span>}
      </div>

      <div style={statStyle}>
        <strong>Total Raised:</strong> {formatCurrency(props.totalRaised)}
      </div>

      {props.topSectors.length > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Top Funding Sectors</div>
          <ul style={listStyle}>
            {props.topSectors.map((s) => (
              <li key={s.sector} style={listItemStyle}>
                {s.sector}: {formatCurrency(s.amount)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {props.topDonors.length > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Major Donors</div>
          <ul style={listStyle}>
            {props.topDonors.map((d) => (
              <li key={d.name} style={listItemStyle}>
                {d.name}: {formatCurrency(d.amount)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {props.voteCount > 0 && (
        <div style={statStyle}>
          <strong>Roll-call Votes:</strong> {props.voteCount.toLocaleString()}
        </div>
      )}

      <a href={dashboardUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
        Full dashboard →
      </a>
    </div>
  );
}

// Inline styles for extension popup (no external CSS dependency)
const cardStyle: React.CSSProperties = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: '13px',
  lineHeight: 1.5,
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid #e2e8f0',
  background: '#fff',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '8px',
};

const nameStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '15px',
  flex: 1,
};

const badgeStyle: React.CSSProperties = {
  fontSize: '11px',
  padding: '2px 6px',
  borderRadius: '4px',
  background: '#e8f0fe',
  color: '#1a56db',
  textTransform: 'capitalize',
};

const partyStyle: React.CSSProperties = {
  fontSize: '11px',
  padding: '2px 6px',
  borderRadius: '4px',
  background: '#f3f4f6',
  color: '#374151',
  fontWeight: 600,
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '8px',
};

const labelStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '12px',
  color: '#6b7280',
  marginBottom: '2px',
};

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: '16px',
};

const listItemStyle: React.CSSProperties = {
  fontSize: '12px',
};

const statStyle: React.CSSProperties = {
  marginBottom: '6px',
  fontSize: '13px',
};

const linkStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '8px',
  fontSize: '13px',
  color: '#2563eb',
  textDecoration: 'none',
  fontWeight: 500,
};
