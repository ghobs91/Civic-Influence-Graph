import { z } from 'zod';

// ============================================================
// ENUM SCHEMAS
// ============================================================

export const EntityTypeEnum = z.enum(['legislator', 'donor', 'lobbyist', 'executive', 'other']);
export type EntityType = z.infer<typeof EntityTypeEnum>;

export const CommitteeTypeEnum = z.enum([
  'candidate',
  'pac',
  'super_pac',
  'party',
  'joint_fundraising',
  'other',
]);
export type CommitteeType = z.infer<typeof CommitteeTypeEnum>;

export const OrgTypeEnum = z.enum([
  'corporation',
  'nonprofit',
  'trade_association',
  'lobbying_firm',
  'union',
  'other',
]);
export type OrgType = z.infer<typeof OrgTypeEnum>;

export const ChamberEnum = z.enum(['house', 'senate', 'joint']);
export type Chamber = z.infer<typeof ChamberEnum>;

export const VoteCastEnum = z.enum(['yea', 'nay', 'present', 'not_voting']);
export type VoteCast = z.infer<typeof VoteCastEnum>;

export const SourceEntityTypeEnum = z.enum(['person', 'committee', 'organization']);
export type SourceEntityType = z.infer<typeof SourceEntityTypeEnum>;

export const AffiliationTypeEnum = z.enum([
  'employment',
  'board_member',
  'subsidiary',
  'joint_fundraising',
  'leadership_pac',
  'other',
]);
export type AffiliationType = z.infer<typeof AffiliationTypeEnum>;

// ============================================================
// SHARED SUB-SCHEMAS
// ============================================================

export const SourceIdSchema = z.object({
  source: z.string(),
  external_id: z.string(),
});
export type SourceId = z.infer<typeof SourceIdSchema>;

export const RoleSchema = z.object({
  role: z.string(),
  body: z.string(),
  state: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});
export type Role = z.infer<typeof RoleSchema>;

export const CommitteeMembershipSchema = z.object({
  committee_id: z.string().uuid(),
  role: z.string(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});
export type CommitteeMembership = z.infer<typeof CommitteeMembershipSchema>;

export const MergeHistoryEntrySchema = z.object({
  merged_from_id: z.string().uuid(),
  merged_at: z.string(),
  reason: z.string(),
});
export type MergeHistoryEntry = z.infer<typeof MergeHistoryEntrySchema>;

export const AmendmentChainEntrySchema = z.object({
  filing_id: z.string(),
  amendment_indicator: z.string(),
  date: z.string(),
});
export type AmendmentChainEntry = z.infer<typeof AmendmentChainEntrySchema>;

// ============================================================
// ENTITY SCHEMAS
// ============================================================

export const PersonSchema = z.object({
  id: z.string().uuid(),
  source_ids: z.array(SourceIdSchema),
  canonical_name: z.string().min(1),
  name_variants: z.array(z.string()),
  entity_type: EntityTypeEnum,
  party: z.string().nullable(),
  jurisdictions: z.array(z.string()),
  roles: z.array(RoleSchema),
  committee_memberships: z.array(CommitteeMembershipSchema),
  employer: z.string().nullable(),
  occupation: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  merge_history: z.array(MergeHistoryEntrySchema),
});
export type Person = z.infer<typeof PersonSchema>;

export const CommitteeSchema = z.object({
  id: z.string().uuid(),
  source_ids: z.array(SourceIdSchema),
  name: z.string().min(1),
  name_variants: z.array(z.string()),
  committee_type: CommitteeTypeEnum,
  designation: z.string().nullable(),
  jurisdiction: z.string().nullable(),
  treasurer: z.string().nullable(),
  associated_candidate_id: z.string().uuid().nullable(),
  filing_frequency: z.string().nullable(),
  active_from: z.string().nullable(),
  active_to: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Committee = z.infer<typeof CommitteeSchema>;

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  source_ids: z.array(SourceIdSchema),
  name: z.string().min(1),
  name_variants: z.array(z.string()),
  org_type: OrgTypeEnum,
  sector_id: z.string().uuid().nullable(),
  industry: z.string().nullable(),
  parent_org_id: z.string().uuid().nullable(),
  jurisdiction: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const BillSchema = z.object({
  id: z.string().uuid(),
  source_ids: z.array(SourceIdSchema),
  title: z.string().min(1),
  short_title: z.string().nullable(),
  bill_number: z.string().min(1),
  session: z.string().min(1),
  chamber: ChamberEnum,
  status: z.string().nullable(),
  introduced_date: z.string().nullable(),
  sponsors: z.array(z.string().uuid()),
  committee_referrals: z.array(z.string().uuid()),
  subjects: z.array(z.string()),
  full_text_ref: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Bill = z.infer<typeof BillSchema>;

export const SectorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  parent_sector_id: z.string().uuid().nullable(),
  description: z.string().nullable(),
});
export type Sector = z.infer<typeof SectorSchema>;

// ============================================================
// RELATIONSHIP SCHEMAS
// ============================================================

export const DonationSchema = z.object({
  id: z.string().uuid(),
  source_entity_id: z.string().uuid(),
  source_entity_type: SourceEntityTypeEnum,
  destination_entity_id: z.string().uuid(),
  amount: z.number().nonnegative(),
  transaction_date: z.string(),
  election_cycle: z.string(),
  transaction_type: z.string().nullable(),
  fec_transaction_type: z.string().nullable(),
  is_memo: z.boolean(),
  filing_id: z.string().nullable(),
  amendment_chain: z.array(AmendmentChainEntrySchema),
  source_system: z.string(),
  source_record_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Donation = z.infer<typeof DonationSchema>;

export const LobbyingEngagementSchema = z.object({
  id: z.string().uuid(),
  registrant_org_id: z.string().uuid(),
  client_org_id: z.string().uuid(),
  lobbyist_person_ids: z.array(z.string().uuid()),
  issues: z.array(z.string()),
  specific_issues: z.string().nullable(),
  covered_agencies: z.array(z.string()),
  covered_bill_ids: z.array(z.string().uuid()),
  income: z.number().nullable(),
  expenses: z.number().nullable(),
  period_start: z.string(),
  period_end: z.string(),
  filing_id: z.string().nullable(),
  source_system: z.string(),
  source_record_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type LobbyingEngagement = z.infer<typeof LobbyingEngagementSchema>;

export const VoteSchema = z.object({
  id: z.string().uuid(),
  person_id: z.string().uuid(),
  bill_id: z.string().uuid(),
  vote_cast: VoteCastEnum,
  vote_date: z.string(),
  roll_call_number: z.string().nullable(),
  session: z.string(),
  chamber: ChamberEnum,
  source_system: z.string(),
  source_record_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Vote = z.infer<typeof VoteSchema>;

export const AffiliationSchema = z.object({
  id: z.string().uuid(),
  source_entity_id: z.string().uuid(),
  source_entity_type: SourceEntityTypeEnum,
  target_entity_id: z.string().uuid(),
  target_entity_type: SourceEntityTypeEnum,
  affiliation_type: AffiliationTypeEnum,
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  source_system: z.string().nullable(),
  source_record_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Affiliation = z.infer<typeof AffiliationSchema>;

// ============================================================
// ENTITY RESOLUTION LOG
// ============================================================

export const EntityResolutionLogSchema = z.object({
  id: z.string().uuid(),
  operation: z.enum(['merge', 'split']),
  entity_type: SourceEntityTypeEnum,
  source_ids: z.array(z.string().uuid()),
  target_id: z.string().uuid(),
  reason: z.string().nullable(),
  score: z.number().nullable(),
  created_at: z.string(),
});
export type EntityResolutionLog = z.infer<typeof EntityResolutionLogSchema>;

// ============================================================
// API ENVELOPE SCHEMAS
// ============================================================

export const PaginationMetaSchema = z.object({
  request_id: z.string().uuid(),
  timestamp: z.string(),
  data_snapshot: z.string().nullable(),
  query_params: z.record(z.unknown()).optional(),
  total_count: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive(),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: PaginationMetaSchema,
  });

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string().uuid(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ============================================================
// SEARCH RESULT SCHEMA
// ============================================================

export const SearchResultSchema = z.object({
  id: z.string().uuid(),
  entity_type: z.string(),
  canonical_name: z.string(),
  name_variants: z.array(z.string()).optional(),
  jurisdiction: z.string().optional(),
  party: z.string().nullable().optional(),
  roles: z.array(RoleSchema).optional(),
  relevance_score: z.number(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

// ============================================================
// P2P CHANGELOG EVENT SCHEMA
// ============================================================

export const ChangelogEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  timestamp: z.string(),
  operation: z.enum(['upsert', 'delete', 'merge', 'split']),
  feed: z.string(),
  key: z.string(),
  entity_type: z.string(),
  entity_id: z.string().uuid(),
  version: z.number().int().positive(),
  source: z.string(),
  batch_id: z.string().uuid(),
});
export type ChangelogEvent = z.infer<typeof ChangelogEventSchema>;

// ============================================================
// QUERY PARAMETER VALIDATION
// ============================================================

export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  type: z.enum(['person', 'committee', 'organization', 'bill']).optional(),
  jurisdiction: z.string().max(50).optional(),
  sector: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const DateRangeFilterSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const DonationFilterSchema = PaginationQuerySchema.extend({
  direction: z.enum(['received', 'given']).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  min_amount: z.coerce.number().nonnegative().optional(),
  max_amount: z.coerce.number().nonnegative().optional(),
  sector: z.string().optional(),
});
export type DonationFilter = z.infer<typeof DonationFilterSchema>;

export const GraphQuerySchema = z.object({
  entity_id: z.string().uuid().optional(),
  sector: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  min_amount: z.coerce.number().nonnegative().optional(),
  edge_types: z.array(z.string()).optional(),
  jurisdiction: z.string().optional(),
  max_nodes: z.coerce.number().int().positive().max(500).default(100),
});
export type GraphQuery = z.infer<typeof GraphQuerySchema>;

// ============================================================
// AI QUERY & AUDIT LOG SCHEMAS
// ============================================================

export const AIQueryResultSchema = z.object({
  cypher: z.string(),
  parameters: z.record(z.unknown()).optional(),
  explanation: z.string().optional(),
});
export type AIQueryResult = z.infer<typeof AIQueryResultSchema>;

export const ClientInfoSchema = z.object({
  user_agent: z.string(),
  session_id: z.string(),
});
export type ClientInfo = z.infer<typeof ClientInfoSchema>;

export const AuditLogEntrySchema = z.object({
  id: z.string().uuid().optional(),
  timestamp: z.string().optional(),
  natural_language_query: z.string().min(1).max(2000),
  generated_query: z.string().max(5000),
  query_params: z.record(z.unknown()).optional(),
  model_id: z.string().max(100),
  model_version: z.string().max(50),
  result_count: z.number().int().nonnegative().optional(),
  client_info: ClientInfoSchema.optional(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const AuditLogQuerySchema = PaginationQuerySchema.extend({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
