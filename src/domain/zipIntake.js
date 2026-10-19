import { unzipSync } from 'fflate/browser'

const ZIP_METADATA_NAMES = new Set([
  '.ds_store',
  'thumbs.db',
  'desktop.ini',
  '.localized',
  '.directory',
])
const MIME_TYPES = new Map([
  ['.csv', 'text/csv'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.html', 'text/html'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.json', 'application/json'],
  ['.md', 'text/markdown'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.ppt', 'application/vnd.ms-powerpoint'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['.txt', 'text/plain'],
  ['.webp', 'image/webp'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
])

function decodedPathForSafety(path) {
  let decoded = path
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // A literal percent is valid in a ZIP filename. Decode only when there
    // is an actual escape sequence so names such as `100% notes.pdf` work.
    if (!/%[0-9a-f]{2}/i.test(decoded)) return decoded
    let next
    try {
      next = decodeURIComponent(decoded)
    } catch {
      throw new ZipPathError(path, 'contains malformed URL encoding')
    }
    if (next === decoded) return decoded
    decoded = next
  }
  return decoded
}

function isAbsolutePath(path) {
  return /^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(path) || /^[A-Za-z]:/.test(path)
}

function normalizeZipPathInternal(value, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') {
    throw new ZipPathError(value, 'must be a string path')
  }
  if (value.includes('\0')) {
    throw new ZipPathError(value, 'contains a NUL byte')
  }

  const decoded = decodedPathForSafety(value)
  if (decoded.includes('\0')) {
    throw new ZipPathError(value, 'contains a NUL byte')
  }
  const comparable = decoded.replaceAll('\\', '/')
  if (isAbsolutePath(comparable)) {
    throw new ZipPathError(value, 'must not be absolute')
  }
  if (comparable.split('/').some((segment) => segment === '..')) {
    throw new ZipPathError(value, 'must not contain `..` traversal segments')
  }

  const normalized = value
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment && segment !== '.')
    .join('/')
  if (!normalized && !allowEmpty) {
    throw new ZipPathError(value, 'must identify a file')
  }
  return normalized
}

/** Error thrown when a ZIP entry would escape its archive-relative root. */
export class ZipPathError extends Error {
  constructor(path, reason) {
    super(`Unsafe ZIP entry path${path ? ` \`${String(path)}\`` : ''}: ${reason}.`)
    this.name = 'ZipPathError'
    this.path = typeof path === 'string' ? path : undefined
  }
}

/** Normalize a ZIP entry path after checking absolute and traversal forms. */
export function normalizeZipPath(path) {
  return normalizeZipPathInternal(path)
}

/** Return true for platform metadata that should not become an app resource. */
export function isObviousZipMetadata(path) {
  const segments = path.toLowerCase().replaceAll('\\', '/').split('/')
  const basename = segments[segments.length - 1] || ''
  return segments[0] === '__macosx'
    || segments.includes('.spotlight-v100')
    || segments.includes('.trashes')
    || ZIP_METADATA_NAMES.has(basename)
    || basename.startsWith('._')
    || basename.endsWith('.zone.identifier')
}

function isDirectoryPath(path) {
  return path.replaceAll('\\', '/').endsWith('/')
}

function mimeTypeForPath(path) {
  const segments = path.split('/')
  const basename = segments[segments.length - 1] || ''
  const extensionIndex = basename.lastIndexOf('.')
  return extensionIndex >= 0
    ? MIME_TYPES.get(basename.slice(extensionIndex).toLowerCase()) || 'application/octet-stream'
    : 'application/octet-stream'
}

/**
 * Safely turn the object returned by fflate into archive-relative entries.
 * Directory entries and common operating-system metadata are omitted.
 */
export function enumerateZipFiles(unzipped, { includeMetadata = false } = {}) {
  if (!unzipped || typeof unzipped !== 'object' || Array.isArray(unzipped)) {
    throw new TypeError('ZIP entries must be an object keyed by archive path.')
  }

  const entries = []
  const paths = new Set()
  for (const [rawPath, bytes] of Object.entries(unzipped)) {
    const directory = isDirectoryPath(rawPath)
    const path = normalizeZipPathInternal(rawPath, { allowEmpty: directory })
    if (!path || directory) continue
    if (!includeMetadata && isObviousZipMetadata(path)) continue
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError(`ZIP entry \`${path}\` did not contain byte data.`)
    }
    if (paths.has(path)) {
      throw new ZipPathError(path, 'duplicates another entry after path normalization')
    }
    paths.add(path)
    entries.push({ path, bytes, size: bytes.byteLength, mimeType: mimeTypeForPath(path) })
  }
  return entries
}

async function readZipBytes(input) {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  if (input && typeof input.arrayBuffer === 'function') {
    const buffer = await input.arrayBuffer()
    if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer)
    if (ArrayBuffer.isView(buffer)) return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  }
  throw new TypeError('ZIP input must be a File, Blob, ArrayBuffer, or Uint8Array.')
}

function makeFileLike(entry) {
  const segments = entry.path.split('/')
  const name = segments[segments.length - 1] || entry.path
  const options = { type: entry.mimeType, lastModified: 0 }
  const file = typeof File === 'function'
    ? new File([entry.bytes], name, options)
    : new Blob([entry.bytes], { type: entry.mimeType })

  // File.webkitRelativePath is read-only in browsers, but an own property is
  // useful to the existing file picker flow and is safe on File/Blob objects.
  Object.defineProperties(file, {
    name: { configurable: true, enumerable: true, value: name },
    lastModified: { configurable: true, enumerable: true, value: 0 },
    webkitRelativePath: { configurable: true, enumerable: true, value: entry.path },
  })
  return file
}

/**
 * Read a ZIP/File-like input and return files plus exact archive-path lookup.
 * The returned File objects can be passed to the same upload/file-map code as
 * files selected through a browser picker.
 */
export async function readZipFile(input, options = {}) {
  const bytes = await readZipBytes(input)
  let unzipped
  try {
    unzipped = unzipSync(bytes)
  } catch (error) {
    throw new Error(`Unable to read ZIP archive: ${error instanceof Error ? error.message : String(error)}`)
  }
  const entries = enumerateZipFiles(unzipped, options)
  const files = entries.map(makeFileLike)
  const fileMap = new Map(entries.map((entry, index) => [entry.path, files[index]]))
  return { entries, files, fileMap }
}

// Descriptive aliases for callers that prefer archive/unpack terminology.
export const readZipArchive = readZipFile
export const unpackZipFile = readZipFile
