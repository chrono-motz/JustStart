const SCHEMA_VERSION = '1.0'
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const DIFFICULTY_ALIASES = new Map([
  ['easy', 'beginner'],
  ['medium', 'intermediate'],
  ['hard', 'advanced'],
  ['beginner', 'beginner'],
  ['intermediate', 'intermediate'],
  ['advanced', 'advanced'],
  ['expert', 'expert'],
])
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function describeType(value) {
  if (Array.isArray(value)) return 'an array'
  if (value === null) return 'null'
  return typeof value
}

function addError(errors, path, message) {
  errors.push(`${path} ${message}`)
}

function hasOnlyKeys(value, allowed, errors, path) {
  if (!isPlainObject(value)) return
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) addError(errors, `${path}.${key}`, 'is not supported; remove this field.')
  }
}

function normalizeId(value, path, errors) {
  if (typeof value !== 'string') {
    addError(errors, path, 'must be a stable string ID.')
    return ''
  }
  const id = value.trim()
  if (!id) {
    addError(errors, path, 'must be a non-empty stable string ID.')
  } else if (id !== value) {
    addError(errors, path, 'must not contain leading or trailing whitespace.')
  } else if (!ID_PATTERN.test(id)) {
    addError(errors, path, 'contains unsupported characters; use letters, numbers, `.`, `_`, `:`, or `-`.')
  }
  return id
}

function normalizeDescription(value, path, errors) {
  if (value == null) return undefined
  if (typeof value !== 'string') {
    addError(errors, path, 'must be a string when provided.')
    return undefined
  }
  const description = value.trim()
  return description || undefined
}

function decodePath(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function normalizeFilePath(value, path, errors) {
  if (typeof value !== 'string') {
    addError(errors, path, 'must be a relative workspace path.')
    return ''
  }
  const raw = value.trim()
  const decoded = decodePath(raw)
  const comparable = decoded == null ? raw : decoded
  if (!raw || raw.includes('\0') || comparable.includes('\0')) {
    addError(errors, path, 'must be a non-empty safe relative path.')
    return ''
  }
  if (/^(?:[A-Za-z]:[\\/]|[\\/]{2}|[\\/])/.test(raw) || /^[A-Za-z]:/.test(comparable)) {
    addError(errors, path, 'must be relative; remove the absolute drive, UNC, or leading-slash prefix.')
    return ''
  }

  const segments = comparable.replaceAll('\\', '/').split('/')
  if (segments.some((segment) => segment === '..')) {
    addError(errors, path, 'must not contain `..` path traversal segments.')
    return ''
  }
  if (decoded == null) {
    addError(errors, path, 'contains malformed URL encoding; use a plain relative path.')
    return ''
  }

  const normalized = raw.replaceAll('\\', '/').split('/').filter((segment) => segment && segment !== '.').join('/')
  if (!normalized) addError(errors, path, 'must identify a file.')
  return normalized
}

function normalizeUrl(value, path, errors) {
  if (typeof value !== 'string' || !value.trim()) {
    addError(errors, path, 'must be a non-empty http(s) URL.')
    return ''
  }
  const raw = value.trim()
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    addError(errors, path, 'must be a valid http(s) URL.')
    return ''
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    addError(errors, path, 'must use http or https; other resource schemes are unsupported.')
    return ''
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    addError(errors, path, 'must have a host and must not contain URL credentials.')
    return ''
  }
  return raw
}

function normalizeResource(value, path, errors) {
  if (!isPlainObject(value)) {
    addError(errors, path, `must be a file or URL resource object, not ${describeType(value)}.`)
    return null
  }
  hasOnlyKeys(value, new Set(['type', 'kind', 'path', 'url', 'label', 'mimeType']), errors, path)
  const type = text(value.type || value.kind).toLowerCase()
  if (!type || !['file', 'url'].includes(type)) {
    addError(errors, `${path}.type`, 'must be `file` or `url`; this resource kind is unsupported.')
    return null
  }
  if (value.type != null && value.kind != null && text(value.type).toLowerCase() !== text(value.kind).toLowerCase()) {
    addError(errors, path, 'cannot specify conflicting `type` and `kind` values.')
    return null
  }

  const resource = { type }
  if (type === 'file') {
    if (value.url != null) addError(errors, `${path}.url`, 'is unsupported on a file resource; use `path`.')
    const normalizedPath = normalizeFilePath(value.path, `${path}.path`, errors)
    if (normalizedPath) resource.path = normalizedPath
  } else {
    if (value.path != null) addError(errors, `${path}.path`, 'is unsupported on a URL resource; use `url`.')
    const normalizedUrl = normalizeUrl(value.url, `${path}.url`, errors)
    if (normalizedUrl) resource.url = normalizedUrl
  }

  if (value.label != null) {
    if (typeof value.label !== 'string') addError(errors, `${path}.label`, 'must be a string when provided.')
    else if (text(value.label)) resource.label = text(value.label)
  }
  if (value.mimeType != null) {
    if (typeof value.mimeType !== 'string' || !text(value.mimeType)) addError(errors, `${path}.mimeType`, 'must be a non-empty string when provided.')
    else resource.mimeType = text(value.mimeType).toLowerCase()
  }
  return resource
}

function normalizeJsonMetadata(value, path, errors, depth = 0) {
  if (depth > 8) {
    addError(errors, path, 'is nested too deeply.')
    return undefined
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeJsonMetadata(entry, `${path}[${index}]`, errors, depth + 1))
  }
  if (!isPlainObject(value)) {
    addError(errors, path, 'must contain only JSON-compatible metadata.')
    return undefined
  }
  const result = {}
  for (const [key, entry] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      addError(errors, `${path}.${key}`, 'is not allowed in metadata.')
      continue
    }
    const normalized = normalizeJsonMetadata(entry, `${path}.${key}`, errors, depth + 1)
    if (normalized !== undefined) result[key] = normalized
  }
  return result
}

function normalizeWarnings(value, path, errors) {
  if (value == null) return undefined
  if (!Array.isArray(value)) {
    addError(errors, path, 'must be an array of warning strings when provided.')
    return undefined
  }
  const warnings = []
  for (const [index, warning] of value.entries()) {
    if (typeof warning !== 'string' || !text(warning)) {
      addError(errors, `${path}[${index}]`, 'must be a non-empty warning string.')
    } else {
      warnings.push(text(warning))
    }
  }
  return warnings
}

function normalizeTopic(value, index, errors) {
  const path = `topics[${index}]`
  if (!isPlainObject(value)) {
    addError(errors, path, `must be an object, not ${describeType(value)}.`)
    return null
  }
  hasOnlyKeys(value, new Set(['id', 'title', 'name', 'description', 'warnings']), errors, path)
  const id = normalizeId(value.id, `${path}.id`, errors)
  const titleValue = value.title ?? value.name
  if (typeof titleValue !== 'string' || !text(titleValue)) addError(errors, `${path}.title`, 'must be a non-empty string.')
  const topic = { id, title: text(titleValue) }
  const description = normalizeDescription(value.description, `${path}.description`, errors)
  if (description) topic.description = description
  const warnings = normalizeWarnings(value.warnings, `${path}.warnings`, errors)
  if (warnings?.length) topic.warnings = warnings
  return topic
}

function normalizeDifficulty(value, path, errors) {
  if (value == null) return undefined
  if (typeof value !== 'string' || !DIFFICULTY_ALIASES.has(text(value).toLowerCase())) {
    addError(errors, path, 'must be beginner, intermediate, advanced, or expert.')
    return undefined
  }
  return DIFFICULTY_ALIASES.get(text(value).toLowerCase())
}

function normalizeFraction(value, path, errors, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    addError(errors, path, `must be a number from 0 to 1 (or 0 to 100 percent) when provided for ${label}.`)
    return undefined
  }
  return value > 1 ? value / 100 : value
}

function normalizeParent(value, path, errors) {
  if (typeof value === 'string') return normalizeId(value, path, errors)
  if (!isPlainObject(value)) {
    addError(errors, path, 'must be an item ID string or a dependency object.')
    return ''
  }
  hasOnlyKeys(value, new Set(['id', 'nodeId', 'threshold', 'progressThreshold', 'confidence', 'reason']), errors, path)
  const id = normalizeId(value.id ?? value.nodeId, `${path}.id`, errors)
  const parent = { id }
  if (value.threshold != null || value.progressThreshold != null) {
    const threshold = normalizeFraction(value.threshold ?? value.progressThreshold, `${path}.threshold`, errors, 'threshold')
    if (threshold != null) parent.threshold = threshold
  }
  if (value.confidence != null) {
    const confidence = normalizeFraction(value.confidence, `${path}.confidence`, errors, 'confidence')
    if (confidence != null) parent.confidence = confidence
  }
  if (value.reason != null) {
    if (typeof value.reason !== 'string' || !text(value.reason)) addError(errors, `${path}.reason`, 'must be a non-empty string when provided.')
    else parent.reason = text(value.reason)
  }
  return parent
}

function normalizeItem(value, index, errors) {
  const path = `items[${index}]`
  if (!isPlainObject(value)) {
    addError(errors, path, `must be an object, not ${describeType(value)}.`)
    return null
  }
  hasOnlyKeys(value, new Set([
    'id', 'topicId', 'title', 'name', 'description', 'resource', 'parents', 'parentRule', 'progressThreshold',
    'estimatedMinutes', 'difficulty', 'research', 'researchMetadata', 'warnings',
  ]), errors, path)
  const id = normalizeId(value.id, `${path}.id`, errors)
  const topicId = normalizeId(value.topicId, `${path}.topicId`, errors)
  const titleValue = value.title ?? value.name
  if (typeof titleValue !== 'string' || !text(titleValue)) addError(errors, `${path}.title`, 'must be a non-empty string.')
  const item = { id, topicId, title: text(titleValue) }
  const description = normalizeDescription(value.description, `${path}.description`, errors)
  if (description) item.description = description
  const resource = normalizeResource(value.resource, `${path}.resource`, errors)
  if (resource) item.resource = resource

  if (value.parents != null) {
    if (!Array.isArray(value.parents)) {
      addError(errors, `${path}.parents`, 'must be an array of item IDs or dependency objects when provided.')
    } else {
      item.parents = value.parents.map((parent, parentIndex) => normalizeParent(parent, `${path}.parents[${parentIndex}]`, errors))
      const parentIds = item.parents.map((parent) => typeof parent === 'object' ? parent.id : parent)
      if (new Set(parentIds).size !== parentIds.length) addError(errors, `${path}.parents`, 'must not contain duplicate parent IDs.')
    }
  }
  if (value.parentRule != null) {
    if (value.parentRule !== 'ALL' && value.parentRule !== 'ANY') addError(errors, `${path}.parentRule`, 'must be `ALL` or `ANY` when provided.')
    else item.parentRule = value.parentRule
  }
  if (value.progressThreshold != null) {
    const threshold = normalizeFraction(value.progressThreshold, `${path}.progressThreshold`, errors, 'progress threshold')
    if (threshold != null) item.progressThreshold = threshold
  }
  if (value.estimatedMinutes != null) {
    if (!Number.isInteger(value.estimatedMinutes) || value.estimatedMinutes <= 0) addError(errors, `${path}.estimatedMinutes`, 'must be a positive integer.')
    else item.estimatedMinutes = value.estimatedMinutes
  }
  const difficulty = normalizeDifficulty(value.difficulty, `${path}.difficulty`, errors)
  if (difficulty) item.difficulty = difficulty
  const metadataValue = value.research ?? value.researchMetadata
  if (metadataValue != null) {
    const research = normalizeJsonMetadata(metadataValue, `${path}.research`, errors)
    if (research !== undefined) item.research = research
  }
  const warnings = normalizeWarnings(value.warnings, `${path}.warnings`, errors)
  if (warnings?.length) item.warnings = warnings
  return item
}

function checkReferences(manifest, errors) {
  const topicIds = new Set(manifest.topics.map((topic) => topic.id))
  const itemIds = new Set(manifest.items.map((item) => item.id))
  const allIds = new Set()
  for (const [index, entry] of [...manifest.topics, ...manifest.items].entries()) {
    const kind = index < manifest.topics.length ? 'topic' : 'item'
    if (!entry.id) continue
    if (allIds.has(entry.id)) addError(errors, `${kind === 'topic' ? 'topics' : 'items'}[${kind === 'topic' ? index : index - manifest.topics.length}].id`, `duplicates ID \`${entry.id}\`; every topic and item ID must be unique.`)
    allIds.add(entry.id)
  }
  manifest.items.forEach((item, index) => {
    if (item.topicId && !topicIds.has(item.topicId)) addError(errors, `items[${index}].topicId`, `references missing topic \`${item.topicId}\`; add that topic or correct the ID.`)
    for (const parent of item.parents || []) {
      const parentId = typeof parent === 'object' ? parent.id : parent
      if (!itemIds.has(parentId)) addError(errors, `items[${index}].parents`, `references missing item \`${parentId}\`; parent IDs must name another item.`)
      if (parentId === item.id) addError(errors, `items[${index}].parents`, 'cannot include the item itself as a parent.')
    }
  })

  const resourceReferences = new Map()
  manifest.items.forEach((item, index) => {
    if (!item.resource) return
    const reference = item.resource.type === 'url' ? `url:${item.resource.url}` : `file:${item.resource.path}`
    if (resourceReferences.has(reference)) {
      addError(errors, `items[${index}].resource`, `duplicates the resource reference used by items[${resourceReferences.get(reference)}]; each source file or URL may be imported once.`)
    } else {
      resourceReferences.set(reference, index)
    }
  })

  const visiting = new Set()
  const visited = new Set()
  const byId = new Map(manifest.items.map((item) => [item.id, item]))
  function visit(id) {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    const item = byId.get(id)
    const cycle = item?.parents?.some((parent) => {
      const parentId = typeof parent === 'object' ? parent.id : parent
      return byId.has(parentId) && visit(parentId)
    })
    visiting.delete(id)
    visited.add(id)
    return cycle
  }
  for (const item of manifest.items) {
    if (visit(item.id)) {
      addError(errors, 'items.parents', 'must not contain prerequisite cycles; break the cycle and try again.')
      break
    }
  }
}

/** Error thrown when an AI intake manifest cannot be safely normalized. */
export class AIIntakeValidationError extends Error {
  constructor(errors) {
    super(`AI intake manifest is invalid. ${errors.join(' ')}`)
    this.name = 'AIIntakeValidationError'
    this.errors = [...errors]
  }
}

/** Normalize and validate a Phase 1 AI intake manifest without mutating its input. */
export function normalizeAIIntakeManifest(value) {
  const errors = []
  if (!isPlainObject(value)) {
    throw new AIIntakeValidationError([`manifest must be an object, not ${describeType(value)}.`])
  }
  hasOnlyKeys(value, new Set(['schemaVersion', 'topics', 'items', 'warnings']), errors, 'manifest')
  if (value.schemaVersion !== SCHEMA_VERSION) addError(errors, 'schemaVersion', 'must be exactly `1.0`; unsupported schema versions cannot be imported.')
  if (!Array.isArray(value.topics) || value.topics.length === 0) addError(errors, 'topics', 'must be a non-empty array.')
  if (!Array.isArray(value.items) || value.items.length === 0) addError(errors, 'items', 'must be a non-empty array.')

  const topics = Array.isArray(value.topics) ? value.topics.map((topic, index) => normalizeTopic(topic, index, errors)).filter(Boolean) : []
  const items = Array.isArray(value.items) ? value.items.map((item, index) => normalizeItem(item, index, errors)).filter(Boolean) : []
  const warnings = normalizeWarnings(value.warnings, 'warnings', errors)
  const manifest = { schemaVersion: SCHEMA_VERSION, topics, items }
  if (warnings?.length) manifest.warnings = warnings
  checkReferences(manifest, errors)
  if (errors.length) throw new AIIntakeValidationError(errors)

  const fileResourceCount = items.filter((item) => item.resource.type === 'file').length
  const urlResourceCount = items.filter((item) => item.resource.type === 'url').length
  return {
    manifest,
    summary: {
      topicCount: topics.length,
      itemCount: items.length,
      resourceCount: items.length,
      fileResourceCount,
      urlResourceCount,
      warningCount: (warnings?.length || 0)
        + topics.reduce((count, topic) => count + (topic.warnings?.length || 0), 0)
        + items.reduce((count, item) => count + (item.warnings?.length || 0), 0),
    },
  }
}

// Aliases keep the domain API discoverable for callers using either spelling.
export const normaliseAIIntakeManifest = normalizeAIIntakeManifest
export const normalizeAndValidateAIIntake = normalizeAIIntakeManifest

export {
  ZipPathError,
  enumerateZipFiles,
  isObviousZipMetadata,
  normalizeZipPath,
  readZipArchive,
  readZipFile,
  unpackZipFile,
} from './zipIntake.js'
