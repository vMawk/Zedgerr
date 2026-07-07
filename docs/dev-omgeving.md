# Dev-omgeving & lokaal met productiedata

Naast productie is er nu een **losse dev-omgeving**: een aparte Cloudflare Worker
`client-flow-dev` op **dev-portaal.gibby.it**, met een **eigen database**
(`client-flow-dev`). Zo test je nieuwe dingen zonder ook maar iets aan de echte
klantdata te raken. Als het goed is, merge je naar `main` en deploy je productie.

Productie blijft ongewijzigd:
- Worker `client-flow` op **api.gibby.it** + frontend op **portaal.gibby.it**
- Database `client-flow` (id `edfd0cb4…`) — de echte klantdata.

---

## Dagelijks gebruik

| Ik wil… | Commando |
|---|---|
| Lokaal werken met een **kopie** van de online data | `npm run db:pull:local` → daarna `npm run dev` |
| De **dev-site** (dev-portaal.gibby.it) uitrollen | `npm run deploy:dev` |
| De **dev-database** verversen met productiedata | `npm run db:pull:dev` |
| **Productie** uitrollen | `npm run deploy` |

`db:pull:*` exporteert productie (**alleen lezen**), maakt het doel leeg en zet er
een verse kopie in. De dumps komen in `.db-dumps/` (staat in `.gitignore` — bevat
echte klantdata, dus nooit committen).

### Aanbevolen workflow
1. Werk op een branch, bijv. `dev`.
2. `npm run deploy:dev` → check het live op **dev-portaal.gibby.it**.
3. Tevreden? Merge naar `main` en `npm run deploy` → **productie**.

> Deploys gaan **handmatig** per commando (niet automatisch bij een git-push).
> Wil je auto-deploy bij push naar een branch? Dan kunnen we later *Workers Builds*
> (GitHub-koppeling) toevoegen.

---

## Eenmalige setup (moet jij één keer doen)

De code/config staat klaar. Twee dingen vereisen jouw Cloudflare-account:

### 1. Custom domain koppelen — `dev-portaal.gibby.it`
De eerste deploy maakt de Worker aan en claimt de route. Draai:

```bash
npm run deploy:dev
```

Wrangler koppelt dan automatisch het custom domain `dev-portaal.gibby.it`
(staat al in `wrangler.toml` onder `[[env.dev.routes]]`). Cloudflare zet het
DNS-record vanzelf klaar omdat de zone `gibby.it` in hetzelfde account zit.
Werkt het domein niet meteen? Check **Workers & Pages → client-flow-dev →
Settings → Domains & Routes** in het dashboard.

### 2. Dev-database vullen
De dev-database is nog leeg. Vul hem met een kopie van productie:

```bash
npm run db:pull:dev
```

Klaar — **dev-portaal.gibby.it** draait nu met een kopie van de echte data,
volledig los van productie.

---

## Belangrijk / veiligheid
- **Aparte database**: testen/migraties op dev raken de echte klanten nooit.
- **Aparte JWT-secret**: dev-logins werken niet op productie en andersom.
- **Geen Telegram, geen crons op dev**: dev stuurt bewust geen meldingen.
- `npm run db:pull:*` **overschrijft** het doel (lokaal of dev). Productie wordt
  alleen gelezen, nooit geschreven.

## Nieuwe migratie? (voor gevorderden)
`db:pull:dev` neemt de migratiestand van productie mee. Wil je op dev een nieuwe
migratie los testen vóór productie: `npm run db:migrate:dev`.
