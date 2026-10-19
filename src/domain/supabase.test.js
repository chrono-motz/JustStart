import { describe, expect, it, vi } from 'vitest'
import {
  SUPABASE_STORAGE_BUCKET,
  createSignedStorageUrl,
  createSupabaseBrowserClient,
  getSupabaseSession,
  getSupabaseConfigStatus,
  removeStorageFile,
  readWorkspace,
  signInWithMagicLink,
  signOut,
  upsertWorkspace,
  uploadStorageFile,
} from './supabase.js'

function authClient(session = { user: { id: 'user-1' } }) {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      signInWithOtp: vi.fn(async () => ({ data: { messageId: 'safe' }, error: null })),
    },
  }
}

describe('Supabase backend layer', () => {
  it('reports missing and complete public configuration', () => {
    expect(getSupabaseConfigStatus({})).toEqual({
      configured: false,
      missing: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    })
    expect(getSupabaseConfigStatus({
      VITE_SUPABASE_URL: ' https://example.supabase.co ',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    })).toEqual({ configured: true, missing: [] })
  })

  it('creates a browser client from the publishable key only', () => {
    const createClientImpl = vi.fn(() => ({ client: true }))
    const client = createSupabaseBrowserClient({
      environment: {
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      },
      createClientImpl,
    })

    expect(client).toEqual({ client: true })
    expect(createClientImpl).toHaveBeenCalledWith('https://example.supabase.co', 'sb_publishable_test')
  })

  it('supports magic-link sign-in and reads/upserts the current user workspace', async () => {
    const client = authClient()
    const row = { user_id: 'user-1', data: { topic: 'parsing' }, updated_at: '2026-01-01T00:00:00Z' }
    const workspaceQuery = {
      select: vi.fn(() => workspaceQuery),
      eq: vi.fn(() => workspaceQuery),
      maybeSingle: vi.fn(async () => ({ data: row, error: null })),
      upsert: vi.fn(() => workspaceQuery),
      single: vi.fn(async () => ({ data: row, error: null })),
    }
    client.from = vi.fn(() => workspaceQuery)

    await expect(signInWithMagicLink('learner@example.com', {
      client,
      redirectTo: 'https://example.com/auth/callback',
    })).resolves.toEqual({ messageId: 'safe' })
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'learner@example.com',
      options: { emailRedirectTo: 'https://example.com/auth/callback' },
    })
    await expect(readWorkspace({ client })).resolves.toEqual(row)
    await expect(upsertWorkspace({ topic: 'parsing' }, { client })).resolves.toEqual(row)
    expect(workspaceQuery.upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', data: { topic: 'parsing' } },
      { onConflict: 'user_id' },
    )
    await expect(getSupabaseSession({ client })).resolves.toMatchObject({ user: { id: 'user-1' } })
    client.auth.signOut = vi.fn(async () => ({ error: null }))
    await expect(signOut({ client })).resolves.toBe(true)
  })

  it('scopes private Storage operations to the current user', async () => {
    const client = authClient()
    const storage = {
      upload: vi.fn(async () => ({ data: { path: 'user-1/notes.txt' }, error: null })),
      remove: vi.fn(async () => ({ data: [{ name: 'user-1/notes.txt' }], error: null })),
      createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed.example' }, error: null })),
    }
    client.storage = { from: vi.fn(() => storage) }

    await expect(uploadStorageFile('notes.txt', 'hello', { client })).resolves.toEqual({ path: 'user-1/notes.txt' })
    await expect(removeStorageFile('notes.txt', { client })).resolves.toEqual([{ name: 'user-1/notes.txt' }])
    await expect(createSignedStorageUrl('notes.txt', { client, expiresIn: 120 })).resolves.toBe('https://signed.example')
    expect(client.storage.from).toHaveBeenCalledWith(SUPABASE_STORAGE_BUCKET)
    expect(storage.upload).toHaveBeenCalledWith('user-1/notes.txt', 'hello', undefined)
    expect(storage.remove).toHaveBeenCalledWith(['user-1/notes.txt'])
    expect(storage.createSignedUrl).toHaveBeenCalledWith('user-1/notes.txt', 120)
  })

  it('replaces provider errors with safe operation messages', async () => {
    const client = authClient()
    client.auth.signInWithOtp = vi.fn(async () => ({
      data: null,
      error: { message: 'account email and token details' },
    }))

    await expect(signInWithMagicLink('learner@example.com', { client }))
      .rejects.toThrow('Magic link sign-in failed. Please try again.')
    await expect(signInWithMagicLink('learner@example.com', { client }))
      .rejects.not.toThrow('account email and token details')
  })
})
