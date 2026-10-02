# Zedgerr

Open-source bookkeeping, invoicing and client management for freelancers and small businesses. Self-hostable via Docker or any Node.js environment.

## Features

- **Client management** — companies, contacts, client portal
- **Time tracking & quotes** — time entries, quote-to-invoice workflow
- **Invoicing** — PDF generation, VAT, payment status, payment links
- **Expenses** — receipts, VAT deduction, attachments
- **Bank account** — transactions, CSV import (ING/Rabobank/ABN AMRO), reconciliation
- **Bookkeeping** — double-entry accounting, chart of accounts (NL standard), journal entries, periods
- **Financial reports** — profit & loss, balance sheet, quarterly VAT return
- **Audit log** — all mutations tracked with timestamps

## Technology

| Layer | Stack |
|---|---|
| Runtime | Node.js 22 + `@hono/node-server` |
| API framework | Hono.js |
| Database | SQLite via better-sqlite3 |
| File storage | Local filesystem |
| Frontend | React 18 + Vite + shadcn/ui |

## Quick start

### Docker (recommended)

```bash
cp .env.example .env          # fill in JWT_SECRET
docker compose up -d
# App is available at http://localhost:3000
```

### Local development

```bash
npm install
npm run dev       # starts API server + Vite dev server concurrently
```

### Production (Node.js)

```bash
npm install
npm run build     # build frontend
npm start         # compile server + serve on PORT (default 3000)
```

## Migrations

Migrations run automatically on server startup. SQL files are in `migrations/`.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | ✅ | — | Random string, at least 32 characters |
| `ALLOW_REGISTRATION` | | `false` | Set to `true` to enable open registration |
| `PORT` | | `3000` | Server port |
| `DATA_DIR` | | `./data` | Directory for SQLite database and uploaded files |
| `OPENAI_API_KEY` | | — | For AI suggestions (optional) |

## Contributing

Pull requests are welcome. Please open an issue first for larger changes.

## License

MIT — see [LICENSE](LICENSE).
