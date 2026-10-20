/**
 * The version of the context catalog consumed by an AI before it prepares an
 * intake manifest. This is intentionally separate from the manifest schema in
 * aiIntake.js: a context catalog describes what already exists; it is not an
 * import result.
 */
export const AI_CONTEXT_SCHEMA_VERSION = '1.0'

const SYNTHETIC_FOCUS_AREA = 'all focus areas'
const SENSITIVE_QUERY_KEY = /(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|auth|session|signature|(?:^|[_-])sig(?:$|[_-])|credential|jwt|private)/i
const SENSITIVE_FIELD = /(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|auth|session|cookie|credential|private[_-]?key|file[_-]?content|(?:^|[_-])contents?(?:$|[_-])|payload)/i
const SAFE_STORAGE_FIELDS = new Set([
  'provider',
  'service',
  'bucket',
  'path',
  'key',
  'objectKey',
  'name',
  'mimeType',
  'contentType',
  'size',
  'lastModified',
  'etag',
])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function hash(value) {
  // A small deterministic hash is only used for generated identifiers. It is
  // not intended to protect or conceal any input value.
  let result = 2166136261
  for (const character of value) {
    result ^= character.codePointAt(0)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

function slug(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled'
}

function valueFromRecord(record, keys) {
  if (!isObject(record)) return ''
  for (const key of keys) {
    const value = text(record[key])
    if (value) return value
  }
  return ''
}

function recordName(record) {
  if (typeof record === 'string') return text(record)
  return valueFromRecord(record, ['name', 'title', 'label', 'project', 'focusArea'])
}

function normalizeGeneratedAt(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const generatedAt = text(value)
  return generatedAt || null
}

function isTemporaryUrl(value) {
  return /^(?:blob|data):/i.test(text(value))
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(text(value))
}

function hasSafeUrlIdentity(value) {
  const raw = text(value)
  if (!isHttpUrl(raw)) return false

  try {
    const parsed = new URL(raw)
    if (!parsed.hostname || parsed.username || parsed.password) return false
    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEY.test(key)) return false
    }
    if (SENSITIVE_QUERY_KEY.test(parsed.hash)) return false
    return true
  } catch {
    return false
  }
}

/**
 * Normalize an app-relative path without exporting an absolute local path.
 * Sample resources are stored with a leading slash, while imported resources
 * normally use a relative sourcePath. Both become the same catalog identity.
 */
function normalizePath(value) {
  const raw = text(value)
  if (!raw || isTemporaryUrl(raw) || /^file:/i.test(raw) || isHttpUrl(raw) || raw.includes('\0')) return ''

  const normalizedSeparators = raw.split(/[?#]/, 1)[0].replaceAll('\\', '/')
  if (/^(?:[A-Za-z]:|\/\/)/.test(normalizedSeparators)) return ''
  const withoutResourcePrefix = normalizedSeparators.replace(/^\/+resources\//i, '')
  const candidate = withoutResourcePrefix.replace(/^\.\//, '')
  const leadingSlash = candidate.startsWith('/')
  const samplePath = /^\/(?:SampleSlides|SampleQuestions|SampleResearch)\//i.test(candidate)
  if (leadingSlash && !samplePath) return ''

  const segments = candidate.split('/')
  if (segments.some((segment) => segment === '..')) return ''
  const result = segments.filter((segment) => segment && segment !== '.').join('/')
  return result || ''
}

function basename(value) {
  const path = text(value).split(/[?#]/, 1)[0]
  const parts = path.split('/')
  return parts[parts.length - 1] || ''
}

function normalizeKind(value) {
  const kind = text(value).toLowerCase()
  return kind || ''
}

function resourceObject(node) {
  let resource
  if (isObject(node?.resource)) resource = node.resource
  else if (typeof node?.resource === 'string') resource = { path: node.resource }
  else if (text(node?.url)) resource = { url: node.url }
  else if (text(node?.sourcePath)) resource = { sourcePath: node.sourcePath }
  else if (text(node?.path) || text(node?.name) || isObject(node?.storage) || isObject(node?.storageMetadata)) resource = {}
  if (!resource) return null

  const nodeStorage = node?.storage ?? node?.storageMetadata
  if (nodeStorage != null && resource.storage == null && resource.storageMetadata == null) {
    resource = { ...resource, storage: nodeStorage }
  }
  if (text(node?.storagePath) && resource.storage == null && resource.storageMetadata == null) {
    resource = {
      ...resource,
      storagePath: node.storagePath,
      storageBucket: node.storageBucket,
      storageProvider: node.storageProvider,
    }
  }
  if (text(node?.path) && !text(resource.path) && !text(resource.sourcePath)) resource = { ...resource, path: node.path }
  if (text(node?.name) && !text(resource.name)) resource = { ...resource, name: node.name }
  return resource
}

function storageObject(resource) {
  if (!isObject(resource)) return null
  if (isObject(resource.storage)) return resource.storage
  if (isObject(resource.storageMetadata)) return resource.storageMetadata

  const storage = {}
  const aliases = [
    ['provider', 'storageProvider'],
    ['service', 'storageService'],
    ['bucket', 'storageBucket'],
    ['path', 'storagePath'],
    ['key', 'storageKey'],
    ['objectKey', 'storageObjectKey'],
  ]
  for (const [target, source] of aliases) {
    if (resource[source] != null) storage[target] = resource[source]
  }
  return Object.keys(storage).length ? storage : null
}

function normalizeStorage(resource) {
  const source = storageObject(resource)
  if (!source) return undefined

  const result = {}
  for (const [key, value] of Object.entries(source)) {
    if (!SAFE_STORAGE_FIELDS.has(key) || SENSITIVE_FIELD.test(key)) continue
    if (key === 'path' || key === 'key' || key === 'objectKey') {
      const path = normalizePath(value)
      if (path) result[key] = path
      continue
    }
    if (key === 'size' || key === 'lastModified') {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) result[key] = value
      continue
    }
    const normalized = text(value)
    if (normalized && !isTemporaryUrl(normalized) && !isHttpUrl(normalized)) result[key] = normalized
  }
  return Object.keys(result).length ? result : undefined
}

function normalizeResourceIdentity(node) {
  const source = resourceObject(node)
  if (!source) return null

  const sourcePath = normalizePath(source.sourcePath)
  const safePath = normalizePath(source.path)
  const url = hasSafeUrlIdentity(source.url) ? text(source.url) : ''
  const storage = normalizeStorage(source)
  const explicitNameValue = valueFromRecord(source, ['name', 'label'])
  const explicitName = isTemporaryUrl(explicitNameValue) ? '' : explicitNameValue
  const name = explicitName || basename(sourcePath || safePath || url)
  const rawKind = normalizeKind(source.kind || source.type || node?.resourceKind)
  const isUrl = Boolean(url) || rawKind === 'url' || rawKind === 'link'
  const kind = rawKind === 'file' || rawKind === 'url' || rawKind === 'link' || rawKind === 'other' ? '' : rawKind

  // A temporary object URL is not an identity. A storage path, sourcePath, or
  // safe name can still identify the resource after the browser session ends.
  if (!url && !sourcePath && !safePath && !storage && !name) return null
  if (isUrl && !url) return null
  if (!isUrl && !sourcePath && !safePath && !storage && !name) return null

  const result = { type: isUrl ? 'url' : 'file' }
  if (kind) result.kind = kind
  if (sourcePath) result.sourcePath = sourcePath
  if (safePath && safePath !== sourcePath) result.path = safePath
  if (url) result.url = url
  if (name) result.name = name
  if (storage) result.storage = storage
  return result
}

function aiItemIdFor(node) {
  if (!isObject(node)) return ''
  const nested = isObject(node.ai) ? node.ai : isObject(node.import) ? node.import : null
  return valueFromRecord(node, ['aiItemId', 'itemId', 'manifestItemId', 'sourceItemId', 'importedItemId'])
    || valueFromRecord(nested, ['itemId', 'aiItemId', 'id'])
}

function projectNameFor(node) {
  if (!isObject(node)) return ''
  const value = node.project ?? node.focusArea ?? node.focusAreaName ?? node.projectName
  return recordName(value)
}

function projectIdFor(name, projectsByName) {
  const project = projectsByName.get(name.toLowerCase())
  return project?.id || (name ? `focus-${slug(name)}` : '')
}

function makeNodeId(node, projectName, title, aiItemId, resource) {
  const explicit = valueFromRecord(node, ['id', 'nodeId'])
  if (explicit) return explicit
  if (aiItemId) return `ai-item-${aiItemId}`
  const identity = stableStringify({ projectName, title, resource })
  return `topic-${slug(projectName ? `${projectName}-${title}` : title)}-${hash(identity)}`
}

function focusAreaRecord(value) {
  const name = recordName(value)
  if (!name || name.toLowerCase() === SYNTHETIC_FOCUS_AREA) return null
  const explicitId = typeof value === 'object' ? valueFromRecord(value, ['id', 'projectId', 'focusAreaId']) : ''
  const result = { id: explicitId || `focus-${slug(name)}`, name }
  const description = typeof value === 'object' ? text(value.description) : ''
  if (description) result.description = description
  return result
}

function normalizeTopic(node, projectName, projectId, resource) {
  const aiItemId = aiItemIdFor(node)
  const title = valueFromRecord(node, ['title', 'name', 'label']) || 'Untitled topic'
  const id = makeNodeId(node, projectName, title, aiItemId, resource)
  const topic = { id }
  if (projectName) {
    topic.project = projectName
    topic.focusArea = projectName
  }
  if (projectId) topic.focusAreaId = projectId
  topic.title = title
  const description = text(node?.description)
  if (description) topic.description = description
  const sourceTopic = typeof node?.topic === 'string'
    ? text(node.topic)
    : valueFromRecord(node?.topic, ['id', 'name', 'title'])
  if (sourceTopic) topic.topic = sourceTopic
  const kind = text(node?.kind || node?.topicKind || node?.nodeKind) || 'topic'
  topic.kind = kind
  if (aiItemId) topic.aiItemId = aiItemId
  return { topic, resource, sortKey: stableStringify({ topic, resource }) }
}

function compareRecords(left, right) {
  return left.sortKey.localeCompare(right.sortKey)
}

function addFocusArea(map, value) {
  const record = focusAreaRecord(value)
  if (!record) return
  const key = record.name.toLowerCase()
  const current = map.get(key)
  if (!current || stableStringify(record).localeCompare(stableStringify(current)) < 0) map.set(key, record)
}

/**
 * Build the safe, metadata-only catalog that can be supplied to an AI before
 * an import manifest is prepared. The input workspace is never modified.
 */
export function buildAIContext({ nodes = [], projects = [], generatedAt } = {}) {
  const projectValues = Array.isArray(projects) ? projects : []
  const nodeValues = Array.isArray(nodes) ? nodes : []
  const focusAreasByName = new Map()
  for (const project of projectValues) addFocusArea(focusAreasByName, project)

  const projectsByName = new Map()
  for (const project of focusAreasByName.values()) projectsByName.set(project.name.toLowerCase(), project)

  const records = []
  for (const node of nodeValues) {
    if (!isObject(node)) continue
    const projectName = projectNameFor(node)
    if (projectName) addFocusArea(focusAreasByName, node.project ?? node.focusArea ?? projectName)
    const projectId = projectIdFor(projectName, projectsByName)
    const resource = normalizeResourceIdentity(node)
    const normalized = normalizeTopic(node, projectName, projectId, resource)
    records.push(normalized)
  }

  // Rebuild this map after adding project names found only on nodes.
  for (const project of focusAreasByName.values()) projectsByName.set(project.name.toLowerCase(), project)
  for (const record of records) {
    if (record.topic.focusArea) {
      record.topic.focusAreaId = projectIdFor(record.topic.focusArea, projectsByName)
    }
  }

  records.sort((left, right) => left.topic.id.localeCompare(right.topic.id) || compareRecords(left, right))
  const topics = []
  const seenTopicKeys = new Set()
  for (const record of records) {
    const topicKey = record.topic.aiItemId ? `ai:${record.topic.aiItemId}` : `id:${record.topic.id}`
    if (seenTopicKeys.has(topicKey)) continue
    seenTopicKeys.add(topicKey)
    topics.push(record.topic)
  }

  const resources = records
    .filter((record) => record.resource)
    .map((record) => {
      const resource = { nodeId: record.topic.id, ...record.resource }
      if (record.topic.aiItemId) resource.aiItemId = record.topic.aiItemId
      return resource
    })
    .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)))

  return {
    schemaVersion: AI_CONTEXT_SCHEMA_VERSION,
    generatedAt: normalizeGeneratedAt(generatedAt),
    focusAreas: [...focusAreasByName.values()].sort((left, right) => left.id.localeCompare(right.id) || left.name.localeCompare(right.name)),
    topics,
    resources,
  }
}

// Keep the API discoverable for callers that describe this artifact as a
// catalog or an export rather than a context object.
export const buildAIContextCatalog = buildAIContext
export const createAIContext = buildAIContext
export const exportAIContext = buildAIContext
