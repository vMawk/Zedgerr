import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

import { NodeD1Database } from "./adapters/d1.js";
import { NodeR2Bucket } from "./adapters/r2.js";
import { NodeAiAdapter } from "./adapters/ai.js";
import { runMigrations } from "./migrations.js";

const ROOT = process.cwd();

const DATA_DIR = resolve(process.env.DATA_DIR ?? join(ROOT, "data"));
const DB_PATH = resolve(process.env.DB_PATH ?? join(DATA_DIR, "app.db"));
const FILES_DIR = resolve(process.env.FILES_DIR ?? join(DATA_DIR, "files"));
const MIGRATIONS_DIR = resolve(process.env.MIGRATIONS_DIR ?? join(ROOT, "migrations"));
const DIST_DIR = resolve(process.env.DIST_DIR ?? join(ROOT, "dist"));
const PORT = parseInt(process.env.PORT ?? "3000", 10);

mkdirSync(DATA_DIR, { recursive: true });
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

console.log("Running migrations…");
runMigrations(sqlite, MIGRATIONS_DIR);
console.log("Migrations done.");

const dbAdapter = new NodeD1Database(sqlite);
const r2Adapter = new NodeR2Bucket(FILES_DIR);
const aiAdapter = new NodeAiAdapter();

const env = {
  DB: dbAdapter,
  FILES: r2Adapter,
  AI: aiAdapter,
  JWT_SECRET: process.env.JWT_SECRET ?? "change-me-in-production",
  ALLOW_REGISTRATION: process.env.ALLOW_REGISTRATION,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
};

const { api } = await import("../api/index.js") as { api: { fetch: typeof fetch } };

const app = new Hono();

app.all("/api/*", (c) => {
  return (api as unknown as { fetch(req: Request, env: unknown, ctx: unknown): Promise<Response> })
    .fetch(c.req.raw, env, { waitUntil: () => {}, passThroughOnException: () => {} });
});

if (existsSync(DIST_DIR)) {
  app.use("/assets/*", serveStatic({ root: DIST_DIR }));
  app.use("/favicon.ico", serveStatic({ root: DIST_DIR }));
}

app.use("*", async (c) => {
  const indexPath = join(DIST_DIR, "index.html");
  if (!existsSync(indexPath)) {
    return c.text("Frontend not built. Run: npm run build", 404);
  }
  const { readFileSync } = await import("fs");
  return c.html(readFileSync(indexPath, "utf-8"));
});

console.log(`Zedgerr running on http://localhost:${PORT}`);
serve({ fetch: app.fetch, port: PORT });
