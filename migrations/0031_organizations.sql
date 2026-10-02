-- Phase 7: Multi-org + RBAC
--
-- Strategie: voor bestaande gebruikers geldt org.id = users.id (de eigenaar).
-- Daarmee hoeft geen bestaande user_id-kolom te worden gewijzigd.
-- Nieuwe teamleden krijgen een JWT met org_id = de eigenaar-user-id,
-- zodat alle WHERE user_id = ? queries transparant blijven werken.

CREATE TABLE organizations (
  id            TEXT PRIMARY KEY NOT NULL,   -- = owner user_id voor bestaande accounts
  name          TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  plan          TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free','pro','enterprise')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_orgs_owner ON organizations(owner_user_id);

CREATE TABLE organization_members (
  id          TEXT PRIMARY KEY NOT NULL,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member'
              CHECK(role IN ('owner','admin','member','viewer')),
  invited_by  TEXT REFERENCES users(id),
  joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_org  ON organization_members(org_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);

-- Invite tokens (short-lived, single-use)
CREATE TABLE org_invites (
  id          TEXT PRIMARY KEY NOT NULL,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member'
              CHECK(role IN ('admin','member','viewer')),
  token       TEXT NOT NULL UNIQUE,
  invited_by  TEXT NOT NULL REFERENCES users(id),
  accepted_at TEXT,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_org_invites_token ON org_invites(token);
CREATE INDEX idx_org_invites_email ON org_invites(email);
