// Kopieer de PRODUCTIE-database naar een doel: je lokale D1 of de dev-database.
//
//   node scripts/db-copy.mjs local   → vult je lokale D1 (voor `npm run dev`)
//   node scripts/db-copy.mjs dev      → vult de dev-DB (dev-portaal.gibby.it)
//
// Werkwijze: productie exporteren → doel volledig leegmaken → dump importeren.
// Productie wordt ALLEEN gelezen (read-only). Het doel wordt overschreven.
//
// Cross-platform (Node, geen shell-specifieke syntax). Vereist ingelogde wrangler.

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const PROD_DB = "client-flow";
const DEV_DB = "client-flow-dev";
const DUMP_DIR = ".db-dumps";
// Schema en data apart: eerst alle tabellen aanmaken, daarna pas vullen.
// Voorkomt "no such table" bij forward-references (bijv. invoices → debt_settlements).
const SCHEMA_FILE = `${DUMP_DIR}/prod-schema.sql`;
const DATA_FILE = `${DUMP_DIR}/prod-data.sql`;

const target = process.argv[2];
if (target !== "local" && target !== "dev") {
  console.error("Gebruik: node scripts/db-copy.mjs <local|dev>");
  process.exit(1);
}

// Doel-DB en of het lokaal of remote is.
const targetDb = target === "local" ? PROD_DB : DEV_DB;
const targetLoc = target === "local" ? "--local" : "--remote";

// Roep de lokale wrangler direct via Node aan — geen shell/.cmd, dus SQL-args
// met quotes en puntkomma's blijven letterlijk intact (belangrijk op Windows).
const wranglerBin = createRequire(import.meta.url).resolve("wrangler/bin/wrangler.js");
function wrangler(args, opts = {}) {
  return execFileSync(process.execPath, [wranglerBin, ...args], { stdio: "inherit", ...opts });
}
function wranglerCapture(args) {
  return execFileSync(process.execPath, [wranglerBin, ...args], { encoding: "utf8" });
}

console.log(`\n▶ Stap 1/3 — Productie exporteren (read-only)…`);
mkdirSync(DUMP_DIR, { recursive: true });
wrangler(["d1", "export", PROD_DB, "--remote", "--no-data", "--output", SCHEMA_FILE]);
wrangler(["d1", "export", PROD_DB, "--remote", "--no-schema", "--output", DATA_FILE]);

console.log(`\n▶ Stap 2/3 — Doel '${targetDb}' (${target}) leegmaken…`);
const listOut = wranglerCapture([
  "d1", "execute", targetDb, targetLoc, "--json",
  "--command",
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';",
]);
// wrangler --json print een JSON-array; pak alles tussen de eerste '[' en laatste ']'.
const jsonStart = listOut.indexOf("[");
const jsonEnd = listOut.lastIndexOf("]");
let tables = [];
if (jsonStart !== -1 && jsonEnd !== -1) {
  const parsed = JSON.parse(listOut.slice(jsonStart, jsonEnd + 1));
  const rows = Array.isArray(parsed) ? parsed[0]?.results ?? [] : [];
  tables = rows.map((r) => r.name).filter(Boolean);
}

if (tables.length === 0) {
  console.log("  (geen bestaande tabellen — niets te wissen)");
} else {
  console.log(`  Tabellen wissen: ${tables.join(", ")}`);
  const dropSql =
    "PRAGMA defer_foreign_keys=TRUE;\n" +
    tables.map((t) => `DROP TABLE IF EXISTS "${t}";`).join("\n");
  wrangler(["d1", "execute", targetDb, targetLoc, "--yes", "--command", dropSql]);
}

console.log(`\n▶ Stap 3/3 — Schema + data importeren in '${targetDb}' (${target})…`);
wrangler(["d1", "execute", targetDb, targetLoc, "--yes", "--file", SCHEMA_FILE]);
wrangler(["d1", "execute", targetDb, targetLoc, "--yes", "--file", DATA_FILE]);

console.log(`\n✅ Klaar. '${targetDb}' (${target}) is nu een kopie van productie.`);
if (target === "local") console.log("   Start de app met: npm run dev");
if (target === "dev") console.log("   Deploy dev met:    npm run deploy:dev");
