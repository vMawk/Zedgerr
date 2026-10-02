# Contributing to Zedgerr

Thanks for helping make Zedgerr better. Bug reports, ideas, translations, new country tax presets and code are all welcome.

## Before you start

- **Bugs:** search the [issues](../../issues) first. If it's new, open an issue with steps to reproduce, what you expected and what happened.
- **Features:** open an issue to discuss the idea before writing a large pull request, so we can agree on the approach.
- **Security problems:** do not open a public issue. See [SECURITY.md](SECURITY.md).

## Development setup

```bash
npm install
npm run dev
```

The API runs on port 3000 and the app on <http://localhost:8080>. In development a **DEV** button in the bottom-left corner reruns the setup wizard and the product tour.

Before opening a pull request, make sure these pass:

```bash
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npx tsc --noEmit -p tsconfig.server.json
npm test
npm run build
```

## Pull requests

- Keep each pull request focused on one change.
- Write user-facing text in clear, plain English.
- Database changes go in a new numbered file in `migrations/`; never edit a migration that has already been released.
- Stored values such as invoice statuses (`concept`, `verzonden`, `betaald`, `vervallen`) are kept for compatibility. Change the labels, not the stored values.
- Adding a country? Edit `src/lib/tax-presets.ts` and link the official source for the rates in your pull request.

## Contributor License Agreement

Zedgerr is distributed under the [Functional Source License](LICENSE.md), and the maintainer may also offer it under other terms, for example a commercial license or a hosted service. To make that possible, every contribution is made under this agreement. By opening a pull request you confirm that:

1. The contribution is your own original work, or you have the right to submit it.
2. You grant Mark van Viegen ("the maintainer") a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, copy, modify, sublicense and distribute your contribution as part of Zedgerr under any license, including proprietary and commercial licenses.
3. You grant a patent license for any of your patents that your contribution necessarily infringes, on the same terms.
4. You keep the copyright in your contribution and may use it elsewhere however you like.
5. Your contribution is provided "as is", without warranties.

If you are contributing on behalf of your employer, make sure you are allowed to agree to these terms.

## Code of conduct

Be respectful and constructive. Harassment or abusive behaviour in issues, discussions or pull requests is not tolerated and may lead to a ban from the project.
