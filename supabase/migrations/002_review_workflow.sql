-- Phase 0 — schema migration for AI-grounded enrichment + human review workflow.
--
-- Changes:
--   1. Rename products.model → products.part_number (+ rename related indexes)
--   2. Add review-workflow columns to products
--   3. Backfill review_status='enriched' for rows that already have AI content
--   4. Add manufacturer_brands lookup table (with aliases for brand-name variants)
--   5. Rebuild FTS index to include the new `series` column
--
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard → SQL Editor → New query.
-- Safe to re-run (idempotent — uses IF NOT EXISTS / ON CONFLICT).
--
-- ⚠️  DEPLOY ORDERING: this migration renames `products.model` to
--     `products.part_number`. The TypeScript code in this same commit
--     expects the new column name. To avoid a brief window where the
--     catalog renders empty model numbers, run this migration as soon
--     as the Vercel deploy goes live (or vice versa, before pushing —
--     see the README for the recommended timing).

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1. Rename products.model → products.part_number
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE products RENAME COLUMN model TO part_number;

-- Index references the column by ID internally, so the rename propagates
-- automatically. We just rename the index for clarity.
ALTER INDEX IF EXISTS products_make_model_idx RENAME TO products_make_part_number_idx;

-- ────────────────────────────────────────────────────────────────────
-- 2. Add review-workflow + enrichment-audit columns
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS series              TEXT,
  ADD COLUMN IF NOT EXISTS review_status       TEXT    NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS source_url          TEXT,
  ADD COLUMN IF NOT EXISTS source_snapshot     TEXT,
  ADD COLUMN IF NOT EXISTS human_edited_fields TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS approved_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by         TEXT,
  ADD COLUMN IF NOT EXISTS enrichment_log      JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS legacy_slugs        TEXT[]  NOT NULL DEFAULT '{}';

-- Constrain review_status to known values
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_review_status_check;
ALTER TABLE products ADD CONSTRAINT products_review_status_check
  CHECK (review_status IN ('unreviewed', 'enriched', 'approved', 'flagged', 'rejected'));

CREATE INDEX IF NOT EXISTS products_review_status_idx ON products (review_status);
CREATE INDEX IF NOT EXISTS products_legacy_slugs_idx  ON products USING GIN (legacy_slugs);

-- ────────────────────────────────────────────────────────────────────
-- 3. Rebuild FTS index to include `series` (and use the new column name)
-- ────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS products_fts_idx;
CREATE INDEX products_fts_idx ON products
  USING gin(to_tsvector('english',
    COALESCE(make, '')         || ' ' ||
    COALESCE(part_number, '')  || ' ' ||
    COALESCE(series, '')       || ' ' ||
    COALESCE(display_name, '') || ' ' ||
    COALESCE(description, '')
  ));

-- ────────────────────────────────────────────────────────────────────
-- 4. Backfill: rows that already have AI content → 'enriched'
--    so they surface in the review queue for cleanup but stay live
--    (is_active stays true; the catalog doesn't go dark).
-- ────────────────────────────────────────────────────────────────────
UPDATE products
SET review_status = 'enriched'
WHERE enriched_at IS NOT NULL
  AND review_status = 'unreviewed';

-- ────────────────────────────────────────────────────────────────────
-- 5. manufacturer_brands lookup table
--    - `domain` is the official site we'll restrict web_search to
--    - `aliases` maps catalog-inconsistent brand names (e.g.
--      "Greenworks North America") to the canonical brand entry
--    - `search_template` is an optional override for unusual cases
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manufacturer_brands (
  brand            TEXT PRIMARY KEY,
  domain           TEXT NOT NULL,
  aliases          TEXT[] NOT NULL DEFAULT '{}',
  search_template  TEXT,
  notes            TEXT,
  added_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS manufacturer_brands_updated_at ON manufacturer_brands;
CREATE TRIGGER manufacturer_brands_updated_at
  BEFORE UPDATE ON manufacturer_brands
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE manufacturer_brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view brands" ON manufacturer_brands;
CREATE POLICY "Public can view brands"
  ON manufacturer_brands FOR SELECT USING (true);

-- Seed: brands from next.config.js image allowlist + off-seed brands
-- discovered during v1.2-v1.4 prompt testing. Aliases map the catalog's
-- inconsistent brand strings to the canonical brand entry.
INSERT INTO manufacturer_brands (brand, domain, aliases) VALUES
  ('Husqvarna',     'husqvarna.com',          '{}'),
  ('Echo',          'echo-usa.com',           '{}'),
  ('Toro',          'toro.com',               '{}'),
  ('Kress',         'kress.com',              '{}'),
  ('Ferris',        'ferrisindustries.com',   '{}'),
  ('Exmark',        'exmark.com',             '{}'),
  ('Generac',       'generac.com',            '{}'),
  ('Wacker Neuson', 'wackerneuson.com',       '{}'),
  ('Makita',        'makitatools.com',        '{}'),
  ('Billy Goat',    'billygoat.com',          '{}'),
  ('Greenworks',    'greenworkstools.com',    ARRAY['Greenworks North America', 'Greenworks Commercial']),
  ('LB White',      'lbwhite.com',            ARRAY['LB WHITE', 'L.B. White', 'LB WHITE INC']),
  ('Tsurumi',       'tsurumipump.com',        ARRAY['Tsurumi Pump']),
  ('Multiquip',     'multiquip.com',          ARRAY['MULTIQUIP INC.', 'MULTIQUIP']),
  ('Mean Green',    'meangreenproducts.com',  '{}')
ON CONFLICT (brand) DO NOTHING;

COMMIT;
