/**
 * Camada de dados do Investigando.
 * App nativo: ~/Library/Application Support/Investigando/investigando.json
 * Navegador (dev): localStorage.
 */

import { bridge } from '../lib/bridge.js'

const KEY = 'investigando.data.v1'
const SETTINGS_KEY = 'investigando.settings.v1'

let currentPath = null
export function setProjectPath (p) { currentPath = p }
export function getProjectPath () { return currentPath }

export function loadSettings () {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {} } catch { return {} }
}
export function saveSettings (patch) {
  const next = { ...loadSettings(), ...patch }
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)) } catch { /* noop */ }
  return next
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export function emptyData () {
  return {
    schema: 1,
    project: { name: 'Projeto sem título', description: '', createdAt: new Date().toISOString() },
    transcripts: [],
    codes: [],
    excerpts: []
  }
}

export async function loadData () {
  try {
    if (bridge.isNative || bridge.isElectron) {
      const data = await bridge.load(currentPath)
      return data && data.schema ? data : emptyData()
    }
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : emptyData()
  } catch (err) {
    console.error('Falha ao carregar dados', err)
    return emptyData()
  }
}

let saveTimer = null
let pending = null
let flushing = false
let retryTimer = null
const saveListeners = new Set()

export function onSaveStatus (cb) {
  saveListeners.add(cb)
  return () => saveListeners.delete(cb)
}

function emitSave (status) {
  for (const cb of saveListeners) {
    try { cb(status) } catch { /* noop */ }
  }
}

export function retrySave () {
  flush()
}

async function flush () {
  if (!pending || flushing) return
  flushing = true
  const snapshot = pending
  pending = null
  try {
    let ok = true
    if (currentPath && (bridge.isNative || bridge.isElectron)) {
      const json = JSON.stringify(snapshot)
      const bytes = new TextEncoder().encode(json)
      let binary = ''
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
      }
      ok = await bridge.writePath(currentPath, btoa(binary))
    } else if (bridge.isNative || bridge.isElectron) {
      ok = await bridge.save(snapshot)
    } else {
      localStorage.setItem(KEY, JSON.stringify(snapshot))
    }
    if (ok === false) throw new Error('o arquivo do projeto não foi gravado')
    emitSave({ ok: true, at: Date.now() })
  } catch (err) {
    console.error('Falha ao salvar (flush)', err)
    if (!pending) pending = snapshot
    emitSave({ ok: false, message: String(err?.message || err), at: Date.now() })
    if (!retryTimer) {
      retryTimer = setTimeout(() => { retryTimer = null; flush() }, 4000)
    }
  } finally {
    flushing = false
  }
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush() })
  window.addEventListener('pagehide', flush)
}

export function saveData (data) {
  pending = data
  emitSave({ saving: true })
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    flush()
  }, 250)
}

export function dataPath () {
  return bridge.dataPath()
}

/* ---------------- seletores ---------------- */

export const byId = (list, id) => list.find((x) => x.id === id)

export function codeUsage (data, codeId) {
  return data.excerpts.filter((e) => e.codeId === codeId)
}

export function excerptCount (data, transcriptId) {
  return data.excerpts.filter((e) => e.transcriptId === transcriptId).length
}
