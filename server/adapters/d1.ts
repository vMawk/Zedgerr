import Database from "better-sqlite3";
import type { D1Database, D1PreparedStatement } from "../../api/types.js";

type Row = Record<string, unknown>;
type RunMeta = { changes: number; last_row_id: number };

class NodeD1Statement implements D1PreparedStatement {
  private bindings: unknown[] = [];

  constructor(
    private readonly db: Database.Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): NodeD1Statement {
    const s = new NodeD1Statement(this.db, this.sql);
    s.bindings = values.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v));
    return s;
  }

  async first<T = Row>(col?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.bindings) as Row | undefined;
    if (row == null) return null;
    if (col !== undefined) return (row[col] ?? null) as T;
    return row as T;
  }

  async all<T = Row>(): Promise<{ results: T[]; success: boolean; meta: unknown }> {
    const results = this.db.prepare(this.sql).all(...this.bindings) as T[];
    return { results, success: true, meta: {} };
  }

  runSync(): RunMeta {
    const info = this.db.prepare(this.sql).run(...this.bindings);
    return { changes: info.changes, last_row_id: Number(info.lastInsertRowid) };
  }

  async run(): Promise<{ success: boolean; meta: RunMeta }> {
    return { success: true, meta: this.runSync() };
  }
}

export class NodeD1Database implements D1Database {
  constructor(private readonly db: Database.Database) {}

  prepare(sql: string): NodeD1Statement {
    return new NodeD1Statement(this.db, sql);
  }

  // Runs synchronously inside one transaction so any failing statement rolls back the whole batch.
  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<{ results: T[]; success: boolean; meta: unknown }[]> {
    const tx = this.db.transaction(() =>
      statements.map((stmt) => ({ results: [] as T[], success: true, meta: (stmt as NodeD1Statement).runSync() })),
    );
    return tx();
  }

  async exec(sql: string): Promise<{ count: number; duration: number }> {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }
}
