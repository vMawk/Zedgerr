import Database from "better-sqlite3";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Split a SQL file into individual statements.
 * Correctly handles CREATE TRIGGER bodies (BEGIN ... END;) which contain semicolons.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = "";
  let depth = 0;

  for (const line of sql.split("\n")) {
    const trimmed = line.trim();

    // Skip blank/comment-only lines when buffer is empty
    if ((trimmed === "" || trimmed.startsWith("--")) && buf.trim() === "") continue;

    buf += line + "\n";

    const upper = trimmed.toUpperCase();

    // Detect BEGIN — either on its own line or at the end of a CREATE TRIGGER line
    if (upper === "BEGIN" || upper.endsWith(" BEGIN")) {
      depth++;
      continue;
    }

    if (depth > 0) {
      // Inside a trigger body — look for END;
      if (upper === "END;" || upper === "END") {
        depth--;
        if (depth === 0) {
          const stmt = buf.trim();
          if (stmt) statements.push(stmt);
          buf = "";
        }
      }
      continue;
    }

    // Outside trigger body: split on lines ending with ;
    if (trimmed.endsWith(";") && !trimmed.startsWith("--")) {
      const stmt = buf.trim();
      if (stmt) statements.push(stmt);
      buf = "";
    }
  }

  const remaining = buf.trim();
  if (remaining) statements.push(remaining);

  return statements.filter((s) => s.length > 0 && !s.startsWith("--"));
}

export function runMigrations(db: Database.Database, migrationsDir: string): void {
  const hasTable = (name: string) =>
    Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  if (hasTable("_cf_migrations") && !hasTable("_migrations")) {
    db.exec("ALTER TABLE _cf_migrations RENAME TO _migrations");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map((r) => r.name),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    console.log(`  Applying migration: ${file}`);

    try {
      // One transaction per file: a failing migration leaves the database untouched.
      db.transaction(() => {
        for (const stmt of splitSqlStatements(sql)) {
          try {
            db.exec(stmt);
          } catch (stmtErr) {
            const msg = stmtErr instanceof Error ? stmtErr.message : String(stmtErr);
            console.error(`  FAILED statement:\n${stmt}\n  Error: ${msg}`);
            throw stmtErr;
          }
        }
        db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
      })();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists") || msg.includes("duplicate column")) {
        db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(file);
        console.log(`    Skipped (already applied): ${file}`);
      } else {
        throw err;
      }
    }
  }
}
