-- ==============================================================================
-- WRR migration 001 (PRD v1.4.0, FR-03): a photo of the waste on each pickup request.
-- Run once on a database created before this change (e.g. an existing wrr_db).
-- New databases built from schema.sql already have the column.
-- ==============================================================================
USE wrr_db;
ALTER TABLE pickup_requests
  ADD COLUMN photo_path VARCHAR(64) NULL AFTER other_description;
