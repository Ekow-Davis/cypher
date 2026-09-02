import { safeStorage } from 'electron'
import { getSetting, setSetting } from './settings'

/**
 * The signed-in account, as the desktop app sees it.
 *
 * The session token is encrypted with the OS keychain via safeStorage rather
 * than sitting in plain settings — it grants access to the user's books, so it
 * shouldn't be readable by anything that can open a JSON file. Online features
 * stay off until explicitly enabled, keeping the local-first promise intact
 * for anyone who never turns them on.
 */

const TOKEN_KEY = 'accountToken'
const PROFILE_KEY = 'accountProfile'
const ENABLED_KEY = 'onlineEnabled'

export interface AccountProfile {
  id: string
  email: string
  displayName: string
  joinCode: string
}

export function onlineEnabled(): boolean {
  return getSetting(ENABLED_KEY) === true
}

export function setOnlineEnabled(enabled: boolean): void {
  setSetting(ENABLED_KEY, enabled)
  // Turning it off signs out too: leaving a live token behind would mean the
  // app still holds credentials for a feature the user just switched off.
  if (!enabled) signOut()
}

function serverUrl(): string {
  return String(getSetting('shareServerUrl') ?? '')
    .trim()
    .replace(/\/+$/, '')
}

export function storeToken(token: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    setSetting(TOKEN_KEY, safeStorage.encryptString(token).toString('base64'))
  } else {
    // Some Linux desktops have no keyring; the token is still useful, and the
    // alternative is refusing to sign in at all.
    setSetting(TOKEN_KEY, token)
  }
}

export function readToken(): string | null {
  const stored = getSetting(TOKEN_KEY)
  if (typeof stored !== 'string' || !stored) return null
  if (!safeStorage.isEncryptionAvailable()) return stored
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    // Written on another machine, or the keychain changed.
    return null
  }
}

export function storedProfile(): AccountProfile | null {
  const stored = getSetting(PROFILE_KEY)
  return stored && typeof stored === 'object' ? (stored as AccountProfile) : null
}

export function signOut(): void {
  setSetting(TOKEN_KEY, null)
  setSetting(PROFILE_KEY, null)
}

export interface SignInResult {
  ok: boolean
  reason?: string
  profile?: AccountProfile
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  if (!onlineEnabled()) {
    return { ok: false, reason: 'Turn on online features in Settings → Data first.' }
  }
  const base = serverUrl()
  if (!base) return { ok: false, reason: 'Set your Cypher server URL in Settings → Data.' }

  try {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      return { ok: false, reason: body.error ?? `Sign in failed (${response.status}).` }
    }
    const data = (await response.json()) as { token: string; user: AccountProfile }
    storeToken(data.token)
    setSetting(PROFILE_KEY, data.user)
    return { ok: true, profile: data.user }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

/** Re-checks the stored token, refreshing the profile (the join code may have changed). */
export async function refreshProfile(): Promise<AccountProfile | null> {
  const token = readToken()
  const base = serverUrl()
  if (!token || !base || !onlineEnabled()) return null
  try {
    const response = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!response.ok) {
      if (response.status === 401) signOut()
      return null
    }
    const profile = (await response.json()) as AccountProfile
    setSetting(PROFILE_KEY, profile)
    return profile
  } catch {
    // Offline: keep whatever was stored rather than appearing signed out.
    return storedProfile()
  }
}

/** Looks up a collaborator by writer ID and join code. */
export async function verifyWriter(
  userId: string,
  joinCode: string
): Promise<{ ok: boolean; id?: string; displayName?: string; reason?: string }> {
  const token = readToken()
  const base = serverUrl()
  if (!token || !base) return { ok: false, reason: 'Sign in first.' }
  try {
    const response = await fetch(`${base}/api/users/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, joinCode })
    })
    const body = (await response.json().catch(() => ({}))) as {
      id?: string
      displayName?: string
      error?: string
    }
    if (!response.ok) return { ok: false, reason: body.error ?? 'Could not find that writer.' }
    return { ok: true, id: body.id, displayName: body.displayName }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
