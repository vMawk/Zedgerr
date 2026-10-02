-- Phase 4: dubbel boekhouden — rekeningschema, journaalposten, boekhoudperioden.
--
-- Ontwerp:
--   chart_of_accounts     — hiërarchisch rekeningschema per user
--   accounting_periods    — boekhoudperioden per user (maand/kwartaal/jaar)
--   journal_entries       — journaalpost-headers
--   journal_entry_lines   — regels (debet/credit, altijd gesaldeerd)
--
-- Bedragen in INTEGER cents (geen REAL floating-point problemen).
-- is_system = 1: standaard NL-rekeningen die niet verwijderd kunnen worden.

CREATE TABLE chart_of_accounts (
  id              TEXT PRIMARY KEY NOT NULL,
  user_id         TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  name            TEXT NOT NULL,
  account_type    TEXT NOT NULL CHECK(account_type IN ('assets','liabilities','equity','revenue','expenses')),
  parent_id       TEXT REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  is_system       INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  description     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_coa_user_number ON chart_of_accounts(user_id, account_number);
CREATE INDEX        idx_coa_user        ON chart_of_accounts(user_id);

-- ── Boekhoudperioden ──────────────────────────────────────────────────────────
CREATE TABLE accounting_periods (
  id          TEXT PRIMARY KEY NOT NULL,
  user_id     TEXT NOT NULL,
  year        INTEGER NOT NULL,
  period      INTEGER NOT NULL,   -- 1-12 (maand) of 1-4 (kwartaal)
  period_type TEXT NOT NULL DEFAULT 'month' CHECK(period_type IN ('month','quarter','year')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','locked')),
  starts_on   TEXT NOT NULL,
  ends_on     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_periods_user_year_period ON accounting_periods(user_id, year, period, period_type);
CREATE INDEX        idx_periods_user              ON accounting_periods(user_id);

-- ── Journaalposten ────────────────────────────────────────────────────────────
CREATE TABLE journal_entries (
  id           TEXT PRIMARY KEY NOT NULL,
  user_id      TEXT NOT NULL,
  period_id    TEXT REFERENCES accounting_periods(id) ON DELETE SET NULL,
  entry_date   TEXT NOT NULL,
  description  TEXT NOT NULL,
  reference    TEXT,                      -- bijv. factuur-id of uitgave-id
  reference_type TEXT,                   -- 'invoice','expense','bank_transaction'
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_journal_entries_user       ON journal_entries(user_id, entry_date);
CREATE INDEX idx_journal_entries_reference  ON journal_entries(reference_type, reference);
CREATE INDEX idx_journal_entries_period     ON journal_entries(period_id);

-- ── Journaalpost-regels ───────────────────────────────────────────────────────
CREATE TABLE journal_entry_lines (
  id               TEXT PRIMARY KEY NOT NULL,
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id       TEXT NOT NULL REFERENCES chart_of_accounts(id),
  debit_cents      INTEGER NOT NULL DEFAULT 0,
  credit_cents     INTEGER NOT NULL DEFAULT 0,
  description      TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_jel_entry   ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_jel_account ON journal_entry_lines(account_id);

-- ── Standaard NL rekeningschema (per user aangemaakt bij registratie) ─────────
-- Seeding via worker/index.ts seedDefaultChartOfAccounts(); hier alleen structuur.
