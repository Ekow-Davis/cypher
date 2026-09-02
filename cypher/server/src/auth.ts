import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { pool } from './db.js'

/**
 * promisify() picks scrypt's three-argument overload, which drops the options
 * parameter we need for the cost factor — so the signature is restated here.
 */
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>

/**
 * Accounts for collaborative books.
 *
 * Passwords are hashed with scrypt — a deliberately slow, memory-hard KDF —
 * rather than a plain digest, so a leaked database doesn't hand over everyone's
 * password. Node ships it, which also avoids a native build step on the host.
 */

const SCRYPT_N = 2 ** 15
const KEY_LEN = 64
const SESSION_DAYS = 30

export interface User {
  id: string
  email: string
  display_name: string
  join_code: string
  created_at: Date
}

export async function initAuthSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name  TEXT NOT NULL DEFAULT '',
      -- Rotatable: sharing a UUID is not enough to be added to a book, and
      -- rotating this invalidates invitations the owner hasn't used yet.
      join_code     TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash  TEXT PRIMARY KEY,
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `)
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024
  })
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const derived = await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEY_LEN, {
    N: SCRYPT_N,
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024
  })
  const expected = Buffer.from(hashHex, 'hex')
  // Constant-time: a plain === leaks how much of the hash matched via timing.
  return expected.length === derived.length && timingSafeEqual(expected, derived)
}

/** Short, unambiguous code — no 0/O or 1/I, since these get typed by hand. */
export function generateJoinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(8)
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += alphabet[bytes[i] % alphabet.length]
    if (i === 3) code += '-'
  }
  return code
}

/**
 * Sessions are stored as a hash of the token, never the token itself, so a
 * database leak can't be replayed as a login.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface AuthResult {
  ok: boolean
  reason?: string
  user?: User
  token?: string
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function signUp(
  email: string,
  password: string,
  displayName: string
): Promise<AuthResult> {
  const address = normaliseEmail(email)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    return { ok: false, reason: 'That email address does not look right.' }
  }
  if (password.length < 8) {
    return { ok: false, reason: 'Use at least 8 characters for your password.' }
  }

  const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [address])
  if (existing.rowCount) return { ok: false, reason: 'An account with that email already exists.' }

  const id = randomUUID()
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, join_code)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, address, await hashPassword(password), displayName.trim() || address.split('@')[0], generateJoinCode()]
  )
  return logIn(address, password)
}

export async function logIn(email: string, password: string): Promise<AuthResult> {
  const address = normaliseEmail(email)
  const { rows } = await pool.query(
    'SELECT id, email, password_hash, display_name, join_code, created_at FROM users WHERE email = $1',
    [address]
  )
  // Same message either way: distinguishing them would confirm which emails
  // have accounts.
  const generic = { ok: false, reason: 'Email or password is incorrect.' }
  if (!rows.length) return generic
  if (!(await verifyPassword(password, rows[0].password_hash))) return generic

  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await pool.query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), rows[0].id, expires]
  )

  const { password_hash: _ignored, ...user } = rows[0]
  return { ok: true, user: user as User, token }
}

export async function logOut(token: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
}

/** Resolves a session token to its user, or null when absent or expired. */
export async function userForToken(token: string | undefined): Promise<User | null> {
  if (!token) return null
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.display_name, u.join_code, u.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)]
  )
  return rows.length ? (rows[0] as User) : null
}

export async function rotateJoinCode(userId: string): Promise<string> {
  const code = generateJoinCode()
  await pool.query('UPDATE users SET join_code = $1 WHERE id = $2', [code, userId])
  return code
}

export async function setDisplayName(userId: string, name: string): Promise<void> {
  await pool.query('UPDATE users SET display_name = $1 WHERE id = $2', [name.trim(), userId])
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; reason?: string }> {
  if (newPassword.length < 8) {
    return { ok: false, reason: 'Use at least 8 characters for your password.' }
  }
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId])
  if (!rows.length) return { ok: false, reason: 'Account not found.' }
  if (!(await verifyPassword(currentPassword, rows[0].password_hash))) {
    return { ok: false, reason: 'Current password is incorrect.' }
  }
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
    await hashPassword(newPassword),
    userId
  ])
  // Every other session is invalidated: a password change usually means the
  // old one is suspect.
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId])
  return { ok: true }
}

/**
 * Verifies a UUID + join code pair, for adding a collaborator.
 * Both must match, which is what stops a guessed UUID being enough.
 */
export async function verifyJoinCredentials(
  userId: string,
  joinCode: string
): Promise<User | null> {
  const { rows } = await pool.query(
    'SELECT id, email, display_name, join_code, created_at FROM users WHERE id = $1',
    [userId]
  )
  if (!rows.length) return null
  const expected = Buffer.from(rows[0].join_code)
  const supplied = Buffer.from(joinCode.trim().toUpperCase())
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null
  return rows[0] as User
}
