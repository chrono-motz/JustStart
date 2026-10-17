const RESOURCE_KINDS = new Set([
  'pdf',
  'document',
  'spreadsheet',
  'presentation',
  'image',
  'video',
  'audio',
  'archive',
  'code',
  'text',
  'other',
])

const MIME_KINDS = new Map([
  ['application/pdf', 'pdf'],
  ['application/msword', 'document'],
  ['application/rtf', 'document'],
  ['text/rtf', 'document'],
  ['application/vnd.oasis.opendocument.text', 'document'],
  ['application/vnd.ms-excel', 'spreadsheet'],
  ['application/vnd.oasis.opendocument.spreadsheet', 'spreadsheet'],
  ['application/vnd.ms-powerpoint', 'presentation'],
  ['application/vnd.oasis.opendocument.presentation', 'presentation'],
  ['text/javascript', 'code'],
  ['application/javascript', 'code'],
  ['application/x-javascript', 'code'],
  ['application/json', 'code'],
  ['application/xml', 'code'],
  ['text/xml', 'code'],
  ['text/csv', 'spreadsheet'],
  ['text/tab-separated-values', 'spreadsheet'],
  ['application/x-sh', 'code'],
  ['text/css', 'code'],
  ['text/html', 'code'],
])

const EXTENSION_KINDS = new Map([
  ['pdf', 'pdf'],
  ['doc', 'document'],
  ['docx', 'document'],
  ['odt', 'document'],
  ['rtf', 'document'],
  ['xls', 'spreadsheet'],
  ['xlsx', 'spreadsheet'],
  ['xlsm', 'spreadsheet'],
  ['ods', 'spreadsheet'],
  ['csv', 'spreadsheet'],
  ['tsv', 'spreadsheet'],
  ['numbers', 'spreadsheet'],
  ['ppt', 'presentation'],
  ['pptx', 'presentation'],
  ['odp', 'presentation'],
  ['key', 'presentation'],
  ['jpg', 'image'],
  ['jpeg', 'image'],
  ['png', 'image'],
  ['gif', 'image'],
  ['webp', 'image'],
  ['avif', 'image'],
  ['bmp', 'image'],
  ['tif', 'image'],
  ['tiff', 'image'],
  ['heic', 'image'],
  ['svg', 'image'],
  ['mp4', 'video'],
  ['m4v', 'video'],
  ['mov', 'video'],
  ['webm', 'video'],
  ['mkv', 'video'],
  ['avi', 'video'],
  ['mpeg', 'video'],
  ['mpg', 'video'],
  ['mp3', 'audio'],
  ['wav', 'audio'],
  ['m4a', 'audio'],
  ['aac', 'audio'],
  ['flac', 'audio'],
  ['ogg', 'audio'],
  ['oga', 'audio'],
  ['zip', 'archive'],
  ['rar', 'archive'],
  ['7z', 'archive'],
  ['tar', 'archive'],
  ['gz', 'archive'],
  ['tgz', 'archive'],
  ['bz2', 'archive'],
  ['xz', 'archive'],
  ['zst', 'archive'],
  ['js', 'code'],
  ['jsx', 'code'],
  ['mjs', 'code'],
  ['cjs', 'code'],
  ['ts', 'code'],
  ['tsx', 'code'],
  ['py', 'code'],
  ['java', 'code'],
  ['c', 'code'],
  ['h', 'code'],
  ['cc', 'code'],
  ['cpp', 'code'],
  ['cxx', 'code'],
  ['hh', 'code'],
  ['hpp', 'code'],
  ['cs', 'code'],
  ['go', 'code'],
  ['rs', 'code'],
  ['rb', 'code'],
  ['php', 'code'],
  ['swift', 'code'],
  ['kt', 'code'],
  ['kts', 'code'],
  ['sh', 'code'],
  ['bash', 'code'],
  ['zsh', 'code'],
  ['fish', 'code'],
  ['sql', 'code'],
  ['css', 'code'],
  ['scss', 'code'],
  ['less', 'code'],
  ['html', 'code'],
  ['htm', 'code'],
  ['vue', 'code'],
  ['svelte', 'code'],
  ['json', 'code'],
  ['xml', 'code'],
  ['yaml', 'code'],
  ['yml', 'code'],
  ['toml', 'code'],
  ['txt', 'text'],
  ['text', 'text'],
  ['md', 'text'],
  ['markdown', 'text'],
  ['log', 'text'],
  ['tex', 'text'],
  ['srt', 'text'],
  ['vtt', 'text'],
])

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function resourcePath(value) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  return stringValue(value.name)
    || stringValue(value.path)
    || stringValue(value.url)
    || stringValue(value.label)
}

function extensionOf(value) {
  const path = resourcePath(value).split(/[?#]/, 1)[0]
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function mimeTypeOf(value) {
  if (!value || typeof value !== 'object') return ''
  return stringValue(value.type || value.mimeType || value.mime || value.contentType).toLowerCase().split(';', 1)[0]
}

function kindFromMime(mime) {
  if (!mime) return undefined
  if (MIME_KINDS.has(mime)) return MIME_KINDS.get(mime)
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('text/')) return 'text'
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar')) return 'archive'
  if (mime.includes('word') || mime.includes('opendocument.text')) return 'document'
  if (mime.includes('excel') || mime.includes('spreadsheet')) return 'spreadsheet'
  if (mime.includes('powerpoint') || mime.includes('presentation')) return 'presentation'
  return undefined
}

/** Classify a File-like value or resource metadata object by its common type. */
export function getResourceKind(fileOrResource) {
  const declaredKind = stringValue(fileOrResource?.kind).toLowerCase()
  if (RESOURCE_KINDS.has(declaredKind)) return declaredKind

  const declaredType = stringValue(fileOrResource?.type).toLowerCase()
  if (RESOURCE_KINDS.has(declaredType)) return declaredType

  const mimeKind = kindFromMime(mimeTypeOf(fileOrResource))
  const extensionKind = EXTENSION_KINDS.get(extensionOf(fileOrResource))
  // `text/plain` is a common fallback supplied by file pickers; a known
  // source extension is more informative in that case (for example, .js).
  return (mimeKind && mimeKind !== 'text' ? mimeKind : undefined)
    || extensionKind
    || mimeKind
    || 'other'
}

function basename(value) {
  const withoutQuery = value.split(/[?#]/, 1)[0]
  const name = withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

/** Return the shortest useful name for a File-like value or resource object. */
export function resourceLabel(resource) {
  const explicitLabel = stringValue(resource?.label)
  const candidate = explicitLabel || stringValue(resource?.name) || resourcePath(resource)
  const label = basename(candidate).trim()
  return label || 'Untitled resource'
}

function normalizedTitle(label) {
  const withoutExtension = label.replace(/\.[^./]+$/, '')
  const words = withoutExtension.replace(/[\s_-]+/g, ' ').trim()
  if (!words) return 'Untitled resource'
  return `${words[0].toUpperCase()}${words.slice(1)}`
}

function safeSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'resource'
}

function objectUrlFor(file) {
  const urlApi = globalThis.URL
  if (!urlApi || typeof urlApi.createObjectURL !== 'function') return undefined
  try {
    return urlApi.createObjectURL(file)
  } catch {
    return undefined
  }
}

/** Build a plain, prerequisite-free node from a browser File-like value. */
export function createImportedNode(file, project, index = 0) {
  const label = resourceLabel(file)
  const title = normalizedTitle(label)
  const position = Number.isInteger(index) && index >= 0 ? index : 0
  const projectName = stringValue(project) || 'Imported resources'
  const objectUrl = objectUrlFor(file)
  const resource = {
    type: getResourceKind(file),
    label,
    source: 'imported',
  }

  if (objectUrl) {
    resource.path = objectUrl
    resource.temporary = true
  }
  if (stringValue(file?.name)) resource.name = stringValue(file.name)
  if (mimeTypeOf(file)) resource.mimeType = mimeTypeOf(file)
  if (Number.isFinite(file?.size)) resource.size = file.size
  if (Number.isFinite(file?.lastModified)) resource.lastModified = file.lastModified

  return {
    id: `imported-${position}-${safeSlug(title)}`,
    project: projectName,
    title,
    eyebrow: `${projectName} · ${String(position + 1).padStart(2, '0')}`,
    description: `Imported ${label}.`,
    resource,
    question: 'What is the main idea I should take away from this resource?',
    progress: 0,
    status: 'todo',
  }
}

/** Resolve app-relative resource paths while preserving browser object URLs. */
export function browserResourceUrl(resource) {
  const path = typeof resource === 'string'
    ? resource
    : stringValue(resource?.path || resource?.url)
  if (!path) return ''
  if (/^(?:blob|data):/i.test(path)) return path
  if (/^(?:https?:|file:|\/\/)/i.test(path)) return path

  const appPath = path.startsWith('/') ? path : `/${path}`
  if (appPath === '/resources') return '/resources/'
  if (appPath.startsWith('/resources/')) return appPath
  return `/resources${appPath}`
}
