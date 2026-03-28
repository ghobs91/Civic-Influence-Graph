-- ============================================================
-- Performance Indexes and Table Partitioning (T082)
-- Run after initial schema creation (init.sql)
-- ============================================================

-- ============================================================
-- PERSON INDEXES
-- ============================================================

-- Speed up name-based lookups
CREATE INDEX IF NOT EXISTS idx_person_canonical_name
  ON person (canonical_name);

CREATE INDEX IF NOT EXISTS idx_person_canonical_name_trgm
  ON person USING gin (canonical_name gin_trgm_ops);

-- Speed up jurisdiction filtering
CREATE INDEX IF NOT EXISTS idx_person_jurisdictions
  ON person USING gin (jurisdictions);

-- Speed up party filtering
CREATE INDEX IF NOT EXISTS idx_person_party
  ON person (party) WHERE party IS NOT NULL;

-- ============================================================
-- COMMITTEE INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_committee_name
  ON committee (name);

CREATE INDEX IF NOT EXISTS idx_committee_type
  ON committee (committee_type);

CREATE INDEX IF NOT EXISTS idx_committee_jurisdiction
  ON committee (jurisdiction) WHERE jurisdiction IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_committee_associated_candidate
  ON committee (associated_candidate_id) WHERE associated_candidate_id IS NOT NULL;

-- ============================================================
-- ORGANIZATION INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_organization_name
  ON organization (name);

CREATE INDEX IF NOT EXISTS idx_organization_sector
  ON organization (sector_id) WHERE sector_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organization_type
  ON organization (org_type);

-- ============================================================
-- DONATION INDEXES (highest-volume table)
-- ============================================================

-- Core lookup indexes
CREATE INDEX IF NOT EXISTS idx_donation_source_entity
  ON donation (source_entity_id);

CREATE INDEX IF NOT EXISTS idx_donation_destination_entity
  ON donation (destination_entity_id);

-- Date-based filtering
CREATE INDEX IF NOT EXISTS idx_donation_transaction_date
  ON donation (transaction_date);

-- Election cycle filtering
CREATE INDEX IF NOT EXISTS idx_donation_election_cycle
  ON donation (election_cycle);

-- Amount range queries
CREATE INDEX IF NOT EXISTS idx_donation_amount
  ON donation (amount);

-- Composite index for common dashboard queries
CREATE INDEX IF NOT EXISTS idx_donation_dest_date
  ON donation (destination_entity_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_donation_source_date
  ON donation (source_entity_id, transaction_date);

-- Filing lookups
CREATE INDEX IF NOT EXISTS idx_donation_filing_id
  ON donation (filing_id) WHERE filing_id IS NOT NULL;

-- ============================================================
-- LOBBYING ENGAGEMENT INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_lobbying_registrant
  ON lobbying_engagement (registrant_org_id);

CREATE INDEX IF NOT EXISTS idx_lobbying_client
  ON lobbying_engagement (client_org_id);

CREATE INDEX IF NOT EXISTS idx_lobbying_period
  ON lobbying_engagement (period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_lobbying_issues
  ON lobbying_engagement USING gin (issues);

-- ============================================================
-- VOTE INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_vote_person
  ON vote (person_id);

CREATE INDEX IF NOT EXISTS idx_vote_bill
  ON vote (bill_id);

CREATE INDEX IF NOT EXISTS idx_vote_date
  ON vote (vote_date);

CREATE INDEX IF NOT EXISTS idx_vote_person_date
  ON vote (person_id, vote_date);

-- ============================================================
-- AFFILIATION INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_affiliation_source
  ON affiliation (source_entity_id);

CREATE INDEX IF NOT EXISTS idx_affiliation_target
  ON affiliation (target_entity_id);

CREATE INDEX IF NOT EXISTS idx_affiliation_type
  ON affiliation (affiliation_type);

-- ============================================================
-- BILL INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_bill_number
  ON bill (bill_number);

CREATE INDEX IF NOT EXISTS idx_bill_session
  ON bill (session);

CREATE INDEX IF NOT EXISTS idx_bill_chamber
  ON bill (chamber);

CREATE INDEX IF NOT EXISTS idx_bill_introduced
  ON bill (introduced_date) WHERE introduced_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bill_sponsors
  ON bill USING gin (sponsors);

CREATE INDEX IF NOT EXISTS idx_bill_subjects
  ON bill USING gin (subjects);

-- ============================================================
-- SECTOR INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_sector_code
  ON sector (code);

CREATE INDEX IF NOT EXISTS idx_sector_parent
  ON sector (parent_sector_id) WHERE parent_sector_id IS NOT NULL;

-- ============================================================
-- SAVED QUERY INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_saved_query_type
  ON saved_query (query_type);

CREATE INDEX IF NOT EXISTS idx_saved_query_created
  ON saved_query (created_at DESC);

-- ============================================================
-- DONATION TABLE PARTITIONING BY ELECTION CYCLE
-- ============================================================
-- Note: Partitioning requires recreating the table. This migration
-- creates a partitioned version and migrates data.
-- Only run this if the donation table has significant data volume.
-- ============================================================

-- Create the partitioned table
CREATE TABLE IF NOT EXISTS donation_partitioned (
  LIKE donation INCLUDING ALL
) PARTITION BY LIST (election_cycle);

-- Create partitions for known election cycles
CREATE TABLE IF NOT EXISTS donation_p2020 PARTITION OF donation_partitioned
  FOR VALUES IN ('2020');
CREATE TABLE IF NOT EXISTS donation_p2022 PARTITION OF donation_partitioned
  FOR VALUES IN ('2022');
CREATE TABLE IF NOT EXISTS donation_p2024 PARTITION OF donation_partitioned
  FOR VALUES IN ('2024');
CREATE TABLE IF NOT EXISTS donation_p2026 PARTITION OF donation_partitioned
  FOR VALUES IN ('2026');
CREATE TABLE IF NOT EXISTS donation_p2028 PARTITION OF donation_partitioned
  FOR VALUES IN ('2028');

-- Default partition for any other cycles
CREATE TABLE IF NOT EXISTS donation_pdefault PARTITION OF donation_partitioned
  DEFAULT;

-- To migrate data (run manually when ready):
-- INSERT INTO donation_partitioned SELECT * FROM donation;
-- ALTER TABLE donation RENAME TO donation_old;
-- ALTER TABLE donation_partitioned RENAME TO donation;
-- DROP TABLE donation_old;  -- after verification
