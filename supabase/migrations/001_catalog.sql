-- Ready Equipment Product Catalog
-- Run this in your Supabase SQL editor

-- -------------------------------------------------------
-- Products table: one row per unique Make + Model
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  make               TEXT NOT NULL,
  model              TEXT NOT NULL,
  display_name       TEXT,
  slug               TEXT UNIQUE,

  -- Content (AI-populated in Session 3)
  description        TEXT,
  short_description  TEXT,
  specs              JSONB DEFAULT '{}',
  features           TEXT[] DEFAULT '{}',

  -- Taxonomy
  category           TEXT NOT NULL,
  tags               TEXT[] DEFAULT '{}',

  -- Inventory (updated weekly via CSV refresh)
  units_available    INTEGER DEFAULT 0,
  units_on_order     INTEGER DEFAULT 0,
  availability       TEXT DEFAULT 'available_to_order',

  -- Pricing
  list_price_cents   INTEGER DEFAULT 0,

  -- Condition
  condition          TEXT DEFAULT 'New',

  -- Source
  source             TEXT DEFAULT 'inventory',

  -- Media
  image_url          TEXT,
  images             TEXT[] DEFAULT '{}',

  -- Flags
  is_featured        BOOLEAN DEFAULT FALSE,
  is_active          BOOLEAN DEFAULT TRUE,
  enriched_at        TIMESTAMPTZ,

  -- Timestamps
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Import log: track every CSV refresh run
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_at  TIMESTAMPTZ DEFAULT NOW(),
  filename     TEXT,
  rows_total   INTEGER,
  rows_created INTEGER,
  rows_updated INTEGER,
  rows_skipped INTEGER,
  notes        TEXT
);

-- -------------------------------------------------------
-- Indexes
-- -------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS products_make_model_idx  ON products (LOWER(make), LOWER(model));
CREATE INDEX IF NOT EXISTS products_category_idx           ON products (category);
CREATE INDEX IF NOT EXISTS products_make_idx               ON products (make);
CREATE INDEX IF NOT EXISTS products_availability_idx       ON products (availability);
CREATE INDEX IF NOT EXISTS products_is_active_idx          ON products (is_active);
CREATE INDEX IF NOT EXISTS products_slug_idx               ON products (slug);

CREATE INDEX IF NOT EXISTS products_fts_idx ON products
  USING gin(to_tsvector('english',
    COALESCE(make, '') || ' ' ||
    COALESCE(model, '') || ' ' ||
    COALESCE(display_name, '') || ' ' ||
    COALESCE(description, '')
  ));

-- -------------------------------------------------------
-- Auto-update updated_at
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- Row Level Security (after both tables exist)
-- -------------------------------------------------------
ALTER TABLE products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active products"
  ON products FOR SELECT
  USING (is_active = true);
