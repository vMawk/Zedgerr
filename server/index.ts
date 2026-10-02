import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";
import Database from "better-sqlite3";
import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

import { NodeD1Database } from "./adapters/d1.js";
import { NodeR2Bucket } from "./adapters/r2.js";
import { NodeAiAdapter } from "./adapters/ai.js";
import { runMigrations } from "./migrations.js";
import type { AppEnv } from "../api/types.js";

const ROOT = process.cwd();
if (existsSync(join(ROOT, ".env"))) process.loadEnvFile(join(ROOT, ".env"));

const DATA_DIR = resolve(process.env.DATA_DIR ?? join(ROOT, "data"));
const DB_PATH = resolve(process.env.DB_PATH ?? join(DATA_DIR, "app.db"));
const FILES_DIR = resolve(process.env.FILES_DIR ?? join(DATA_DIR, "files"));
const MIGRATIONS_DIR = resolve(process.env.MIGRATIONS_DIR ?? join(ROOT, "migrations"));
const DIST_DIR = resolve(process.env.DIST_DIR ?? join(ROOT, "dist"));
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const TRUST_PROXY = process.env.TRUST_PROXY === "true";

// Without JWT_SECRET a random secret is generated once and kept in the data volume,
// so a plain `docker run` is secure and sessions survive restarts.
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    if (secret.length >= 32) return secret;
    console.error("JWT_SECRET must be at least 32 characters. Remove it to let Zedgerr generate one, or use: openssl rand -hex 32");
    process.exit(1);
  }
  const secretPath = join(DATA_DIR, ".jwt-secret");
  const legacyPath = join(DATA_DIR, ".dev-jwt-secret");
  for (const path of [secretPath, legacyPath]) {
    if (existsSync(path)) return readFileSync(path, "utf-8").trim();
  }
  const generated = randomBytes(32).toString("hex");
  writeFileSync(secretPath, generated, { mode: 0o600 });
  console.log(`Generated a signing secret in ${secretPath}. Keep it with your backups.`);
  return generated;
}

mkdirSync(DATA_DIR, { recursive: true });
const JWT_SECRET = resolveJwtSecret();
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

console.log("Running migrations…");
runMigrations(sqlite, MIGRATIONS_DIR);
console.log("Migrations done.");

const baseEnv: AppEnv = {
  DB: new NodeD1Database(sqlite),
  FILES: new NodeR2Bucket(FILES_DIR),
  AI: new NodeAiAdapter(),
  JWT_SECRET,
  ALLOW_REGISTRATION: process.env.ALLOW_REGISTRATION,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
};

const { api } = (await import("../api/index.js")) as {
  api: { fetch(req: Request, env: AppEnv, ctx: unknown): Response | Promise<Response> };
};

const app = new Hono();

app.get("/healthz", (c) => {
  try {
    sqlite.prepare("SELECT 1").get();
    return c.json({ status: "ok" });
  } catch {
    return c.json({ status: "error" }, 503);
  }
});

app.all("/api/*", (c) => {
  const forwarded = TRUST_PROXY ? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() : undefined;
  let clientIp = forwarded;
  if (!clientIp) {
    try {
      clientIp = getConnInfo(c).remote.address;
    } catch {
      clientIp = undefined;
    }
  }
  return api.fetch(c.req.raw, { ...baseEnv, CLIENT_IP: clientIp }, { waitUntil: () => {}, passThroughOnException: () => {} });
});

const indexPath = join(DIST_DIR, "index.html");
const indexHtml = existsSync(indexPath) ? readFileSync(indexPath, "utf-8") : null;

if (indexHtml) {
  app.use(
    "/assets/*",
    serveStatic({
      root: DIST_DIR,
      onFound: (_path, c) => c.header("Cache-Control", "public, max-age=31536000, immutable"),
    }),
  );
  app.use("*", serveStatic({ root: DIST_DIR }));
}

app.get("*", (c) => {
  if (!indexHtml) return c.text("Frontend not built. Run: npm run build", 404);
  c.header("Cache-Control", "no-cache");
  return c.html(indexHtml);
});

const server = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Zedgerr running on http://localhost:${PORT}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down…`);
  server.close(() => {
    sqlite.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
