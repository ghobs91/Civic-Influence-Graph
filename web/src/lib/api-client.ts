const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export interface PaginationMeta {
  request_id: string;
  timestamp: string;
  data_snapshot: string | null;
  query_params?: Record<string, unknown>;
  total_count: number;
  page: number;
  page_size: number;
}

export interface ApiResponse<T> {
  data: T;
  meta: PaginationMeta;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
}

// --- Search ---

export interface SearchResult {
  id: string;
  entity_type: string;
  canonical_name: string;
  name_variants?: string[];
  jurisdiction?: string | null;
  party?: string | null;
  roles?: Array<{ role: string; body: string; state: string }>;
  relevance_score: number;
}

export interface SearchParams {
  q: string;
  type?: string;
  jurisdiction?: string;
  sector?: string;
  page?: number;
  page_size?: number;
}

// --- Entities ---

export interface EntityDetail {
  id: string;
  entity_type: string;
  canonical_name: string;
  source_ids?: Array<{ source: string; external_id: string }>;
  name_variants?: string[];
  party?: string | null;
  jurisdictions?: string[];
  roles?: Array<{ role: string; body: string; state: string }>;
  [key: string]: unknown;
}

// --- Dashboard ---

export interface FundingSummary {
  total_received: number;
  total_given: number;
  by_sector?: Array<{
    sector: string;
    sector_id: string | null;
    amount: number;
    count: number;
  }>;
  top_counterparties: Array<{
    entity_id: string;
    name?: string;
    entity_type: string;
    amount: number;
    count: number;
  }>;
}

export interface LobbySummary {
  engagements_mentioning: number;
  top_clients: Array<{
    org_id: string;
    name: string;
    engagement_count: number;
  }>;
  top_issues: string[];
}

export interface VotingSummary {
  total_votes: number;
  yea_votes?: number;
  nay_votes?: number;
  by_party_alignment?: {
    with_party: number;
    against_party: number;
  };
  recent_votes: Array<{
    bill_id: string;
    bill_number: string;
    vote_cast: string;
    vote_date: string;
  }>;
}

export interface DashboardData {
  entity: { id: string; canonical_name?: string; entity_type?: string };
  funding_summary: FundingSummary;
  lobbying_summary?: LobbySummary;
  voting_summary: VotingSummary;
}

export interface DashboardParams {
  start_date?: string;
  end_date?: string;
}

// --- Donations ---

export interface Donation {
  id: string;
  source_entity_id: string;
  source_entity_type?: string;
  destination_entity_id: string;
  destination_entity_type?: string;
  amount: number;
  transaction_date: string;
  transaction_type: string;
  election_cycle: string;
  filing_id: string;
  source_system: string;
  source_record_id: string;
}

export interface DonationParams {
  direction?: string;
  start_date?: string;
  end_date?: string;
  min_amount?: number;
  max_amount?: number;
  sector?: string;
  page?: number;
  page_size?: number;
}

// --- Lobbying ---

export interface LobbyingEngagement {
  id: string;
  registrant_id: string;
  client_id: string;
  filing_type: string;
  filing_date: string;
  amount: number;
  issues: string[];
  lobbyists: string[];
  government_entities: string[];
  source_system: string;
  source_record_id: string;
}

// --- Votes ---

export interface Vote {
  id: string;
  person_id: string;
  bill_id: string;
  bill_number: string;
  bill_title: string;
  vote_cast: string;
  vote_date: string;
  session: string;
  roll_call_number: string;
  source_system: string;
  source_record_id: string;
}

// --- Pagination ---

export interface PaginationParams {
  page?: number;
  page_size?: number;
}

// --- Fetch helper ---

class ApiClientError extends Error {
  constructor(
    public status: number,
    public body: ApiError | null,
  ) {
    super(body?.error?.message ?? `API error ${status}`);
    this.name = 'ApiClientError';
  }
}

function buildUrl(path: string, params?: Record<string, unknown>): string {
  const base = `${API_BASE}${path}`;
  if (!params) return base;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      sp.set(key, String(value));
    }
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

async function fetchApi<T>(path: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
  const url = buildUrl(path, params);
  const res = await fetch(url);

  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = await res.json();
    } catch {
      // response may not be JSON
    }
    throw new ApiClientError(res.status, body);
  }

  return res.json();
}

function toParams(obj?: object): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  return Object.fromEntries(Object.entries(obj));
}

// --- Public API ---

export async function search(params: SearchParams): Promise<ApiResponse<{ results: SearchResult[] }>> {
  return fetchApi('/search', toParams(params));
}

export async function getEntity(id: string): Promise<ApiResponse<EntityDetail>> {
  return fetchApi(`/entities/${encodeURIComponent(id)}`);
}

export async function getDashboard(
  id: string,
  params?: DashboardParams,
): Promise<ApiResponse<DashboardData>> {
  return fetchApi(`/entities/${encodeURIComponent(id)}/dashboard`, toParams(params));
}

export async function getDonations(
  id: string,
  params?: DonationParams,
): Promise<ApiResponse<{ donations: Donation[] }>> {
  return fetchApi(`/entities/${encodeURIComponent(id)}/donations`, toParams(params));
}

export async function getLobbying(
  id: string,
  params?: PaginationParams,
): Promise<ApiResponse<{ lobbying_engagements: LobbyingEngagement[] }>> {
  return fetchApi(`/entities/${encodeURIComponent(id)}/lobbying`, toParams(params));
}

export async function getVotes(
  id: string,
  params?: PaginationParams,
): Promise<ApiResponse<{ votes: Vote[] }>> {
  return fetchApi(`/entities/${encodeURIComponent(id)}/votes`, toParams(params));
}

// --- Graph ---

export interface GraphNode {
  id: string;
  label: string;
  name: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphQueryParams {
  center_entity_id?: string;
  depth?: number;
  start_date?: string;
  end_date?: string;
  sectors?: string[];
  min_amount?: number;
  edge_types?: string[];
  jurisdictions?: string[];
  max_nodes?: number;
}

export interface TableRow {
  source_id: string;
  source_name: string;
  source_type: string;
  target_id: string;
  target_name: string;
  target_type: string;
  edge_type: string;
  amount: number | null;
  date: string | null;
  filing_id: string | null;
}

export interface TableParams {
  center_entity_id?: string;
  start_date?: string;
  end_date?: string;
  sectors?: string;
  min_amount?: number;
  edge_types?: string;
  jurisdiction?: string;
  format?: 'json' | 'csv';
  page?: number;
  page_size?: number;
}

export async function queryGraph(params: GraphQueryParams): Promise<ApiResponse<GraphData>> {
  const url = `${API_BASE}/graph/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = await res.json();
    } catch {
      // response may not be JSON
    }
    throw new ApiClientError(res.status, body);
  }

  return res.json();
}

export async function queryTable(params: TableParams): Promise<ApiResponse<{ rows: TableRow[] }>> {
  return fetchApi('/graph/table', toParams(params));
}

export async function queryTableCsv(params: Omit<TableParams, 'format'>): Promise<string> {
  const url = buildUrl('/graph/table', { ...toParams(params), format: 'csv' });
  const res = await fetch(url);
  if (!res.ok) {
    throw new ApiClientError(res.status, null);
  }
  return res.text();
}

// ============================================================
// AI AUDIT LOG
// ============================================================

export interface AuditLogParams {
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

export interface AuditLogRow {
  id: string;
  timestamp: string;
  natural_language_query: string;
  generated_query: string;
  query_params: Record<string, unknown> | null;
  model_id: string;
  model_version: string;
  result_count: number | null;
  client_info: { user_agent: string; session_id: string } | null;
}

export interface AuditLogPayload {
  natural_language_query: string;
  generated_query: string;
  query_params?: Record<string, unknown>;
  model_id: string;
  model_version: string;
  result_count?: number;
  client_info?: { user_agent: string; session_id: string };
}

export async function getAuditLog(
  params?: AuditLogParams,
): Promise<ApiResponse<{ entries: AuditLogRow[] }>> {
  return fetchApi('/ai/audit-log', params ? toParams(params) : {});
}

export async function postAuditLog(
  payload: AuditLogPayload,
): Promise<ApiResponse<{ id: string; saved_at: string }>> {
  const url = `${API_BASE}/ai/audit-log`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = await res.json();
    } catch {
      // response may not be JSON
    }
    throw new ApiClientError(res.status, body);
  }

  return res.json();
}

export { ApiClientError };
