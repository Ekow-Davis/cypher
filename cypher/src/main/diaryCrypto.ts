import { randomBytes, scryptSync, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto'

/**
 * AES-256-GCM with scrypt key derivation, for diary content and password
 * verification. Two independent passwords protect different things — entry
 * (can you open the diary at all) and translate (can you read it in plain
 * text, vs. the glyph font) — so each gets its own salt and derived key. A
 * shared key would mean cracking one password exposes both gates.
 */

const SCRYPT_N = 2 ** 15 // ~30ms on typical hardware; strong enough for a local app, fast enough to not annoy
const KEY_LEN = 32
const IV_LEN = 12

export interface Encrypted {
  salt: string // hex
  iv: string // hex
  authTag: string // hex
  data: string // hex ciphertext
}

function deriveKey(password: string, salt: Buffer): Buffer {
  // scrypt's default memory ceiling (32MB) is smaller than N=2^15, r=8 needs
  // (128*N*r bytes = 32MB exactly, and cost accounting pushes it just over) —
  // raise maxmem explicitly rather than silently failing at runtime.
  return scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}

export function encrypt(plaintext: string, password: string): Encrypted {
  const salt = randomBytes(16)
  const iv = randomBytes(IV_LEN)
  const key = deriveKey(password, salt)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
    data: data.toString('hex')
  }
}

/** Returns null on a wrong password or corrupted data — GCM's auth tag check does both. */
export function decrypt(payload: Encrypted, password: string): string | null {
  try {
    const key = deriveKey(password, Buffer.from(payload.salt, 'hex'))
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'))
    decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'))
    const out = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'hex')),
      decipher.final()
    ])
    return out.toString('utf8')
  } catch {
    return null
  }
}

export function serialize(payload: Encrypted): string {
  return JSON.stringify(payload)
}
export function deserialize(text: string): Encrypted | null {
  try {
    const obj = JSON.parse(text)
    if (obj?.salt && obj?.iv && obj?.authTag && obj?.data) return obj as Encrypted
    return null
  } catch {
    return null
  }
}

/**
 * A password check that doesn't decrypt anything: encrypts a fixed marker at
 * setup time, and later re-derives the key and checks the auth tag. This is
 * what lets "is this password right" be answered without ever touching diary
 * content — useful for the lock screen, which shouldn't need to decrypt real
 * entries just to validate a guess.
 */
export function makeVerifier(password: string): string {
  return serialize(encrypt('cypher-diary-verifier', password))
}
export function checkVerifier(verifier: string, password: string): boolean {
  const payload = deserialize(verifier)
  if (!payload) return false
  const result = decrypt(payload, password)
  if (result === null) return false
  // constant-time compare of the known marker, not strictly necessary here
  // since GCM already gates on the auth tag, but cheap insurance
  const expected = Buffer.from('cypher-diary-verifier')
  const actual = Buffer.from(result)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/**
 * Content is encrypted with a random master key, never with the password
 * directly — the password only wraps (encrypts) that key. Changing the
 * password then means re-wrapping one small key, not re-encrypting every
 * entry; without this indirection, a password change would permanently lock
 * out everything written before it.
 */
export function generateContentKey(): Buffer {
  return randomBytes(KEY_LEN)
}

export function wrapContentKey(key: Buffer, password: string): string {
  return serialize(encrypt(key.toString('hex'), password))
}

export function unwrapContentKey(wrapped: string, password: string): Buffer | null {
  const payload = deserialize(wrapped)
  if (!payload) return null
  const hex = decrypt(payload, password)
  if (hex === null) return null
  return Buffer.from(hex, 'hex')
}

/** Encrypts with the raw content key directly (no password-based derivation). */
export function encryptWithKey(plaintext: string, key: Buffer): Encrypted {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    salt: '', // unused for direct-key encryption; kept for a uniform shape
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
    data: data.toString('hex')
  }
}

export function decryptWithKey(payload: Encrypted, key: Buffer): string | null {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'))
    decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'))
    const out = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'hex')),
      decipher.final()
    ])
    return out.toString('utf8')
  } catch {
    return null
  }
}
