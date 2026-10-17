/** The local-storage slot used by the browser MVP workspace. */
export const STORAGE_KEY = 'just-start.workspace'

/** Increment when the persisted workspace envelope changes shape. */
export const WORKSPACE_SCHEMA_VERSION = 1

function isPersistedWorkspace(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.version === WORKSPACE_SCHEMA_VERSION
    && Object.prototype.hasOwnProperty.call(value, 'workspace')
}

/**
 * Read a workspace from an injected local-storage-compatible object.
 * Missing storage, unreadable values, invalid JSON, and unknown schema
 * versions all leave the caller's fallback untouched.
 */
export function loadWorkspace(storage, fallback) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return fallback

    const raw = storage.getItem(STORAGE_KEY)
    if (typeof raw !== 'string' || raw.trim() === '') return fallback

    const persisted = JSON.parse(raw)
    return isPersistedWorkspace(persisted) ? persisted.workspace : fallback
  } catch {
    return fallback
  }
}

/**
 * Write a versioned workspace envelope without making persistence a hard
 * requirement for the browser MVP.
 */
export function saveWorkspace(storage, workspace) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return

    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: WORKSPACE_SCHEMA_VERSION,
      workspace,
    }))
  } catch {
    // Storage can be disabled, full, or otherwise unavailable in a browser.
  }
}
