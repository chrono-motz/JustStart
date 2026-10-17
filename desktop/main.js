import { app, BrowserWindow, ipcMain, shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isDevServer = process.env.JUST_START_DEV_SERVER === '1'

let mainWindow

function quoteDesktopArgument(value) {
  return `"${value.replace(/[\\"`$]/g, '\\$&')}"`
}

function getAutostartFile() {
  return path.join(app.getPath('appData'), 'autostart', 'just-start.desktop')
}

function getDesktopExec() {
  if (app.isPackaged) return quoteDesktopArgument(process.execPath)
  return `${quoteDesktopArgument(process.execPath)} ${quoteDesktopArgument(app.getAppPath())}`
}

function getDesktopEntry() {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=Just Start',
    'Comment=Begin with the next useful thing',
    `Exec=${getDesktopExec()}`,
    'Terminal=false',
    'Categories=Education;',
    'StartupWMClass=just-start',
    '',
  ].join('\n')
}

async function setLinuxAutostart(enabled) {
  const filePath = getAutostartFile()
  if (enabled) {
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
    await fs.writeFile(filePath, getDesktopEntry(), { mode: 0o600 })
  } else {
    await fs.rm(filePath, { force: true })
  }
}

async function setLoginAutoStart(enabled) {
  const openAtLogin = Boolean(enabled)
  let loginItemError

  if (typeof app.setLoginItemSettings === 'function') {
    try {
      app.setLoginItemSettings({ openAtLogin })
    } catch (error) {
      loginItemError = error
    }
  }

  if (process.platform === 'linux') {
    await setLinuxAutostart(openAtLogin)
  }

  if (loginItemError && process.platform !== 'linux') {
    throw loginItemError
  }

  return { ok: true, enabled: openAtLogin }
}

function resolveResource(resourcePath) {
  if (typeof resourcePath !== 'string' || resourcePath.length === 0 || resourcePath.includes('\0')) {
    throw new Error('Resource path must be a non-empty string.')
  }
  if (path.win32.isAbsolute(resourcePath) || resourcePath.startsWith('//')) {
    throw new Error('Resource path must be app-relative.')
  }

  const relativePath = resourcePath.replace(/^\/+/, '')
  const appRoot = path.resolve(app.getAppPath())
  const resolvedPath = path.resolve(appRoot, relativePath)
  const relativeToApp = path.relative(appRoot, resolvedPath)
  if (relativeToApp.startsWith('..') || path.isAbsolute(relativeToApp)) {
    throw new Error('Resource path must stay inside the app.')
  }
  return resolvedPath
}

async function openResource(resourcePath) {
  const resolvedPath = resolveResource(resourcePath)
  const error = await shell.openPath(resolvedPath)
  return error ? { ok: false, error } : { ok: true }
}

function registerIpcHandlers() {
  ipcMain.handle('resource:open', async (_event, resourcePath) => {
    try {
      return await openResource(resourcePath)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unable to open resource.' }
    }
  })

  ipcMain.handle('login-autostart:set', async (_event, enabled) => {
    try {
      if (typeof enabled !== 'boolean') return { ok: false, error: 'Auto-start value must be a boolean.' }
      return await setLoginAutoStart(enabled)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unable to update auto-start.' }
    }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 720,
    backgroundColor: '#f6f7fb',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (isDevServer) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  }
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
