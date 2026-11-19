const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const isDev = !app.isPackaged
const DATA_FILE = () => path.join(app.getPath('userData'), 'investigando.json')

let win = null

function readStore () {
  try {
    const raw = fs.readFileSync(DATA_FILE(), 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Falha ao ler dados:', err)
    return null
  }
}

function writeStore (data) {
  const file = DATA_FILE()
  const tmp = file + '.tmp'
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8')
  fs.renameSync(tmp, file) // escrita atômica
  return true
}

function createWindow () {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#FFFFFF',
    title: 'Investigando',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function buildMenu () {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac
      ? [{
          label: 'Investigando',
          submenu: [
            { role: 'about', label: 'Sobre o Investigando' },
            { type: 'separator' },
            { role: 'hide', label: 'Ocultar Investigando' },
            { role: 'hideOthers', label: 'Ocultar Outros' },
            { role: 'unhide', label: 'Mostrar Tudo' },
            { type: 'separator' },
            { role: 'quit', label: 'Encerrar Investigando' }
          ]
        }]
      : []),
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Importar transcrições…',
          accelerator: 'CmdOrCtrl+O',
          click: () => win && win.webContents.send('menu:import')
        },
        {
          label: 'Exportar projeto (.json)…',
          click: async () => {
            if (!win) return
            const { canceled, filePath } = await dialog.showSaveDialog(win, {
              title: 'Exportar projeto',
              defaultPath: 'investigando-projeto.json',
              filters: [{ name: 'JSON', extensions: ['json'] }]
            })
            if (canceled || !filePath) return
            fs.copyFileSync(DATA_FILE(), filePath)
          }
        },
        { type: 'separator' },
        {
          label: 'Mostrar pasta de dados',
          click: () => shell.openPath(app.getPath('userData'))
        },
        { type: 'separator' },
        { role: 'close', label: 'Fechar janela' }
      ]
    },
    { role: 'editMenu', label: 'Editar' },
    {
      label: 'Visualizar',
      submenu: [
        { role: 'reload', label: 'Recarregar' },
        { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamanho real' },
        { role: 'zoomIn', label: 'Aumentar' },
        { role: 'zoomOut', label: 'Diminuir' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' }
      ]
    },
    { role: 'windowMenu', label: 'Janela' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  ipcMain.handle('store:load', () => readStore())
  ipcMain.handle('store:save', (_e, data) => writeStore(data))
  ipcMain.handle('store:path', () => DATA_FILE())
  ipcMain.handle('dialog:openTranscripts', async () => {
    if (!win) return []
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Importar transcrições',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Transcrições', extensions: ['txt', 'pdf', 'docx'] }]
    })
    if (canceled) return []
    return filePaths.map((p) => ({ path: p, name: path.basename(p) }))
  })
  ipcMain.handle('print', () => { if (win) win.webContents.print({}) })

  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
