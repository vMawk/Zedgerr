-- Organizations and role-based access
--
-- For existing users org.id equals users.id (the owner),
-- so no existing user_id column has to change.
-- Team members get a token with org_id set to the owner's user id,
-- so every WHERE user_id = ? query keeps working unchanged.

CREATE TABLE organizations (
  id            TEXT PRIMARY KEY NOT NULL,   -- equals the owner's user_id for existing accounts
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
