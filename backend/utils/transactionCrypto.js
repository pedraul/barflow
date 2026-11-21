// AES-256-GCM encryption for financial transaction records.
//
// Key: TRANSACTION_ENCRYPTION_KEY = 32 random bytes, base64 or hex encoded.
//   Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Keep the same key in every environment that shares a database, and back it up:
// records sealed with a lost key cannot be decrypted.
//
// Format of a sealed value:  v1.<iv base64>.<auth tag base64>.<ciphertext base64>
// GCM authenticates the data, so any change to a sealed record makes decryption fail.
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const VERSION = 'v1'
const IV_BYTES = 12

let cachedKey
let warned = false

function loadKey() {
  if (cachedKey !== undefined) return cachedKey
  const raw = String(process.env.TRANSACTION_ENCRYPTION_KEY || '').trim()
  let key = null
  if (raw) {
    if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex')
    else {
      try {
        const decoded = Buffer.from(raw, 'base64')
        if (decoded.length === 32) key = decoded
      } catch { /* invalid */ }
    }
    if (!key) throw new Error('TRANSACTION_ENCRYPTION_KEY must be 32 bytes, base64 or hex encoded.')
  }
  cachedKey = key
  return cachedKey
}

/** True when a valid key is configured. */
export function isTransactionEncryptionConfigured() {
  try {
    return Boolean(loadKey())
  } catch {
    return false
  }
}

function requireKey() {
  const key = loadKey()
  if (!key) {
    if (!warned) {
      console.error('[security] TRANSACTION_ENCRYPTION_KEY is not set: financial transactions are NOT being sealed.')
      warned = true
    }
    return null
  }
  return key
}

/**
 * Encrypts a value (object or string) with AES-256-GCM.
 * `context` is bound as additional authenticated data: decrypting with a
 * different context fails, so a sealed record can't be moved to another row.
 * Returns null when no key is configured.
 */
export function encryptRecord(value, context = '') {
  const key = requireKey()
  if (!key) return null
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  if (context) cipher.setAAD(Buffer.from(String(context), 'utf8'))
  const plaintext = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.')
}

/** Decrypts a sealed value. Throws if the key, context or data don't match (tampering). */
export function decryptRecord(sealed, context = '', { parseJson = true } = {}) {
  const key = loadKey()
  if (!key) throw new Error('TRANSACTION_ENCRYPTION_KEY is not set.')
  const [version, ivB64, tagB64, dataB64] = String(sealed || '').split('.')
  if (version !== VERSION || !ivB64 || !tagB64 || dataB64 === undefined) {
    throw new Error('Not a sealed record.')
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'))
  if (context) decipher.setAAD(Buffer.from(String(context), 'utf8'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
  return parseJson ? JSON.parse(plaintext) : plaintext
}

export const SEAL_VERSION = VERSION
