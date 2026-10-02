# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub: open the **Security** tab of this repository and choose **Report a vulnerability**. Do not open a public issue.

Include what you found, how to reproduce it and the impact you expect. You'll get a reply within a few days, and you'll be credited in the release notes once a fix is out, unless you prefer to stay anonymous.

## Supported versions

Security fixes are released for the latest version. Update to the newest release before reporting, if you can.

## Hardening checklist for self-hosters

- Serve Zedgerr over HTTPS behind a reverse proxy and set `TRUST_PROXY=true`.
- Keep the data volume private and back it up; it contains your database, uploaded receipts and the generated signing secret.
- Turn on two-factor authentication for every account under **Settings → Security**.
- Leave `ALLOW_REGISTRATION=false` and invite people from **Settings → Team**.
