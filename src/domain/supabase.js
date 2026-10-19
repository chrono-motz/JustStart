import { createClient } from '@supabase/supabase-js'

export const SUPABASE_WORKSPACE_TABLE = 'workspaces'
export const SUPABASE_STORAGE_BUCKET = 'workspace-files'
export const SUPABASE_SIGNED_URL_EXPIRY_SECONDS = 3600

function normaliseEnvironment(values) {
  return values && typeof values === 'object' ? values : {}
}

/** Read only the public Vite configuration needed by the browser client. */
export function readSupabaseConfig(environment = import.meta.env) {
  const values = normaliseEnvironment(environment)
  const url = typeof values.VITE_SUPABASE_URL === 'string' ? values.VITE_SUPABASE_URL.trim() : ''
  const publishableKey = typeof values.VITE_SUPABASE_PUBLISHABLE_KEY === 'string'
    ? values.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
    : ''
  return { url, publishableKey }
}

/** Expose setup state without returning a key or any response details. */
export function getSupabaseConfigStatus(environment = import.meta.env) {
  const config = readSupabaseConfig(environment)
  const missing = []
  if (!config.url) missing.push('VITE_SUPABASE_URL')
  if (!config.publishableKey) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY')
  return {
    configured: missing.length === 0,
    missing,
  }
}

export const getSupabaseConfig = readSupabaseConfig
export const isSupabaseConfigured = (environment = import.meta.env) => getSupabaseConfigStatus(environment).configured
export const supabaseConfigStatus = getSupabaseConfigStatus

export class SupabaseConfigurationError extends Error {
  constructor() {
    super('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
    this.name = 'SupabaseConfigurationError'
  }
}

/** Create a browser client with the publishable key only. */
export function createSupabaseBrowserClient({
  environment,
  env,
  createClientImpl = createClient,
} = {}) {
  const config = readSupabaseConfig(environment ?? env ?? import.meta.env)
  if (!config.url || !config.publishableKey) throw new SupabaseConfigurationError()
  if (typeof createClientImpl !== 'function') throw new TypeError('createClientImpl must be a function')
  return createClientImpl(config.url, config.publishableKey)
}

export const createSupabaseClient = createSupabaseBrowserClient

let defaultClient

/** Lazily create and reuse the configured browser client. */
export function getSupabaseClient(options = {}) {
  if (!defaultClient) defaultClient = createSupabaseBrowserClient(options)
  return defaultClient
}

function resolveClient(client) {
  return client || getSupabaseClient()
}

function safeError(operation) {
  const error = new Error(`${operation} failed. Please try again.`)
  error.name = 'SupabaseOperationError'
  return error
}

function throwIfError(result, operation) {
  if (result?.error) throw safeError(operation)
  return result
}

function requireAuth(client, session, operation) {
  if (!session?.user?.id) {
    const error = new Error(`${operation} requires an authenticated user.`)
    error.name = 'SupabaseAuthenticationError'
    throw error
  }
  return session.user.id
}

async function sessionFor(client, operation = 'Loading your session') {
  try {
    const result = throwIfError(await client.auth.getSession(), operation)
    return result?.data?.session || null
  } catch (error) {
    if (error?.name === 'SupabaseOperationError') throw error
    throw safeError(operation)
  }
}

function requireEmail(email) {
  if (typeof email !== 'string' || !email.trim()) throw new Error('Enter your email address to continue.')
  return email.trim()
}

function requireStoragePath(path) {
  if (typeof path !== 'string' || !path.trim()) throw new Error('A storage path is required.')
  const cleanPath = path.trim().replace(/^\/+/, '')
  if (!cleanPath || cleanPath.split('/').some((part) => part === '.' || part === '..' || !part)) {
    throw new Error('The storage path is invalid.')
  }
  return cleanPath
}

function scopedStoragePath(userId, path) {
  const cleanPath = requireStoragePath(path)
  return cleanPath.startsWith(`${userId}/`) ? cleanPath : `${userId}/${cleanPath}`
}

/** Return the current browser auth session, or null when signed out. */
export async function getSupabaseSession({ client } = {}) {
  return sessionFor(resolveClient(client))
}

export const getSession = getSupabaseSession
export const getAuthSession = getSupabaseSession
export const getCurrentSession = getSupabaseSession

/** Send a passwordless sign-in email without exposing provider error details. */
export async function signInWithMagicLink(email, { client, redirectTo } = {}) {
  const target = requireEmail(email)
  const supabase = resolveClient(client)
  const options = redirectTo ? { emailRedirectTo: redirectTo } : undefined
  try {
    const result = throwIfError(await supabase.auth.signInWithOtp({
      email: target,
      ...(options ? { options } : {}),
    }), 'Magic link sign-in')
    return result?.data || null
  } catch (error) {
    if (error?.name === 'SupabaseOperationError') throw error
    throw safeError('Magic link sign-in')
  }
}

export async function signOut({ client } = {}) {
  const supabase = resolveClient(client)
  try {
    throwIfError(await supabase.auth.signOut(), 'Sign out')
    return true
  } catch (error) {
    if (error?.name === 'SupabaseOperationError') throw error
    throw safeError('Sign out')
  }
}

async function authenticatedClient(client, operation) {
  const supabase = resolveClient(client)
  const session = await sessionFor(supabase, operation)
  requireAuth(supabase, session, operation)
  return { supabase, session, userId: session.user.id }
}

/** Read the current user's workspace row; signed-out users receive null. */
export async function readWorkspace({ client, table = SUPABASE_WORKSPACE_TABLE } = {}) {
  const supabase = resolveClient(client)
  const session = await sessionFor(supabase, 'Loading your workspace')
  if (!session?.user?.id) return null
  try {
    const result = await supabase
      .from(table)
      .select('user_id,data,updated_at')
      .eq('user_id', session.user.id)
      .maybeSingle()
    throwIfError(result, 'Loading your workspace')
    return result?.data || null
  } catch (error) {
    if (error?.name === 'SupabaseOperationError') throw error
    throw safeError('Loading your workspace')
  }
}

export const getWorkspace = readWorkspace

/** Upsert only the authenticated user's workspace row. */
export async function upsertWorkspace(data, { client, table = SUPABASE_WORKSPACE_TABLE } = {}) {
  const { supabase, userId } = await authenticatedClient(client, 'Saving your workspace')
  try {
    const result = await supabase
      .from(table)
      .upsert({ user_id: userId, data }, { onConflict: 'user_id' })
      .select('user_id,data,updated_at')
      .single()
    throwIfError(result, 'Saving your workspace')
    return result?.data || null
  } catch (error) {
    if (error?.name === 'SupabaseOperationError') throw error
    throw safeError('Saving your workspace')
  }
}

export const saveWorkspace = upsertWorkspace

export async function uploadStorageFile(path, file, {
  client,
  bucket = SUPABASE_STORAGE_BUCKET,
  options,
} = {}) {
  const { supabase, userId } = await authenticatedClient(client, 'Uploading your file')
  const scopedPath = scopedStoragePath(userId, path)
  try {
    const result = await supabase.storage.from(bucket).upload(scopedPath, file, options)
    throwIfError(result, 'Uploading your file')
    return result?.data || null
  } catch (error) {
    if (error?.name === 'SupabaseOperationError') throw error
    throw safeError('Uploading your file')
  }
}

export const uploadFile = uploadStorageFile

export async function removeStorageFile(path, {
  client,
  bucket = SUPABASE_STORAGE_BUCKET,
} = {}) {
  const { supabase, userId } = await authenticatedClient(client, 'Removing your file')
  const paths = (Array.isArray(path) ? path : [path]).map((value) => scopedStoragePath(userId, value))
  try {
    const result = await supabase.storage.from(bucket).remove(paths)
    throwIfError(result, 'Removing your file')
    return result?.data || []
  } catch (error) {
    if (error?.name === 'SupabaseOperationError') throw error
    throw safeError('Removing your file')
  }
}

export const removeFile = removeStorageFile

export async function createSignedStorageUrl(path, {
  client,
  bucket = SUPABASE_STORAGE_BUCKET,
  expiresIn = SUPABASE_SIGNED_URL_EXPIRY_SECONDS,
} = {}) {
  const { supabase, userId } = await authenticatedClient(client, 'Creating a file link')
  const scopedPath = scopedStoragePath(userId, path)
  const expiry = Number.isFinite(expiresIn) && expiresIn > 0 ? Math.floor(expiresIn) : SUPABASE_SIGNED_URL_EXPIRY_SECONDS
  try {
    const result = await supabase.storage.from(bucket).createSignedUrl(scopedPath, expiry)
    throwIfError(result, 'Creating a file link')
    return result?.data?.signedUrl || null
  } catch (error) {
    if (error?.name === 'SupabaseOperationError') throw error
    throw safeError('Creating a file link')
  }
}

export const createSignedUrl = createSignedStorageUrl

/** Bind the backend helpers to one configured Supabase browser client. */
export function createSupabaseApi({ client = getSupabaseClient(), bucket = SUPABASE_STORAGE_BUCKET, table = SUPABASE_WORKSPACE_TABLE } = {}) {
  return {
    getSession: () => getSupabaseSession({ client }),
    signInWithMagicLink: (email, options = {}) => signInWithMagicLink(email, { ...options, client }),
    signOut: () => signOut({ client }),
    readWorkspace: () => readWorkspace({ client, table }),
    getWorkspace: () => readWorkspace({ client, table }),
    upsertWorkspace: (data) => upsertWorkspace(data, { client, table }),
    saveWorkspace: (data) => upsertWorkspace(data, { client, table }),
    uploadStorageFile: (path, file, options = {}) => uploadStorageFile(path, file, { ...options, client, bucket }),
    uploadFile: (path, file, options = {}) => uploadStorageFile(path, file, { ...options, client, bucket }),
    removeStorageFile: (path) => removeStorageFile(path, { client, bucket }),
    removeFile: (path) => removeStorageFile(path, { client, bucket }),
    createSignedStorageUrl: (path, expiresIn) => createSignedStorageUrl(path, { client, bucket, expiresIn }),
    createSignedUrl: (path, expiresIn) => createSignedStorageUrl(path, { client, bucket, expiresIn }),
  }
}
