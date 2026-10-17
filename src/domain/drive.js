/** Google Drive v3 REST API endpoint used by the transport. */
export const DRIVE_API_BASE_URL = 'https://www.googleapis.com/drive/v3'

/** Name of the folder in which this application's files are stored. */
export const DRIVE_APP_FOLDER_NAME = 'JustStart'

/** Name of the JSON file containing the application workspace. */
export const DRIVE_WORKSPACE_FILE_NAME = 'workspace.json'

/** Least-privilege scope for files created and opened by this application. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

// Short aliases make the constants convenient for callers that prefer concise names.
export const DRIVE_BASE_URL = DRIVE_API_BASE_URL
export const APP_FOLDER_NAME = DRIVE_APP_FOLDER_NAME
export const WORKSPACE_FILE_NAME = DRIVE_WORKSPACE_FILE_NAME
export const DRIVE_FILE_SCOPE = DRIVE_SCOPE

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const UPLOAD_API_BASE_URL = 'https://www.googleapis.com/upload/drive/v3'
const DEFAULT_FILE_FIELDS = 'id,name,mimeType,parents,webViewLink,modifiedTime,size'

/**
 * Error raised for a failed Drive HTTP request. The message intentionally
 * contains status information only; response bodies can contain sensitive
 * account or file details and are therefore not copied into the message.
 */
export class DriveRequestError extends Error {
  constructor(status, statusText = '') {
    const suffix = statusText ? ` ${statusText}` : ''
    super(`Google Drive request failed (${status}${suffix})`)
    this.name = 'DriveRequestError'
    this.status = status
    this.statusText = statusText
  }
}

function headerValue(headers, name) {
  if (!headers) return ''
  if (typeof headers.get === 'function') return headers.get(name) || ''
  return headers[name] || headers[name.toLowerCase()] || ''
}

async function responseBody(response) {
  if (response.status === 204) return null

  const contentType = headerValue(response.headers, 'content-type').toLowerCase()
  if (contentType.includes('json') && typeof response.json === 'function') {
    return response.json()
  }
  if (typeof response.text === 'function') return response.text()
  if (typeof response.json === 'function') return response.json()
  return null
}

function isSuccessful(response) {
  return response && Number.isInteger(response.status)
    ? response.status >= 200 && response.status < 300
    : Boolean(response && response.ok)
}

/**
 * Make an authenticated Drive request and decode its JSON response.
 * `options.body` may be an object (encoded as JSON) or an already encoded
 * body such as the multipart body used by uploadFile.
 */
export async function driveJsonRequest(fetchImpl, accessToken, url, options = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function')
  if (typeof accessToken !== 'string' || accessToken.trim() === '') {
    throw new TypeError('accessToken must be a non-empty string')
  }

  const headers = new Headers(options.headers || {})
  headers.set('Authorization', `Bearer ${accessToken}`)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')

  let body = options.body
  if (body !== undefined && body !== null && typeof body === 'object'
    && !(typeof Blob !== 'undefined' && body instanceof Blob)
    && !(body instanceof ArrayBuffer)
    && !(typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(body))) {
    body = JSON.stringify(body)
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  }

  const response = await fetchImpl(url, {
    ...options,
    headers,
    body,
  })

  if (!isSuccessful(response)) {
    const status = Number.isInteger(response?.status) ? response.status : 0
    throw new DriveRequestError(status, response?.statusText || '')
  }

  return responseBody(response)
}

function encodeQuery(params) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, value)
  }
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

function escapeQueryValue(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")
}

function requireId(id, label) {
  if (typeof id !== 'string' || id.trim() === '') throw new TypeError(`${label} must be a non-empty string`)
  return id
}

function normaliseParents(parents) {
  if (parents === undefined || parents === null) return undefined
  const values = Array.isArray(parents) ? parents : [parents]
  return values.map((parent) => requireId(parent, 'parent ID'))
}

function metadataForResult(metadata) {
  if (!metadata || typeof metadata !== 'object') return metadata
  return {
    ...metadata,
    fileId: metadata.id,
  }
}

function makeMultipartBody(metadata, content, boundary) {
  const prefix = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${metadata.mimeType || 'application/octet-stream'}\r\n\r\n`
  const suffix = `\r\n--${boundary}--\r\n`

  if (typeof content === 'string') return prefix + content + suffix

  const bytes = content instanceof ArrayBuffer
    ? new Uint8Array(content)
    : ArrayBuffer.isView(content)
      ? new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
      : content
  if (typeof Blob === 'undefined') throw new TypeError('Binary uploads require Blob support')
  return new Blob([prefix, bytes || '', suffix])
}

function parseWorkspaceContent(text) {
  if (typeof text !== 'string') return text
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Construct a small, dependency-free Drive client. IDs discovered from Drive
 * are retained in the closure so subsequent operations address the same
 * folder and workspace file rather than relying on names alone.
 */
export function createDriveClient({ fetchImpl = globalThis.fetch, accessToken } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function')
  if (typeof accessToken !== 'string' || accessToken.trim() === '') {
    throw new TypeError('accessToken must be a non-empty string')
  }

  let appFolder
  let workspaceFileId

  async function request(url, options) {
    return driveJsonRequest(fetchImpl, accessToken, url, options)
  }

  async function listFiles({ query, pageToken, fields = DEFAULT_FILE_FIELDS } = {}) {
    const files = []
    let nextPageToken = pageToken
    do {
      const result = await request(`${DRIVE_API_BASE_URL}/files${encodeQuery({
        q: query,
        spaces: 'drive',
        fields: `nextPageToken,files(${fields})`,
        pageToken: nextPageToken,
        pageSize: '1000',
      })}`)
      if (Array.isArray(result?.files)) files.push(...result.files)
      nextPageToken = result?.nextPageToken
    } while (nextPageToken)
    return files
  }

  async function findOrCreateAppFolder() {
    if (appFolder?.id) return appFolder

    const name = escapeQueryValue(DRIVE_APP_FOLDER_NAME)
    const existing = await listFiles({
      query: `'root' in parents and name = '${name}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
    })
    if (existing[0]?.id) {
      appFolder = metadataForResult(existing[0])
      return appFolder
    }

    const created = await request(`${DRIVE_API_BASE_URL}/files${encodeQuery({
      fields: DEFAULT_FILE_FIELDS,
    })}`, {
      method: 'POST',
      body: {
        name: DRIVE_APP_FOLDER_NAME,
        mimeType: FOLDER_MIME_TYPE,
        parents: ['root'],
      },
    })
    appFolder = metadataForResult(created)
    return appFolder
  }

  async function listAppFiles({ folderId, name, mimeType, pageToken, fields = DEFAULT_FILE_FIELDS } = {}) {
    const parentId = folderId || (await findOrCreateAppFolder()).id
    requireId(parentId, 'folder ID')
    const clauses = [`'${escapeQueryValue(parentId)}' in parents`, 'trashed = false']
    if (name) clauses.push(`name = '${escapeQueryValue(name)}'`)
    if (mimeType) clauses.push(`mimeType = '${escapeQueryValue(mimeType)}'`)
    return listFiles({
      query: clauses.join(' and '),
      pageToken,
      fields,
    }).then((files) => files.map(metadataForResult))
  }

  async function downloadFile(fileId, { as = 'text' } = {}) {
    const id = requireId(fileId, 'file ID')
    const response = await fetchImpl(`${DRIVE_API_BASE_URL}/files/${encodeURIComponent(id)}?alt=media`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (!isSuccessful(response)) {
      throw new DriveRequestError(response?.status || 0, response?.statusText || '')
    }
    if (as === 'response') return response
    if (as === 'arrayBuffer') return response.arrayBuffer()
    if (as === 'blob') return response.blob()
    if (as === 'json') return response.json()
    if (typeof response.text !== 'function') throw new TypeError('download response does not support text()')
    return response.text()
  }

  async function uploadFile({
    name,
    mimeType = 'application/octet-stream',
    content = '',
    parents,
    folderId,
    fileId,
    fields = DEFAULT_FILE_FIELDS,
    metadata = {},
  } = {}) {
    if (typeof name !== 'string' || name.trim() === '') throw new TypeError('name must be a non-empty string')
    const id = fileId ? requireId(fileId, 'file ID') : undefined
    const resolvedParents = normaliseParents(parents || folderId)
      || (!id ? [(await findOrCreateAppFolder()).id] : undefined)
    const fileMetadata = {
      ...metadata,
      name,
      mimeType,
      ...(resolvedParents ? { parents: resolvedParents } : {}),
    }
    const boundary = `just-start-${Math.random().toString(16).slice(2)}`
    const body = makeMultipartBody(fileMetadata, content, boundary)
    const endpoint = id
      ? `${UPLOAD_API_BASE_URL}/files/${encodeURIComponent(id)}`
      : `${UPLOAD_API_BASE_URL}/files`
    const result = await request(`${endpoint}${encodeQuery({ uploadType: 'multipart', fields })}`, {
      method: id ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    })
    return metadataForResult(result)
  }

  async function getWorkspaceFile() {
    const folder = await findOrCreateAppFolder()
    const matches = await listAppFiles({ folderId: folder.id, name: DRIVE_WORKSPACE_FILE_NAME })
    const file = matches[0]
    if (!file?.id) return null
    workspaceFileId = file.id
    const text = await downloadFile(file.id, { as: 'text' })
    return {
      ...file,
      fileId: file.id,
      text,
      content: parseWorkspaceContent(text),
    }
  }

  async function putWorkspaceFile(workspace, options = {}) {
    const value = workspace && Object.prototype.hasOwnProperty.call(workspace, 'workspace')
      && Object.keys(workspace).every((key) => ['workspace', 'fileId'].includes(key))
      ? workspace.workspace
      : workspace
    const existingId = options.fileId || workspaceFileId || (await getWorkspaceFile())?.id
    const result = await uploadFile({
      name: DRIVE_WORKSPACE_FILE_NAME,
      mimeType: 'application/json',
      content: JSON.stringify(value),
      fileId: existingId,
      folderId: options.folderId,
      fields: options.fields,
    })
    workspaceFileId = result?.id || existingId
    return result
  }

  function webViewUrl(fileId) {
    return `https://drive.google.com/file/d/${encodeURIComponent(requireId(fileId, 'file ID'))}/view`
  }

  function createSignedLikeOpenUrl(fileId) {
    return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(requireId(fileId, 'file ID'))}`
  }

  return {
    findOrCreateAppFolder,
    getWorkspaceFile,
    putWorkspaceFile,
    uploadFile,
    downloadFile,
    createSignedLikeOpenUrl,
    webViewUrl,
    listAppFiles,
  }
}
