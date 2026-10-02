import type { D1Database } from "./types.js";

const HOURS = [6, 4.5, 2, 3, 1.5, 7, 8, 5, 8, 5, 8, 8.5];
const TOTAL_INCL = 622.5;
const BTW_PCT = 21;
const ADVANCE = 150;
const SUBTOTAL = Math.round((TOTAL_INCL / (1 + BTW_PCT / 100)) * 100) / 100;
const BTW_AMT = Math.round((TOTAL_INCL - SUBTOTAL) * 100) / 100;

function splitAmounts(): number[] {
  const totalH = HOURS.reduce((a, b) => a + b, 0);
  const rounded = HOURS.map((h) => Math.round(((SUBTOTAL * h) / totalH) * 100) / 100);
  const diff = Math.round((SUBTOTAL - rounded.reduce((a, b) => a + b, 0)) * 100) / 100;
  rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1]! + diff) * 100) / 100;
  return rounded;
}

/** Factuur 2026-001 + uren (eenmalig als nog niet aanwezig). */
export async function seedInvoice2026IfNeeded(db: D1Database, userId: string): Promise<void> {
  const exists = await db.prepare("SELECT 1 FROM invoices WHERE invoice_number = ?").bind("2026-001").first();
  if (exists) return;

  let companyRow = await db.prepare("SELECT id FROM companies WHERE user_id = ? ORDER BY created_at LIMIT 1").bind(userId).first<{ id: string }>();
  let companyId = companyRow?.id;
  if (!companyId) {
    companyId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO companies (id, user_id, name, country, created_at, updated_at)
         VALUES (?, ?, ?, 'Nederland', ?, ?)`,
      )
      .bind(companyId, userId, "XARO B.V.", now, now)
      .run();
  }

  const amounts = splitAmounts();
  const invoiceId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO invoices (
        id, user_id, company_id, invoice_number, invoice_date, due_date, status,
        subtotal, btw_percentage, btw_amount, total, advance_payment, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      invoiceId,
      userId,
      companyId,
      "2026-001",
      "2026-01-31",
      "2026-02-28",
      "betaald",
      SUBTOTAL,
      BTW_PCT,
      BTW_AMT,
      TOTAL_INCL,
      ADVANCE,
      "Krediet €150,00. Ontvangen na krediet €472,50. Totaal factuur €622,50 (incl. BTW).",
      now,
      now,
    )
    .run();

  const stmts: ReturnType<D1Database["prepare"]>[] = [];
  for (let i = 0; i < 12; i++) {
    const d = `2026-01-${String(i + 1).padStart(2, "0")}`;
    const h = HOURS[i]!;
    const amt = amounts[i]!;
    const rate = Math.round((amt / h) * 100) / 100;
    const teId = crypto.randomUUID();
    stmts.push(
      db
        .prepare(
          `INSERT INTO time_entries (
            id, user_id, company_id, date, hours, description, hourly_rate, invoiced, invoice_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .bind(teId, userId, companyId, d, h, `Urenregel ${i + 1}`, rate, invoiceId, now, now),
    );
    stmts.push(
      db
        .prepare(
          `INSERT INTO invoice_lines (
            id, invoice_id, time_entry_id, description, date, hours, hourly_rate, amount, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .bind(crypto.randomUUID(), invoiceId, teId, `Urenregel ${i + 1}`, d, h, rate, amt),
    );
  }
  await db.batch(stmts);
}
