import { describe, expect, it } from 'vitest'
import {
  loadWorkspace,
  saveWorkspace,
  STORAGE_KEY,
  WORKSPACE_SCHEMA_VERSION,
} from './persistence.js'

function createStorage(initialValue) {
  let value = initialValue
  return {
    getItem: () => value,
    setItem: (_key, nextValue) => {
      value = nextValue
    },
  }
}

describe('workspace persistence', () => {
  it('round-trips a workspace through a versioned storage envelope', () => {
    const storage = createStorage()
    const workspace = {
      resources: [{ id: 'parsing', progress: 0.4 }],
      selectedId: 'parsing',
    }

    saveWorkspace(storage, workspace)

    expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify({
      version: WORKSPACE_SCHEMA_VERSION,
      workspace,
    }))
    expect(loadWorkspace(storage, { resources: [] })).toEqual(workspace)
  })

  it('returns the fallback for malformed or unsupported persisted data', () => {
    const fallback = { resources: [], selectedId: null }
    const storage = createStorage('{not valid json')

    expect(loadWorkspace(storage, fallback)).toBe(fallback)

    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: WORKSPACE_SCHEMA_VERSION + 1,
      workspace: { resources: [{ id: 'future' }] },
    }))
    expect(loadWorkspace(storage, fallback)).toBe(fallback)
  })

  it('falls back and does not throw when storage is unavailable', () => {
    const fallback = { resources: [] }
    const unavailable = {
      getItem: () => {
        throw new Error('storage disabled')
      },
      setItem: () => {
        throw new Error('storage disabled')
      },
    }

    expect(loadWorkspace(null, fallback)).toBe(fallback)
    expect(loadWorkspace(unavailable, fallback)).toBe(fallback)
    expect(() => saveWorkspace(null, { resources: [] })).not.toThrow()
    expect(() => saveWorkspace(unavailable, { resources: [] })).not.toThrow()
  })
})
