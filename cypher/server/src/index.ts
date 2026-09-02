import Fastify from 'fastify'
import cors from '@fastify/cors'
import { pool, initSchema, isReadable, type ShareRow } from './db.js'
import { renderReaderHtml } from './shared/readerHtml.js'
import type { ShareSnapshot } from './shared/types.js'
import { renderLandingPage } from './landing.js'
import { BRAND_SVG } from './shared/brandMark.js'
import {
  initAuthSchema,
  signUp,
  logIn,
  logOut,
  userForToken,
  rotateJoinCode,
  setDisplayName,
  changePassword,
  verifyJoinCredentials,
  createPasswordReset,
  resetTokenValid,
  completePasswordReset
} from './auth.js'
import {
  signUpPage,
  logInPage,
  accountPage,
  forgotPage,
  resetPage,
  resetDonePage
} from './accountPage.js'
import { sendWelcome, sendPasswordReset } from './email.js'
import {
  initBookSchema,
  canAccess,
  isOwner,
  pushChanges,
  pullChanges,
  createOnlineBook,
  listBooksFor,
  deleteOnlineBook,
  type PushPayload
} from './books.js'

const PUBLISH_KEY = process.env.PUBLISH_KEY ?? ''
const PORT = Number(process.env.PORT ?? 8080)
/** Used for links in emails; falls back to the request host when unset. */
const PUBLIC_URL = (process.env.PUBLIC_URL ?? '').trim().replace(/\/+$/, '')

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
 * Fastify parses JSON out of the box but not form posts, so every HTML form on
 * the account pages would be rejected with a 415 without this. Registered by
 * hand rather than pulling in @fastify/formbody for a three-line parser.
 */
app.addContentTypeParser(
  'application/x-www-form-urlencoded',
  { parseAs: 'string' },
  (_request, body, done) => {
    try {
      const params = new URLSearchParams(body as string)
      done(null, Object.fromEntries(params.entries()))
    } catch (error) {
      done(error as Error, undefined)
    }
  }
)

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
await initAuthSchema()
await initBookSchema()

app.get('/health', async () => ({ ok: true }))

/* ---------------- accounts ---------------- */

const SESSION_COOKIE = 'cypher_session'

/** Reads the session cookie without pulling in a cookie plugin for one value. */
function sessionToken(request: { headers: Record<string, unknown> }): string | undefined {
  const raw = request.headers.cookie
  if (typeof raw !== 'string') return undefined
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

function setSessionCookie(reply: { header: (k: string, v: string) => void }, token: string): void {
  // HttpOnly keeps the token away from page scripts; SameSite=Lax is enough
  // here because every authenticated action is a same-site form post.
  reply.header(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
      30 * 24 * 60 * 60
    }${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  )
}

app.get('/account/signup', async (_request, reply) =>
  reply.type('text/html').send(signUpPage())
)
app.get('/account/login', async (_request, reply) => reply.type('text/html').send(logInPage()))

app.get('/account', async (request, reply) => {
  const user = await userForToken(sessionToken(request))
  if (!user) return reply.redirect('/account/login')
  return reply.type('text/html').send(accountPage(user))
})

app.post<{ Body: { email?: string; password?: string; displayName?: string } }>(
  '/account/signup',
  async (request, reply) => {
    const { email = '', password = '', displayName = '' } = request.body ?? {}
    const result = await signUp(email, password, displayName)
    if (!result.ok || !result.token) {
      return reply.type('text/html').send(signUpPage(result.reason, email))
    }
    setSessionCookie(reply, result.token)
    // Sent after the account exists: a failed email must not fail the signup.
    if (result.user) {
      void sendWelcome(
        result.user.email,
        result.user.display_name,
        result.user.id,
        result.user.join_code,
        PUBLIC_URL || `https://${request.headers.host}`
      )
    }
    return reply.redirect('/account')
  }
)

app.post<{ Body: { email?: string; password?: string } }>(
  '/account/login',
  async (request, reply) => {
    const { email = '', password = '' } = request.body ?? {}
    const result = await logIn(email, password)
    if (!result.ok || !result.token) {
      return reply.type('text/html').send(logInPage(result.reason, email))
    }
    setSessionCookie(reply, result.token)
    return reply.redirect('/account')
  }
)

app.post('/account/logout', async (request, reply) => {
  const token = sessionToken(request)
  if (token) await logOut(token)
  reply.header('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`)
  return reply.redirect('/')
})

app.post('/account/rotate', async (request, reply) => {
  const user = await userForToken(sessionToken(request))
  if (!user) return reply.redirect('/account/login')
  await rotateJoinCode(user.id)
  const updated = await userForToken(sessionToken(request))
  return reply
    .type('text/html')
    .send(accountPage(updated!, 'Your join code has changed. Older invitations no longer work.'))
})

app.post<{ Body: { displayName?: string } }>('/account/name', async (request, reply) => {
  const user = await userForToken(sessionToken(request))
  if (!user) return reply.redirect('/account/login')
  await setDisplayName(user.id, request.body?.displayName ?? '')
  const updated = await userForToken(sessionToken(request))
  return reply.type('text/html').send(accountPage(updated!, 'Name saved.'))
})

app.post<{ Body: { currentPassword?: string; newPassword?: string } }>(
  '/account/password',
  async (request, reply) => {
    const user = await userForToken(sessionToken(request))
    if (!user) return reply.redirect('/account/login')
    const result = await changePassword(
      user.id,
      request.body?.currentPassword ?? '',
      request.body?.newPassword ?? ''
    )
    // Every session was dropped, so a successful change lands on the login page.
    if (result.ok) return reply.type('text/html').send(logInPage('Password changed — sign in again.'))
    return reply.type('text/html').send(accountPage(user, result.reason))
  }
)

app.get('/account/forgot', async (_request, reply) => reply.type('text/html').send(forgotPage()))

app.post<{ Body: { email?: string } }>('/account/forgot', async (request, reply) => {
  const reset = await createPasswordReset(request.body?.email ?? '')
  if (reset) {
    const base = PUBLIC_URL || `https://${request.headers.host}`
    void sendPasswordReset(
      reset.email,
      `${base}/account/reset?token=${encodeURIComponent(reset.token)}`,
      reset.minutes
    )
  }
  // Identical response whether or not the address exists, so this page can't
  // be used to find out who has an account.
  return reply
    .type('text/html')
    .send(
      forgotPage('If that address has an account, a reset link is on its way. Check your inbox.')
    )
})

app.get<{ Querystring: { token?: string } }>('/account/reset', async (request, reply) => {
  const token = request.query?.token ?? ''
  if (!token || !(await resetTokenValid(token))) {
    return reply
      .type('text/html')
      .send(forgotPage(undefined, 'That link has expired or was already used. Request a new one.'))
  }
  return reply.type('text/html').send(resetPage(token))
})

app.post<{ Body: { token?: string; newPassword?: string } }>(
  '/account/reset',
  async (request, reply) => {
    const token = request.body?.token ?? ''
    const result = await completePasswordReset(token, request.body?.newPassword ?? '')
    if (!result.ok) {
      return (await resetTokenValid(token))
        ? reply.type('text/html').send(resetPage(token, result.reason))
        : reply.type('text/html').send(forgotPage(undefined, result.reason))
    }
    return reply.type('text/html').send(resetDonePage())
  }
)

/* ------------- API used by the desktop app ------------- */

/** Exchanges email and password for a token the app stores. */
app.post<{ Body: { email?: string; password?: string } }>(
  '/api/auth/login',
  async (request, reply) => {
    const result = await logIn(request.body?.email ?? '', request.body?.password ?? '')
    if (!result.ok) return reply.code(401).send({ error: result.reason })
    return {
      token: result.token,
      user: {
        id: result.user!.id,
        email: result.user!.email,
        displayName: result.user!.display_name,
        joinCode: result.user!.join_code
      }
    }
  }
)

/** Confirms a stored token is still good, and returns the current profile. */
app.get('/api/auth/me', async (request, reply) => {
  const header = request.headers.authorization
  const token = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : undefined
  const user = await userForToken(token)
  if (!user) return reply.code(401).send({ error: 'Not signed in.' })
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    joinCode: user.join_code
  }
})

/* ---------------- book sync ---------------- */

/** Every sync route needs the caller's identity; this is the one place it's read. */
async function requireUser(
  request: { headers: Record<string, unknown> },
  reply: { code: (n: number) => { send: (b: unknown) => unknown } }
): Promise<{ id: string } | null> {
  const header = request.headers.authorization
  const token = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : undefined
  const user = await userForToken(token)
  if (!user) {
    reply.code(401).send({ error: 'Not signed in.' })
    return null
  }
  return user
}

/** Books this writer can open, for reconnecting on another machine. */
app.get('/api/books', async (request, reply) => {
  const user = await requireUser(request, reply)
  if (!user) return
  return { books: await listBooksFor(user.id) }
})

/** Puts a local book online for the first time. */
app.post<{ Body: { id?: string; book?: Record<string, unknown> } }>(
  '/api/books',
  async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const id = request.body?.id
    if (!id) return reply.code(400).send({ error: 'A book id is required.' })
    await createOnlineBook(id, user.id, (request.body?.book ?? {}) as never)
    return { ok: true, id }
  }
)

app.get<{ Params: { id: string }; Querystring: { since?: string } }>(
  '/api/books/:id/changes',
  async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    if (!(await canAccess(request.params.id, user.id))) {
      return reply.code(403).send({ error: 'You do not have access to that book.' })
    }
    const since = Number(request.query?.since ?? 0)
    return pullChanges(request.params.id, Number.isFinite(since) ? since : 0)
  }
)

app.post<{ Params: { id: string }; Body: PushPayload }>(
  '/api/books/:id/changes',
  async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    if (!(await canAccess(request.params.id, user.id))) {
      return reply.code(403).send({ error: 'You do not have access to that book.' })
    }
    return pushChanges(request.params.id, request.body ?? {})
  }
)

/** Taking a book offline removes it from the server entirely. Owner only. */
app.delete<{ Params: { id: string } }>('/api/books/:id', async (request, reply) => {
  const user = await requireUser(request, reply)
  if (!user) return
  if (!(await isOwner(request.params.id, user.id))) {
    return reply.code(403).send({ error: 'Only the book owner can do that.' })
  }
  await deleteOnlineBook(request.params.id)
  return { ok: true }
})

/** Looks up a collaborator by ID + join code, for the invite flow. */
app.post<{ Body: { userId?: string; joinCode?: string } }>(
  '/api/users/verify',
  async (request, reply) => {
    const header = request.headers.authorization
    const token = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : undefined
    if (!(await userForToken(token))) return reply.code(401).send({ error: 'Not signed in.' })

    const found = await verifyJoinCredentials(
      request.body?.userId ?? '',
      request.body?.joinCode ?? ''
    )
    if (!found) {
      // One message for both failures: distinguishing them would let someone
      // confirm a writer ID exists by trying codes against it.
      return reply.code(404).send({ error: 'No writer found with that ID and join code.' })
    }
    return { id: found.id, displayName: found.display_name }
  }
)

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
