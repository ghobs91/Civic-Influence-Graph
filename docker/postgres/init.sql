-- Civic Influence Graph — PostgreSQL Schema Initialization
-- Requires PostgreSQL 16 with Apache AGE extension

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS age;

-- Set search path to include ag_catalog for AGE functions
SET search_path = ag_catalog, "$user", public;

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE entity_type AS ENUM (
  'legislator', 'donor', 'lobbyist', 'executive', 'other'
);

CREATE TYPE committee_type AS ENUM (
  'candidate', 'pac', 'super_pac', 'party', 'joint_fundraising', 'other'
);

CREATE TYPE org_type AS ENUM (
  'corporation', 'nonprofit', 'trade_association', 'lobbying_firm', 'union', 'other'
);

CREATE TYPE chamber AS ENUM (
  'house', 'senate', 'joint'
);

CREATE TYPE vote_cast AS ENUM (
  'yea', 'nay', 'present', 'not_voting'
);

CREATE TYPE source_entity_type AS ENUM (
  'person', 'committee', 'organization'
);

CREATE TYPE affiliation_type AS ENUM (
  'employment', 'board_member', 'subsidiary', 'joint_fundraising', 'leadership_pac', 'other'
);

-- ============================================================
-- ENTITY TABLES
-- ============================================================

CREATE TABLE sector (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  code          TEXT UNIQUE NOT NULL,
  parent_sector_id UUID REFERENCES sector(id),
  description   TEXT
);

CREATE TABLE person (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_ids            JSONB NOT NULL DEFAULT '[]',
  canonical_name        TEXT NOT NULL CHECK (canonical_name <> ''),
  name_variants         TEXT[] NOT NULL DEFAULT '{}',
  entity_type           entity_type NOT NULL DEFAULT 'other',
  party                 TEXT,
  jurisdictions         TEXT[] NOT NULL DEFAULT '{}',
  roles                 JSONB NOT NULL DEFAULT '[]',
  committee_memberships JSONB NOT NULL DEFAULT '[]',
  employer              TEXT,
  occupation            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  merge_history         JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE committee (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_ids              JSONB NOT NULL DEFAULT '[]',
  name                    TEXT NOT NULL,
  name_variants           TEXT[] NOT NULL DEFAULT '{}',
  committee_type          committee_type NOT NULL DEFAULT 'other',
  designation             TEXT,
  jurisdiction            TEXT,
  treasurer               TEXT,
  associated_candidate_id UUID REFERENCES person(id),
  filing_frequency        TEXT,
  active_from             DATE,
  active_to               DATE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT committee_active_range CHECK (active_to IS NULL OR active_from IS NULL OR active_to >= active_from)
);

CREATE TABLE organization (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_ids      JSONB NOT NULL DEFAULT '[]',
  name            TEXT NOT NULL,
  name_variants   TEXT[] NOT NULL DEFAULT '{}',
  org_type        org_type NOT NULL DEFAULT 'other',
  sector_id       UUID REFERENCES sector(id),
  industry        TEXT,
  parent_org_id   UUID REFERENCES organization(id),
  jurisdiction    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bill (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_ids          JSONB NOT NULL DEFAULT '[]',
  title               TEXT NOT NULL,
  short_title         TEXT,
  bill_number         TEXT NOT NULL,
  session             TEXT NOT NULL,
  chamber             chamber NOT NULL,
  status              TEXT,
  introduced_date     DATE,
  sponsors            UUID[] NOT NULL DEFAULT '{}',
  committee_referrals UUID[] NOT NULL DEFAULT '{}',
  subjects            TEXT[] NOT NULL DEFAULT '{}',
  full_text_ref       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RELATIONSHIP TABLES
-- ============================================================

CREATE TABLE donation (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_entity_id      UUID NOT NULL,
  source_entity_type    source_entity_type NOT NULL,
  destination_entity_id UUID NOT NULL,
  amount                NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  transaction_date      DATE NOT NULL,
  election_cycle        TEXT NOT NULL,
  transaction_type      TEXT,
  fec_transaction_type  TEXT,
  is_memo               BOOLEAN NOT NULL DEFAULT false,
  filing_id             TEXT,
  amendment_chain       JSONB NOT NULL DEFAULT '[]',
  source_system         TEXT NOT NULL,
  source_record_id      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lobbying_engagement (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registrant_org_id   UUID NOT NULL REFERENCES organization(id),
  client_org_id       UUID NOT NULL REFERENCES organization(id),
  lobbyist_person_ids UUID[] NOT NULL DEFAULT '{}',
  issues              TEXT[] NOT NULL DEFAULT '{}',
  specific_issues     TEXT,
  covered_agencies    TEXT[] NOT NULL DEFAULT '{}',
  covered_bill_ids    UUID[] NOT NULL DEFAULT '{}',
  income              NUMERIC(15,2),
  expenses            NUMERIC(15,2),
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  filing_id           TEXT,
  source_system       TEXT NOT NULL,
  source_record_id    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lobbying_period_valid CHECK (period_end >= period_start)
);

CREATE TABLE vote (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id        UUID NOT NULL REFERENCES person(id),
  bill_id          UUID NOT NULL REFERENCES bill(id),
  vote_cast        vote_cast NOT NULL,
  vote_date        DATE NOT NULL,
  roll_call_number TEXT,
  session          TEXT NOT NULL,
  chamber          chamber NOT NULL,
  source_system    TEXT NOT NULL,
  source_record_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE affiliation (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_entity_id   UUID NOT NULL,
  source_entity_type source_entity_type NOT NULL,
  target_entity_id   UUID NOT NULL,
  target_entity_type source_entity_type NOT NULL,
  affiliation_type   affiliation_type NOT NULL DEFAULT 'other',
  start_date         DATE,
  end_date           DATE,
  source_system      TEXT,
  source_record_id   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Entity resolution audit log
CREATE TABLE entity_resolution_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation     TEXT NOT NULL CHECK (operation IN ('merge', 'split')),
  entity_type   source_entity_type NOT NULL,
  source_ids    UUID[] NOT NULL,
  target_id     UUID NOT NULL,
  reason        TEXT,
  score         NUMERIC(5,4),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Person indexes
CREATE INDEX idx_person_canonical_name ON person USING gin (to_tsvector('english', canonical_name));
CREATE INDEX idx_person_entity_type ON person (entity_type);
CREATE INDEX idx_person_jurisdictions ON person USING gin (jurisdictions);
CREATE INDEX idx_person_party ON person (party) WHERE party IS NOT NULL;
CREATE INDEX idx_person_source_ids ON person USING gin (source_ids jsonb_path_ops);

-- Committee indexes
CREATE INDEX idx_committee_name ON committee USING gin (to_tsvector('english', name));
CREATE INDEX idx_committee_type ON committee (committee_type);
CREATE INDEX idx_committee_jurisdiction ON committee (jurisdiction);
CREATE INDEX idx_committee_candidate ON committee (associated_candidate_id) WHERE associated_candidate_id IS NOT NULL;
CREATE INDEX idx_committee_source_ids ON committee USING gin (source_ids jsonb_path_ops);

-- Organization indexes
CREATE INDEX idx_organization_name ON organization USING gin (to_tsvector('english', name));
CREATE INDEX idx_organization_type ON organization (org_type);
CREATE INDEX idx_organization_sector ON organization (sector_id) WHERE sector_id IS NOT NULL;
CREATE INDEX idx_organization_source_ids ON organization USING gin (source_ids jsonb_path_ops);

-- Bill indexes
CREATE INDEX idx_bill_number ON bill (bill_number);
CREATE INDEX idx_bill_session ON bill (session);
CREATE INDEX idx_bill_chamber ON bill (chamber);
CREATE INDEX idx_bill_status ON bill (status);
CREATE INDEX idx_bill_introduced ON bill (introduced_date);
CREATE INDEX idx_bill_source_ids ON bill USING gin (source_ids jsonb_path_ops);

-- Donation indexes
CREATE INDEX idx_donation_source ON donation (source_entity_id);
CREATE INDEX idx_donation_destination ON donation (destination_entity_id);
CREATE INDEX idx_donation_date ON donation (transaction_date);
CREATE INDEX idx_donation_cycle ON donation (election_cycle);
CREATE INDEX idx_donation_type ON donation (source_entity_type);
CREATE INDEX idx_donation_source_system ON donation (source_system);
CREATE INDEX idx_donation_filing ON donation (filing_id) WHERE filing_id IS NOT NULL;
CREATE INDEX idx_donation_memo ON donation (is_memo) WHERE is_memo = true;

-- Lobbying indexes
CREATE INDEX idx_lobbying_registrant ON lobbying_engagement (registrant_org_id);
CREATE INDEX idx_lobbying_client ON lobbying_engagement (client_org_id);
CREATE INDEX idx_lobbying_period ON lobbying_engagement (period_start, period_end);
CREATE INDEX idx_lobbying_issues ON lobbying_engagement USING gin (issues);
CREATE INDEX idx_lobbying_source_system ON lobbying_engagement (source_system);

-- Vote indexes
CREATE INDEX idx_vote_person ON vote (person_id);
CREATE INDEX idx_vote_bill ON vote (bill_id);
CREATE INDEX idx_vote_date ON vote (vote_date);
CREATE INDEX idx_vote_session ON vote (session);
CREATE INDEX idx_vote_chamber ON vote (chamber);

-- Affiliation indexes
CREATE INDEX idx_affiliation_source ON affiliation (source_entity_id);
CREATE INDEX idx_affiliation_target ON affiliation (target_entity_id);
CREATE INDEX idx_affiliation_type ON affiliation (affiliation_type);

-- Entity resolution log indexes
CREATE INDEX idx_resolution_log_target ON entity_resolution_log (target_id);
CREATE INDEX idx_resolution_log_created ON entity_resolution_log (created_at);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_person_updated_at BEFORE UPDATE ON person
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_committee_updated_at BEFORE UPDATE ON committee
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_organization_updated_at BEFORE UPDATE ON organization
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_bill_updated_at BEFORE UPDATE ON bill
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_donation_updated_at BEFORE UPDATE ON donation
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_lobbying_updated_at BEFORE UPDATE ON lobbying_engagement
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_vote_updated_at BEFORE UPDATE ON vote
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_affiliation_updated_at BEFORE UPDATE ON affiliation
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- AI Audit Log
-- ============================================================

CREATE TABLE ai_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  natural_language_query TEXT NOT NULL,
  generated_query TEXT NOT NULL,
  query_params JSONB,
  model_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  result_count INT,
  client_info JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_audit_timestamp ON ai_audit_log (timestamp DESC);

-- ============================================================
-- Saved Queries
-- ============================================================

CREATE TABLE saved_query (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  query_type TEXT NOT NULL CHECK (query_type IN ('graph', 'search', 'table')),
  query_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_saved_query_updated_at BEFORE UPDATE ON saved_query
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
