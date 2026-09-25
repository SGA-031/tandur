-- Tandur operator schema. On-chain is the source of truth for balances and events;
-- these tables hold PII (vault), documents, and indexed/derived data for Lumbung.

CREATE TABLE IF NOT EXISTS farmers (
  id            TEXT PRIMARY KEY,                 -- e.g. F-000123
  pseudo_id     TEXT UNIQUE NOT NULL,             -- sha256(salt||NIK), also on-chain (bytes32)
  nik_hash      TEXT UNIQUE NOT NULL,             -- lookup key for KTP-based login (sha256(pepper||NIK))
  nik_masked    TEXT NOT NULL,                    -- 3301********0001
  name          TEXT NOT NULL,
  phone         TEXT,
  village       TEXT NOT NULL,
  district      TEXT NOT NULL,
  regency       TEXT NOT NULL,
  province      TEXT NOT NULL,
  region_code   TEXT NOT NULL,                    -- "33.10.05"
  land_ha       NUMERIC(6,2) NOT NULL DEFAULT 0,
  commodity     TEXT NOT NULL DEFAULT 'padi',
  address       TEXT UNIQUE NOT NULL,             -- on-chain account
  enc_key       TEXT NOT NULL,                    -- private key encrypted with KEK(VAULT_SECRET, pin)
  pin_hash      TEXT NOT NULL,
  device_id     TEXT,
  status        TEXT NOT NULL DEFAULT 'active',   -- active | frozen
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchants (
  id            TEXT PRIMARY KEY,                 -- KDMP-3310-001
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL,                    -- kdmp | kios | distributor
  city          TEXT NOT NULL,
  district      TEXT NOT NULL,
  regency       TEXT NOT NULL,
  province      TEXT NOT NULL,
  region_code   TEXT NOT NULL,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  address       TEXT UNIQUE NOT NULL,             -- on-chain account
  enc_key       TEXT NOT NULL,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  bank_account  TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admins (
  username      TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'ministry'  -- ministry | operator | auditor
);

CREATE TABLE IF NOT EXISTS products (
  sku           TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  brand         TEXT,
  category      TEXT NOT NULL,                    -- PUPUK | BENIH | ALSINTAN | PESTISIDA
  unit          TEXT NOT NULL,
  het_price     BIGINT NOT NULL,                  -- Harga Eceran Tertinggi (ceiling), IDR
  active        BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS voucher_types (
  type_id       INTEGER PRIMARY KEY,              -- on-chain id
  category      TEXT NOT NULL,
  season        TEXT NOT NULL,
  valid_from    TIMESTAMPTZ NOT NULL,
  valid_until   TIMESTAMPTZ NOT NULL,
  per_farmer_cap BIGINT NOT NULL,
  tx_hash       TEXT
);

CREATE TABLE IF NOT EXISTS allocations (
  id            TEXT PRIMARY KEY,                 -- ALLOC-2026-MT1-001
  title         TEXT NOT NULL,
  type_id       INTEGER NOT NULL REFERENCES voucher_types(type_id),
  farmer_count  INTEGER NOT NULL,
  total_amount  BIGINT NOT NULL,
  tx_hashes     TEXT[] NOT NULL DEFAULT '{}',
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT PRIMARY KEY,                 -- uuid
  invoice_no    TEXT UNIQUE NOT NULL,
  merchant_id   TEXT NOT NULL REFERENCES merchants(id),
  farmer_id     TEXT REFERENCES farmers(id),
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | expired | cancelled | failed
  mode          TEXT NOT NULL DEFAULT 'scan',     -- scan | assisted
  lines         JSONB NOT NULL,
  category_totals JSONB NOT NULL,
  total         BIGINT NOT NULL,
  document      JSONB,                            -- canonical InvoiceDocument (after farmer is known)
  hash          TEXT,                             -- sha256 of canonical document; on-chain
  doc_path      TEXT,                             -- content-addressed file in STORAGE_DIR
  tx_hash       TEXT,
  block_number  INTEGER,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at       TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  payout_id     TEXT                              -- settlement batch that paid the merchant for this invoice
);
CREATE INDEX IF NOT EXISTS invoices_merchant_idx ON invoices(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_farmer_idx ON invoices(farmer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);

-- Every contract event, indexed from the chain. This is the audit trail Lumbung reads.
CREATE TABLE IF NOT EXISTS chain_events (
  id            BIGSERIAL PRIMARY KEY,
  block_number  INTEGER NOT NULL,
  block_time    TIMESTAMPTZ NOT NULL,
  tx_hash       TEXT NOT NULL,
  log_index     INTEGER NOT NULL,
  contract      TEXT NOT NULL,                    -- voucher | registry
  name          TEXT NOT NULL,                    -- Issued | Spent | Redeemed | ...
  args          JSONB NOT NULL,
  UNIQUE (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS chain_events_name_idx ON chain_events(name, block_number DESC);

CREATE TABLE IF NOT EXISTS indexer_state (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payouts (
  id            TEXT PRIMARY KEY,                 -- PAYOUT-20260926-001
  merchant_id   TEXT NOT NULL REFERENCES merchants(id),
  amount        BIGINT NOT NULL,
  by_type       JSONB NOT NULL,
  tx_hashes     TEXT[] NOT NULL DEFAULT '{}',
  bank_ref      TEXT,
  status        TEXT NOT NULL DEFAULT 'settled',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fraud_alerts (
  id            BIGSERIAL PRIMARY KEY,
  severity      TEXT NOT NULL,                    -- info | warning | serious | critical
  rule          TEXT NOT NULL,
  subject_kind  TEXT NOT NULL,                    -- merchant | farmer | invoice
  subject_id    TEXT NOT NULL,
  detail        TEXT NOT NULL,
  evidence      JSONB,
  status        TEXT NOT NULL DEFAULT 'open',     -- open | reviewing | closed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rule, subject_kind, subject_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id            BIGSERIAL PRIMARY KEY,
  farmer_id     TEXT NOT NULL REFERENCES farmers(id),
  channel       TEXT NOT NULL DEFAULT 'sms',
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor         TEXT NOT NULL,
  action        TEXT NOT NULL,
  target        TEXT,
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Atomic per-merchant, per-day invoice numbering.
CREATE TABLE IF NOT EXISTS invoice_counters (
  merchant_id   TEXT NOT NULL,
  day           TEXT NOT NULL,
  n             INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant_id, day)
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payout_id TEXT;
