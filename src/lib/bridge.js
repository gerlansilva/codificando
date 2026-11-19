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

  /* revela um arquivo ou pasta no Finder */
  async revealPath (path) {
    if (isTauri) return invoke('reveal_path', { path })
    if (wk) return callWk('revealPath', { path })
    if (electron?.revealPath) return electron.revealPath(path)
    return false
  }
}
