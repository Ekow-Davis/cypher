import Fastify from 'fastify'
import cors from '@fastify/cors'
import { pool, initSchema, isReadable, type ShareRow } from './db.js'
import { renderReaderHtml } from './shared/readerHtml.js'
import type { ShareSnapshot } from './shared/types.js'
import { renderLandingPage } from './landing.js'
import { BRAND_SVG } from './shared/brandMark.js'

const PUBLISH_KEY = process.env.PUBLISH_KEY ?? ''
const PORT = Number(process.env.PORT ?? 8080)

/**
 * Fail loudly and specifically on a misconfigured deploy.
 *
 * Without this the first symptom is a connection error from the Postgres
 * driver, which says nothing about the variable that is actually missing —
 * and that is the hardest kind of deployment problem to diagnose.
 */
if (!process.env.DATABASE_URL) {
  console.error(
    '[cypher] DATABASE_URL is not set.\n' +
      '  On Railway: open this service → Variables → add a reference to your\n' +
      '  Postgres service (${{Postgres.DATABASE_URL}}).'
  )
  process.exit(1)
}
if (!PUBLISH_KEY) {
  console.error(
    '[cypher] PUBLISH_KEY is not set — publishing would be impossible.\n' +
      '  Generate one and add it under Variables, then paste the same value\n' +
      '  into the app under Settings → Data → Share server.'
  )
  process.exit(1)
}

const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 })
await app.register(cors, { origin: true })

/**
 * Publishing is the only write path, so it is the only thing that needs a
 * secret. Readers are anonymous by design — the token in the URL *is* the
 * capability, which is why tokens are 128 bits of randomness.
 */
function authorised(header: string | undefined): boolean {
  if (!PUBLISH_KEY) return false
  return header === `Bearer ${PUBLISH_KEY}`
}

await initSchema()

app.get('/health', async () => ({ ok: true }))

/**
 * Browsers request this regardless of the inline <link rel="icon">, so serving
 * it stops a 404 appearing in the logs on every visit.
 */
app.get('/favicon.ico', async (_request, reply) =>
  reply
    .type('image/svg+xml')
    .header('Cache-Control', 'public, max-age=86400')
    .send(BRAND_SVG)
)

/** The public site. Same origin as the reader, so share links stay on one domain. */
app.get('/', async (_request, reply) =>
  reply.type('text/html').send(
    renderLandingPage({
      downloadUrl: process.env.DOWNLOAD_URL,
      portableUrl: process.env.PORTABLE_URL,
      version: process.env.APP_VERSION
    })
  )
)

/** Someone trimming a share URL back to /s/ should land somewhere useful. */
app.get('/s', async (_request, reply) => reply.redirect('/'))

/** Create or refresh a share. The same token overwrites in place. */
app.put<{
  Params: { token: string }
  Body: { label?: string; snapshot: ShareSnapshot; expiresAt?: string | null; active?: boolean }
}>('/api/shares/:token', async (request, reply) => {
  if (!authorised(request.headers.authorization)) {
    return reply.code(401).send({ error: 'Unauthorised' })
  }
  const { token } = request.params
  const { label = '', snapshot, expiresAt = null, active = true } = request.body ?? {}
  if (!snapshot || !Array.isArray(snapshot.chapters)) {
    return reply.code(400).send({ error: 'A snapshot with chapters is required.' })
  }

  await pool.query(
    `INSERT INTO shares (token, label, snapshot, expires_at, active, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (token) DO UPDATE SET
       label = EXCLUDED.label,
       snapshot = EXCLUDED.snapshot,
       expires_at = EXCLUDED.expires_at,
       active = EXCLUDED.active,
       updated_at = now()`,
    [token, label, JSON.stringify(snapshot), expiresAt, active]
  )
  return { ok: true, url: `/s/${token}` }
})

/** Revoking keeps the row so stats survive and the link can be restored. */
app.delete<{ Params: { token: string } }>('/api/shares/:token', async (request, reply) => {
  if (!authorised(request.headers.authorization)) {
    return reply.code(401).send({ error: 'Unauthorised' })
  }
  await pool.query('UPDATE shares SET active = FALSE, updated_at = now() WHERE token = $1', [
    request.params.token
  ])
  return { ok: true }
})

/** Engagement figures, for the author's own dialog. */
app.get<{ Params: { token: string } }>('/api/shares/:token/stats', async (request, reply) => {
  if (!authorised(request.headers.authorization)) {
    return reply.code(401).send({ error: 'Unauthorised' })
  }
  const { rows } = await pool.query<ShareRow>(
    'SELECT token, label, active, expires_at, views, read_seconds FROM shares WHERE token = $1',
    [request.params.token]
  )
  if (!rows.length) return reply.code(404).send({ error: 'Not found' })
  const row = rows[0]
  return { views: row.views, readSeconds: Number(row.read_seconds), active: row.active }
})

/** The reader page. Anonymous, but gated on active + expiry. */
app.get<{ Params: { token: string } }>('/s/:token', async (request, reply) => {
  const { rows } = await pool.query<ShareRow>('SELECT * FROM shares WHERE token = $1', [
    request.params.token
  ])
  if (!rows.length) return reply.code(404).type('text/html').send(notFoundPage())

  const row = rows[0]
  if (!isReadable(row)) return reply.code(410).type('text/html').send(gonePage(!!row.expires_at))

  // Counted here rather than in the browser so an ad-blocker or a disabled
  // script can't silently zero the author's figures.
  await pool.query('UPDATE shares SET views = views + 1 WHERE token = $1', [request.params.token])

  return reply
    .type('text/html')
    .send(renderReaderHtml(row.snapshot as ShareSnapshot, { token: request.params.token }))
})

/**
 * Reading time, sent by sendBeacon on unload. Clamped because a beacon is
 * unauthenticated and trivially forgeable — this is a rough engagement signal,
 * not an audited metric.
 */
app.post<{ Params: { token: string }; Body: { seconds?: number } }>(
  '/api/read/:token',
  async (request, reply) => {
    const seconds = Math.max(0, Math.min(4 * 60 * 60, Number(request.body?.seconds ?? 0)))
    if (seconds > 0) {
      await pool.query(
        'UPDATE shares SET read_seconds = read_seconds + $2 WHERE token = $1 AND active',
        [request.params.token, Math.round(seconds)]
      )
    }
    return reply.code(204).send()
  }
)

function shell(title: string, message: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#15131a;color:#e7e3ee;font-family:system-ui,sans-serif;text-align:center;padding:2rem}
h1{font-size:1.3rem;margin:0 0 .5rem}p{color:#9a93a8;margin:0;font-size:.9rem}
a{color:#a78bfa}</style></head>
<body><div><h1>${title}</h1><p>${message}</p></div></body></html>`
}
function notFoundPage(): string {
  return shell(
    'Nothing here',
    'This link does not exist, or it was deleted by its author. <a href="/">About Cypher</a>'
  )
}
function gonePage(hadExpiry: boolean): string {
  return shell(
    hadExpiry ? 'This link has expired' : 'This link was revoked',
    'Ask the author for a new one. <a href="/">About Cypher</a>'
  )
}

app.listen({ port: PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
