const { contextBridge, ipcRenderer } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

contextBridge.exposeInMainWorld('investigando', {
  isDesktop: true,
  platform: process.platform,
  store: {
    load: () => ipcRenderer.invoke('store:load'),
    save: (data) => ipcRenderer.invoke('store:save', data),
    path: () => ipcRenderer.invoke('store:path')
  },
  openTranscripts: () => ipcRenderer.invoke('dialog:openTranscripts'),
  readFile: async (filePath) => {
    const buf = fs.readFileSync(filePath)
    return { name: path.basename(filePath), bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
  },
  print: () => ipcRenderer.invoke('print'),
  onMenuImport: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('menu:import', handler)
    return () => ipcRenderer.removeListener('menu:import', handler)
  }
})
