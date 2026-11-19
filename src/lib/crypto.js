/**
 * Proteção opcional do arquivo de projeto por senha.
 *
 * O arquivo continua sendo um JSON válido — quando protegido, o conteúdo é um
 * envelope enxuto:
 *
 *   {
 *     "codificando": {
 *       "v": 1,
 *       "kdf": "PBKDF2-SHA256",
 *       "iter": 210000,
 *       "salt": "<base64, 16 bytes>",
 *       "iv": "<base64, 12 bytes>",
 *       "cipher": "AES-GCM"
 *     },
 *     "data": "<base64 do ciphertext (UTF-8 do JSON original + tag GCM)>"
 *   }
 *
 * Chave: PBKDF2-SHA256(senha, salt, 210000 iterações) -> AES-GCM 256.
 * Salt e IV são aleatórios; a senha nunca é gravada em disco.
 *
 * Arquivos comuns (JSON simples com `schema`) são lidos exatamente como antes.
 */

const ENVELOPE_KEY = 'codificando'
const ENVELOPE_VERSION = 1
const KDF_NAME = 'PBKDF2-SHA256'
const CIPHER_NAME = 'AES-GCM'
const SALT_BYTES = 16
const IV_BYTES = 12

/** Custo do PBKDF2. Mantido no envelope para permitir migração futura. */
export const KDF_ITERATIONS = 210000

/** Erro tipado para a interface distinguir os casos. */
export class CryptoError extends Error {
  constructor (message, code) {
    super(message)
    this.name = 'CryptoError'
    this.code = code
  }
}

/* ---------------- base64 ---------------- */

export function bytesToBase64 (bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function base64ToBytes (b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function randomBytes (n) {
  const bytes = new Uint8Array(n)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

function subtle () {
  const c = globalThis.crypto?.subtle
  if (!c) throw new CryptoError('Este ambiente não oferece Web Crypto para proteger o projeto.', 'CRYPTO_UNAVAILABLE')
  return c
}

/* ---------------- detecção ---------------- */

/** O objeto já é um envelope protegido do Codificando? */
export function isEncryptedEnvelope (obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  const header = obj[ENVELOPE_KEY]
  if (!header || typeof header !== 'object' || Array.isArray(header)) return false
  return (
    header.v === ENVELOPE_VERSION &&
    header.kdf === KDF_NAME &&
    header.cipher === CIPHER_NAME &&
    typeof header.salt === 'string' && header.salt.length > 0 &&
    typeof header.iv === 'string' && header.iv.length > 0 &&
    typeof obj.data === 'string'
  )
}

/** Bytes (ou texto) de um arquivo são um envelope protegido? */
export function isEncryptedBytes (bytes) {
  if (bytes == null) return false
  try {
    let text
    if (typeof bytes === 'string') text = bytes
    else if (bytes instanceof Uint8Array) text = new TextDecoder().decode(bytes)
    else if (bytes instanceof ArrayBuffer) text = new TextDecoder().decode(new Uint8Array(bytes))
    else return false
    if (!text.includes('"' + ENVELOPE_KEY + '"')) return false
    return isEncryptedEnvelope(JSON.parse(text))
  } catch {
    return false
  }
}

/* ---------------- derivação de chave ---------------- */

/**
 * Cache de chaves derivadas: abrir e salvar o mesmo projeto não repete o
 * PBKDF2 a cada gravação. A chave só existe em memória.
 */
const keyCache = new Map()
const MAX_CACHED_KEYS = 8

function cacheKey (password, saltB64, iterations) {
  return `${iterations}:${saltB64}:${password}`
}

function rememberKey (key, password, saltB64, iterations) {
  if (keyCache.size >= MAX_CACHED_KEYS) {
    const first = keyCache.keys().next().value
    if (first !== undefined) keyCache.delete(first)
  }
  keyCache.set(cacheKey(password, saltB64, iterations), key)
}

async function deriveKey (password, salt, iterations) {
  const saltB64 = bytesToBase64(salt)
  const cached = keyCache.get(cacheKey(password, saltB64, iterations))
  if (cached) return cached
  const api = subtle()
  const material = await api.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  const key = await api.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
  rememberKey(key, password, saltB64, iterations)
  return key
}

/* ---------------- cifrar / decifrar ---------------- */

/**
 * Cifra um objeto JSON.
 *
 * @param {object} data conteúdo do projeto
 * @param {string} password senha em texto (mantida apenas em memória)
 * @param {{salt?: string}} [opts] reutiliza um salt existente (mesmo arquivo)
 * @returns {Promise<object>} envelope JSON pronto para `JSON.stringify`
 */
export async function encryptJson (data, password, opts = {}) {
  const pass = String(password ?? '')
  if (!pass) throw new CryptoError('Informe uma senha para proteger o projeto.', 'PASSWORD_REQUIRED')

  const salt = opts.salt ? base64ToBytes(opts.salt) : randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const key = await deriveKey(pass, salt, KDF_ITERATIONS)
  const plain = new TextEncoder().encode(JSON.stringify(data))

  let cipher
  try {
    cipher = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain))
  } catch (err) {
    throw new CryptoError('Não foi possível proteger o projeto: ' + (err?.message || err), 'ENCRYPT_FAILED')
  }

  return {
    [ENVELOPE_KEY]: {
      v: ENVELOPE_VERSION,
      kdf: KDF_NAME,
      iter: KDF_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      cipher: CIPHER_NAME
    },
    data: bytesToBase64(cipher)
  }
}

/** Lê o salt de um envelope (para reaproveitar a chave ao salvar). */
export function envelopeSalt (envelope) {
  return isEncryptedEnvelope(envelope) ? envelope[ENVELOPE_KEY].salt : null
}

/** Serializa o envelope em bytes UTF-8 (o que vai para o disco). */
export function envelopeToBytes (envelope) {
  return new TextEncoder().encode(JSON.stringify(envelope))
}

function parseEnvelope (value) {
  if (isEncryptedEnvelope(value)) return value
  if (typeof value === 'string' || value instanceof Uint8Array || value instanceof ArrayBuffer) {
    try {
      const text = typeof value === 'string' ? value : new TextDecoder().decode(value instanceof Uint8Array ? value : new Uint8Array(value))
      const parsed = JSON.parse(text)
      if (isEncryptedEnvelope(parsed)) return parsed
    } catch { /* cai no erro abaixo */ }
  }
  throw new CryptoError('Arquivo protegido inválido ou corrompido.', 'INVALID_ENVELOPE')
}

/**
 * Decifra um envelope e devolve o objeto do projeto.
 * Senha errada (ou conteúdo adulterado) resulta em "Senha incorreta.".
 *
 * @param {object|string|Uint8Array} envelope
 * @param {string} password
 * @returns {Promise<object>}
 */
export async function decryptJson (envelope, password) {
  const env = parseEnvelope(envelope)
  const header = env[ENVELOPE_KEY]
  const pass = String(password ?? '')
  if (!pass) throw new CryptoError('Senha incorreta.', 'PASSWORD_INVALID')

  const iterations = Number(header.iter) > 0 ? Number(header.iter) : KDF_ITERATIONS
  let plain
  try {
    const salt = base64ToBytes(header.salt)
    const iv = base64ToBytes(header.iv)
    const key = await deriveKey(pass, salt, iterations)
    plain = await subtle().decrypt(
      { name: 'AES-GCM', iv },
      key,
      base64ToBytes(env.data)
    )
  } catch (err) {
    if (err instanceof CryptoError) throw err
    throw new CryptoError('Senha incorreta.', 'PASSWORD_INVALID')
  }

  try {
    return JSON.parse(new TextDecoder().decode(plain))
  } catch {
    throw new CryptoError('O conteúdo protegido não é um projeto válido.', 'INVALID_CONTENT')
  }
}
