import Database from "better-sqlite3";

type Row = Record<string, unknown>;

class NodeD1Statement {
  private bindings: unknown[] = [];

  constructor(
    private readonly db: Database.Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): NodeD1Statement {
    const s = new NodeD1Statement(this.db, this.sql);
    s.bindings = values.map((v) => (v === undefined ? null : v));
    return s;
  }

  async first<T = Row>(col?: string): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.bindings) as Row | undefined;
    if (row == null) return null;
    if (col !== undefined) return (row[col] ?? null) as T;
    return row as T;
  }

  async all<T = Row>(): Promise<{ results: T[]; success: boolean; meta: unknown }> {
    const stmt = this.db.prepare(this.sql);
    const results = stmt.all(...this.bindings) as T[];
    return { results, success: true, meta: {} };
  }

  async run(): Promise<{ success: boolean; meta: unknown }> {
    const stmt = this.db.prepare(this.sql);
    stmt.run(...this.bindings);
    return { success: true, meta: {} };
  }
}

export class NodeD1Database {
  constructor(private readonly db: Database.Database) {}

  prepare(sql: string): NodeD1Statement {
    return new NodeD1Statement(this.db, sql);
  }

  async batch(statements: NodeD1Statement[]): Promise<{ results: unknown[]; success: boolean; meta: unknown }[]> {
    const results: { results: unknown[]; success: boolean; meta: unknown }[] = [];
    const tx = this.db.transaction(() => {
      for (const stmt of statements) {
        stmt.run();
        results.push({ results: [], success: true, meta: {} });
      }
    });
    tx();
    return results;
  }

  async exec(sql: string): Promise<{ count: number; duration: number }> {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }
}
