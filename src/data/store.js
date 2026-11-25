/**
 * Camada de dados do Investigando.
 * App nativo: ~/Library/Application Support/Investigando/investigando.json
 * Navegador (dev): localStorage.
 */

import { bridge } from '../lib/bridge.js'
import { decryptJson, encryptJson, envelopeSalt, isEncryptedEnvelope } from '../lib/crypto.js'

const KEY = 'investigando.data.v1'
const SETTINGS_KEY = 'investigando.settings.v1'
const RECENT_KEY = 'codificando.recentProjects'
const MAX_RECENT = 10

let currentPath = null
export function setProjectPath (p) { currentPath = p }
export function getProjectPath () { return currentPath }

/* ---------------- proteção por senha ----------------
 * Senhas vivem só na memória deste módulo (Map por caminho). Nada de
 * localStorage, nada no arquivo. Ao fechar o app, tudo é esquecido.
 */

const LOCAL_KEY = '__local__'
const passwords = new Map()   // caminho -> senha (texto)
const salts = new Map()       // caminho -> salt do envelope atual
const protectedPaths = new Set()
let passwordPrompt = null

const keyFor = (path) => path || LOCAL_KEY

/** O App registra aqui como pedir a senha (fallback além do erro tipado). */
export function setPasswordPrompt (fn) {
  passwordPrompt = typeof fn === 'function' ? fn : null
}

export class PasswordRequiredError extends Error {
  constructor (path) {
    super('Este projeto está protegido por senha.')
    this.name = 'PasswordRequiredError'
    this.code = 'PASSWORD_REQUIRED'
    this.path = path || null
  }
}

export class PasswordInvalidError extends Error {
  constructor (path) {
    super('Senha incorreta.')
    this.name = 'PasswordInvalidError'
    this.code = 'PASSWORD_INVALID'
    this.path = path || null
  }
}

/** O projeto (carregado ou ainda bloqueado) tem envelope cifrado? */
export function isProjectProtected (path = currentPath) {
  return protectedPaths.has(keyFor(path))
}

/** A senha deste projeto está disponível na memória desta sessão? */
export function hasProjectPassword (path = currentPath) {
  return passwords.has(keyFor(path))
}

/** Guarda a senha apenas em memória (nunca persiste). */
export function rememberPassword (path, password) {
  if (!password) return false
  const key = keyFor(path)
  passwords.set(key, String(password))
  protectedPaths.add(key)
  return true
}

/**
 * Marca o projeto como protegido com uma senha nova.
 * O salt é renovado; a próxima gravação cifra o arquivo.
 */
export function setProjectPassword (path, password) {
  if (!password) return false
  const key = keyFor(path)
  passwords.set(key, String(password))
  salts.delete(key)
  protectedPaths.add(key)
  return true
}

/** Remove a proteção da memória; a próxima gravação sai em JSON simples. */
export function forgetProjectPassword (path = currentPath) {
  const key = keyFor(path)
  passwords.delete(key)
  salts.delete(key)
  protectedPaths.delete(key)
}

/** Confere a senha atual (usada em “trocar” e “remover senha”). */
export function checkProjectPassword (path, password) {
  const current = passwords.get(keyFor(path))
  return !!current && current === String(password ?? '')
}

/* ---------------- projetos recentes ---------------- */

export function loadRecentProjects () {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY))
    return Array.isArray(list)
      ? list.filter((r) => r && typeof r.path === 'string' && r.path)
      : []
  } catch { return [] }
}

/** Tira um projeto da lista de recentes (ex.: arquivo apagado ou movido). */
export function removeRecentProject (path) {
  const next = loadRecentProjects().filter((r) => r.path !== path)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* noop */ }
  return next
}

/** Erro tipado: o arquivo do projeto não existe mais (ou não pôde ser lido). */
export class ProjectMissingError extends Error {
  constructor (path) {
    super('Projeto não encontrado: ' + path)
    this.code = 'PROJECT_MISSING'
    this.path = path
  }
}

/** Registra/atualiza um projeto no topo da lista de recentes (máx. 10). */
export function touchRecentProject (path, name) {
  if (!path) return loadRecentProjects()
  const previous = loadRecentProjects().filter((r) => r.path !== path)
  const item = {
    path,
    name: (name || '').trim() || 'Projeto sem título',
    at: new Date().toISOString()
  }
  const next = [item, ...previous].slice(0, MAX_RECENT)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* noop */ }
  return next
}

/** Caminho curto para exibição: ~/…/pasta/arquivo.investigando */
export function shortPath (path, max = 46) {
  if (!path) return ''
  const home = path.replace(/^\/Users\/[^/]+\//, '~/')
  if (home.length <= max) return home
  const parts = home.split('/')
  if (parts.length <= 3) return home
  const tail = parts.slice(-2).join('/')
  return parts[0] + '/…/' + tail
}


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

/**
 * Decifra o envelope, se houver, usando a senha em memória.
 * Sem senha, tenta o callback do App e, em último caso, lança
 * PASSWORD_REQUIRED para a interface abrir o modal.
 */
async function decodeProject (raw, path) {
  const key = keyFor(path)
  if (!isEncryptedEnvelope(raw)) {
    protectedPaths.delete(key)
    return raw
  }

  protectedPaths.add(key)
  let password = passwords.get(key)

  if (!password && typeof passwordPrompt === 'function') {
    const asked = await passwordPrompt({ path, mode: 'unlock' })
    if (asked) {
      password = String(asked)
      passwords.set(key, password)
    }
  }
  if (!password) throw new PasswordRequiredError(path)

  try {
    const data = await decryptJson(raw, password)
    salts.set(key, envelopeSalt(raw))
    return data
  } catch (err) {
    passwords.delete(key)
    throw new PasswordInvalidError(path)
  }
}

export async function loadData (path = currentPath) {
  try {
    if (bridge.isNative || bridge.isElectron) {
      const raw = await bridge.load(path)
      // arquivo escolhido pelo usuário sumiu: avisar em vez de abrir um projeto vazio
      if (path && raw == null) throw new ProjectMissingError(path)
      const data = await decodeProject(raw, path)
      return data && data.schema ? data : emptyData()
    }
    const rawText = localStorage.getItem(KEY)
    if (!rawText) return emptyData()
    const data = await decodeProject(JSON.parse(rawText), path)
    return data && data.schema ? data : emptyData()
  } catch (err) {
    if (err?.code === 'PASSWORD_REQUIRED' || err?.code === 'PASSWORD_INVALID' || err?.code === 'PROJECT_MISSING') throw err
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
    const key = keyFor(currentPath)
    const password = passwords.get(key)
    let payload = snapshot
    if (password) {
      // Projeto protegido: grava o envelope cifrado (JSON válido).
      const envelope = await encryptJson(snapshot, password, { salt: salts.get(key) || undefined })
      salts.set(key, envelopeSalt(envelope))
      payload = envelope
    } else if (protectedPaths.has(key)) {
      // Nunca gravar JSON simples por cima de um arquivo protegido.
      throw new Error('projeto protegido: confirme a senha antes de salvar')
    }
    if (currentPath && (bridge.isNative || bridge.isElectron)) {
      const json = JSON.stringify(payload)
      const bytes = new TextEncoder().encode(json)
      let binary = ''
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
      }
      ok = await bridge.writePath(currentPath, btoa(binary))
    } else if (bridge.isNative || bridge.isElectron) {
      ok = await bridge.save(payload)
    } else {
      localStorage.setItem(KEY, JSON.stringify(payload))
    }
    if (ok === false) throw new Error('o arquivo do projeto não foi gravado')
    if (currentPath) {
      touchRecentProject(currentPath, snapshot?.project?.name)
      // backup best-effort: não bloqueia nem falha o salvamento
      Promise.resolve(bridge.backupCreate(currentPath)).catch(() => {})
    }
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

/**
 * Grava agora (usado ao proteger/remover senha e no “Salvar como…”),
 * garantindo que o arquivo já reflita o novo modo. Se houver gravação em
 * andamento, espera terminar para não deixar um JSON simples para trás.
 */
export async function flushNow (data) {
  if (data) pending = data
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  for (let i = 0; flushing && i < 200; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  if (data) pending = data
  await flush()
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
