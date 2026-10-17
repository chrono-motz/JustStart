const { contextBridge, ipcRenderer } = require('electron')

const invalidResult = (message) => Promise.resolve({ ok: false, error: message })

contextBridge.exposeInMainWorld('justStart', Object.freeze({
  openResource(resourcePath) {
    if (typeof resourcePath !== 'string') {
      return invalidResult('Resource path must be a string.')
    }
    return ipcRenderer.invoke('resource:open', resourcePath)
  },
  setLoginAutoStart(enabled) {
    if (typeof enabled !== 'boolean') {
      return invalidResult('Auto-start value must be a boolean.')
    }
    return ipcRenderer.invoke('login-autostart:set', enabled)
  },
}))
