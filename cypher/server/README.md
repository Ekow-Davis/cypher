# Cypher share server

Serves shared book links. Deployed to Railway.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string — Railway sets this when you add a Postgres service |
| `PUBLISH_KEY` | Secret the desktop app sends to publish. Generate with `openssl rand -base64 32` |
| `PORT` | Set by Railway automatically |
| `RESEND_API_KEY` | Resend key for transactional email. Without it, accounts still work — emails are skipped and logged |
| `EMAIL_FROM` | Sender, e.g. `Cypher <no-reply@forgottenguardian.com>`. The domain must be verified in Resend |
| `PUBLIC_URL` | Your site's address, used for links inside emails. Falls back to the request host |

## Deploying

1. New project on Railway → **Add Postgres**.
2. Add a service from this repo, root directory `server`.
3. Set `PUBLISH_KEY` in the service variables.
4. Railway runs `npm run build` then `npm start`.

The schema is created on boot, so there is no migration step.

## Routes

- `PUT /api/shares/:token` — publish or refresh (authorised)
- `DELETE /api/shares/:token` — revoke (authorised)
- `GET /api/shares/:token/stats` — views and reading time (authorised)
- `GET /s/:token` — the reader page (public)
- `POST /api/read/:token` — reading-time beacon (public)
