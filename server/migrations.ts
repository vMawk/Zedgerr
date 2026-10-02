import Database from "better-sqlite3";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

export function runMigrations(db: Database.Database, migrationsDir: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _cf_migrations (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (db.prepare("SELECT name FROM _cf_migrations").all() as { name: string }[]).map((r) => r.name),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    console.log(`  Applying migration: ${file}`);

    try {
      db.exec(sql);
      db.prepare("INSERT INTO _cf_migrations (name) VALUES (?)").run(file);
    } catch (err) {
      // Migration already applied (e.g. table exists) — mark as done and continue
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists") || msg.includes("duplicate column")) {
        db.prepare("INSERT OR IGNORE INTO _cf_migrations (name) VALUES (?)").run(file);
        console.log(`    Skipped (already applied): ${file}`);
      } else {
        throw err;
      }
    }
  }
}
