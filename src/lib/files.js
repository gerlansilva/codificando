/**
 * Armazenamento de binários (PDFs) anexados às transcrições.
 * Nativo: arquivos em ~/Library/Application Support/Investigando/files
 * Navegador (dev): IndexedDB
 */

import { bridge } from './bridge.js'

const DB_NAME = 'investigando-files'
const STORE = 'files'

function openDB () {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut (key, buffer) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(buffer, key)
    tx.oncomplete = () => resolve(key)
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGet (key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

async function idbDelete (key) {
  const db = await openDB()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => resolve(false)
  })
}

export function toBase64 (arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function fromBase64 (b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function saveBinary (name, arrayBuffer) {
  const key = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + '.pdf'
  if (bridge.isNative || bridge.isElectron) {
    const saved = await bridge.saveBinary(name, toBase64(arrayBuffer), key)
    return saved || key
  }
  await idbPut(key, arrayBuffer)
  return key
}

export async function readBinary (key) {
  if (!key) return null
  if (bridge.isNative || bridge.isElectron) {
    const b64 = await bridge.readBinary(key)
    return b64 ? fromBase64(b64) : null
  }
  const buf = await idbGet(key)
  return buf ? new Uint8Array(buf) : null
}

export async function deleteBinary (key) {
  if (!key) return
  if (bridge.isNative || bridge.isElectron) return bridge.deleteBinary(key)
  return idbDelete(key)
}
