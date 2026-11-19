/**
 * Ponte com o app nativo.
 * Tauri (Rust) é o alvo principal; WKWebView/Swift e Electron continuam aceitos.
 * Em desenvolvimento no navegador, cai nos adaptadores equivalentes.
 */

import { invoke } from '@tauri-apps/api/core'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const wk = typeof window !== 'undefined' ? window.webkit?.messageHandlers?.investigando : null
const electron = typeof window !== 'undefined' ? window.investigando : null

let seq = 0
const pending = new Map()

if (wk) {
  window.__invResolve = (id, value) => {
    const resolve = pending.get(id)
    if (resolve) {
      pending.delete(id)
      resolve(value)
    }
  }
}

function callWk (action, payload) {
  return new Promise((resolve) => {
    const id = 'r' + (++seq)
    pending.set(id, resolve)
    wk.postMessage({ id, action, payload })
  })
}

/* Watcher do arquivo do projeto: um único listen, vários interessados. */
const fileWatchers = new Set()
let fileUnlisten = null
let fileListenPromise = null

async function ensureFileListener () {
  if (!isTauri || fileUnlisten) return
  if (!fileListenPromise) {
    fileListenPromise = import('@tauri-apps/api/event')
      .then(({ listen }) => listen('project-file-changed', (event) => {
        for (const fn of fileWatchers) {
          try { fn(event.payload) } catch (err) { console.error('Watcher do projeto:', err) }
        }
      }))
      .then((un) => { fileUnlisten = un })
      .catch((err) => {
        console.error('Falha ao escutar mudanças do projeto', err)
        fileListenPromise = null
      })
  }
  await fileListenPromise
}

async function setWatchedProject (path) {
  if (!isTauri || !path) return false
  try {
    return await invoke('watch_project', { path })
  } catch (err) {
    console.error('Falha ao observar o arquivo do projeto', err)
    return false
  }
}

/** O app está em foco? Evita notificação redundante. */
function appFocused () {
  try {
    return typeof document !== 'undefined' && document.hasFocus()
  } catch {
    return false
  }
}

export const bridge = {
  isNative: isTauri || !!wk,
  isElectron: !!electron?.isDesktop,

  async load (path = null) {
    if (isTauri) return invoke('store_load', { path: path || null })
    if (wk) return callWk('store.load')
    if (electron?.store) return electron.store.load()
    return null
  },

  async save (data) {
    if (isTauri) return invoke('store_save', { data })
    if (wk) return callWk('store.save', data)
    if (electron?.store) return electron.store.save(data)
    return false
  },

  async dataPath () {
    if (isTauri) return invoke('data_path')
    if (wk) return callWk('dataPath')
    if (electron?.store) return electron.store.path()
    return 'localStorage'
  },

  async saveFile (name, content, mime = 'text/plain') {
    if (isTauri) return invoke('save_file', { name, content, mime })
    if (wk) return callWk('saveFile', { name, content, mime })
    if (electron?.saveFile) return electron.saveFile(name, content, mime)
    const blob = new Blob([content], { type: mime })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1500)
    return true
  },

  async saveBytes (name, base64, mime = 'application/octet-stream') {
    if (isTauri) return invoke('save_bytes', { name, base64, mime })
    if (wk) return callWk('saveBytes', { name, base64, mime })
    if (electron?.saveBytes) return electron.saveBytes(name, base64, mime)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: mime })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1500)
    return true
  },

  async print () {
    if (isTauri) return invoke('print_window')
    if (wk) return callWk('print')
    if (electron?.print) return electron.print()
    window.print()
    return true
  },

  /* binários (PDF) — gravados em Application Support/Investigando/files */
  async saveBinary (name, base64, key) {
    if (isTauri) return invoke('files_save', { name, base64, key })
    if (wk) return callWk('files.save', { name, base64, key })
    if (electron?.saveBinary) return electron.saveBinary(name, base64, key)
    return key
  },

  async readBinary (key) {
    if (isTauri) return invoke('files_read', { key })
    if (wk) return callWk('files.read', { key })
    if (electron?.readBinary) return electron.readBinary(key)
    return null
  },

  async pickFiles () {
    if (isTauri) return invoke('pick_files')
    if (wk) return callWk('pickFiles')
    if (electron?.pickFiles) return electron.pickFiles()
    return null
  },

  async readPath (path) {
    if (isTauri) return invoke('read_path', { path })
    if (wk) return callWk('files.readPath', { path })
    if (electron?.readPath) return electron.readPath(path)
    return null
  },

  async writePath (path, base64) {
    if (isTauri) return invoke('write_path', { path, base64 })
    if (wk) return callWk('files.writePath', { path, base64 })
    if (electron?.writePath) return electron.writePath(path, base64)
    return false
  },

  async pickImages () {
    if (isTauri) return invoke('pick_images')
    if (wk) return callWk('project.pickImages')
    if (electron?.pickImages) return electron.pickImages()
    return null
  },

  async pickImage () {
    if (isTauri) return invoke('pick_image')
    if (wk) return callWk('project.pickImage')
    if (electron?.pickImage) return electron.pickImage()
    return null
  },

  async savePanel (name) {
    if (isTauri) return invoke('save_panel', { name })
    if (wk) return callWk('project.savePanel', { name })
    if (electron?.savePanel) return electron.savePanel(name)
    return null
  },

  async openPanel () {
    if (isTauri) return invoke('open_panel')
    if (wk) return callWk('project.openPanel')
    if (electron?.openPanel) return electron.openPanel()
    return null
  },

  async deleteBinary (key) {
    if (isTauri) return invoke('files_delete', { key })
    if (wk) return callWk('files.delete', { key })
    if (electron?.deleteBinary) return electron.deleteBinary(key)
    return true
  },

  /* conversão de .doc/.rtf em texto (textutil do macOS) */
  async convertDocument (base64, ext) {
    if (isTauri) return invoke('convert_document', { base64, ext })
    if (wk) return callWk('convert', { base64, ext })
    if (electron?.convertDocument) return electron.convertDocument(base64, ext)
    return null
  },

  /* ---------- recursos nativos ---------- */

  /** Notificação do sistema. Ignorada quando a janela está em foco. */
  async notify (title, body) {
    if (!title) return false
    if (appFocused()) return false

    if (isTauri) {
      try {
        const {
          isPermissionGranted,
          requestPermission,
          sendNotification
        } = await import('@tauri-apps/plugin-notification')
        let granted = await isPermissionGranted()
        if (!granted) granted = (await requestPermission()) === 'granted'
        if (!granted) return false
        sendNotification({ title, body: body || '' })
        return true
      } catch (err) {
        console.warn('Notificação nativa indisponível', err)
        return false
      }
    }

    try {
      if (typeof Notification === 'undefined') return false
      if (Notification.permission === 'default') await Notification.requestPermission()
      if (Notification.permission !== 'granted') return false
      const n = new Notification(title, { body: body || '' })
      n.onclick = () => { window.focus(); n.close() }
      return true
    } catch {
      return false
    }
  },

  /** Abre um link no navegador padrão. */
  async openExternal (url) {
    if (!url) return false
    if (isTauri) return invoke('open_external', { url })
    window.open(url, '_blank', 'noopener,noreferrer')
    return true
  },

  /** Revela um arquivo/pasta no Finder (macOS) ou gerenciador de arquivos. */
  async revealPath (path) {
    if (!path) return false
    if (isTauri) return invoke('reveal_path', { path })
    return false
  },

  /** Pasta de dados do app (~/Library/Application Support/Investigando). */
  async dataDir () {
    if (isTauri) return invoke('data_dir_path')
    return 'localStorage'
  },

  /**
   * Observa o arquivo do projeto e chama handler(payload) quando ele muda
   * no disco. Devolve a função para cancelar a observação.
   */
  async watchProject (path, handler) {
    if (!isTauri) return () => {}
    const fn = typeof handler === 'function' ? handler : () => {}
    fileWatchers.add(fn)
    await ensureFileListener()
    if (path) await setWatchedProject(path)
    return () => { fileWatchers.delete(fn) }
  },

  /** Troca o arquivo observado (ao abrir/salvar um projeto). */
  async setWatchedProject (path) {
    return setWatchedProject(path)
  },

  /* backups locais do arquivo de projeto */
  async backupCreate (path) {
    if (isTauri) return invoke('backup_create', { path })
    if (wk) return callWk('backup.create', { path })
    if (electron?.backupCreate) return electron.backupCreate(path)
    return null
  },

  async backupList (path) {
    if (isTauri) return invoke('backup_list', { path })
    if (wk) return callWk('backup.list', { path })
    if (electron?.backupList) return electron.backupList(path)
    return []
  },

  async backupRestore (path, id) {
    if (isTauri) return invoke('backup_restore', { path, id })
    if (wk) return callWk('backup.restore', { path, id })
    if (electron?.backupRestore) return electron.backupRestore(path, id)
    return false
  },

  async backupDelete (path, id) {
    if (isTauri) return invoke('backup_delete', { path, id })
    if (wk) return callWk('backup.delete', { path, id })
    if (electron?.backupDelete) return electron.backupDelete(path, id)
    return false
  },

  /* OCR nativo (Apple Vision) de uma página renderizada em PNG base64 */
  async ocrImage (base64) {
    if (isTauri) return invoke('ocr_image', { base64 })
    if (wk) return callWk('ocr.image', { base64 })
    if (electron?.ocrImage) return electron.ocrImage(base64)
    throw new Error('ocr-unavailable')

  }
}
