/** The version of the workspace shape used by sync envelopes. */
export const SYNC_SCHEMA_VERSION = 1

// Keep the longer name available to callers that prefer the persistence
// module's naming convention.
export const WORKSPACE_SYNC_SCHEMA_VERSION = SYNC_SCHEMA_VERSION

const PROGRESS_ARRAY_FIELDS = ['progressEvents', 'progressHistory']
const MARKERS = [
  { name: 'deleted', timestamp: 'deletedAt' },
  { name: 'archived', timestamp: 'archivedAt' },
]

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function clone(value) {
  if (value instanceof Date) return new Date(value.getTime())
  if (Array.isArray(value)) return value.map((item) => clone(item))
  if (!isObject(value)) return value

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]))
}

function timeValue(value) {
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isNaN(time) ? undefined : time
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim()) {
    const time = Date.parse(value)
    return Number.isNaN(time) ? undefined : time
  }
  return undefined
}

function isoTime(value) {
  const time = timeValue(value)
  if (time === undefined) return '1970-01-01T00:00:00.000Z'
  return new Date(time).toISOString()
}

function stableStringify(value) {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`

  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function workspaceValue(value) {
  return isObject(value) ? value : {}
}

function collection(value) {
  return Array.isArray(value) ? value : []
}

function recordId(record, kind) {
  if (!isObject(record)) return undefined
  const value = record.id ?? record.nodeId ?? (kind === 'project' ? record.name : undefined)
  if (value === undefined || value === null || String(value) === '') return undefined
  return String(value)
}

function recordKey(record, kind) {
  const id = recordId(record, kind)
  return id === undefined ? `anonymous:${stableStringify(record)}` : `id:${id}`
}

function eventTimestamp(event) {
  if (!isObject(event)) return undefined
  return timeValue(event.updatedAt ?? event.timestamp ?? event.at ?? event.createdAt)
}

function progressEvents(record) {
  if (!isObject(record)) return []
  return PROGRESS_ARRAY_FIELDS.flatMap((field) => collection(record[field]))
}

function latestEvent(record) {
  return progressEvents(record).reduce((latest, event) => {
    const timestamp = eventTimestamp(event)
    if (timestamp === undefined) return latest
    if (!latest || timestamp > latest.timestamp) return { event, timestamp }
    if (timestamp === latest.timestamp && stableStringify(event) > stableStringify(latest.event)) {
      return { event, timestamp }
    }
    return latest
  }, null)
}

function recordUpdatedAt(record) {
  if (!isObject(record)) return undefined
  return timeValue(record.updatedAt ?? record.modifiedAt ?? record.createdAt)
}

function progressUpdatedAt(record) {
  if (!isObject(record)) return undefined
  const candidates = [
    latestEvent(record)?.timestamp,
    timeValue(record.progressUpdatedAt),
    recordUpdatedAt(record),
  ].filter((value) => value !== undefined)
  return candidates.length ? Math.max(...candidates) : undefined
}

function recordUpdatedTime(record) {
  const candidates = [
    recordUpdatedAt(record),
    progressUpdatedAt(record),
    ...MARKERS.map(({ timestamp }) => timeValue(record?.[timestamp])),
  ].filter((value) => value !== undefined)
  return candidates.length ? Math.max(...candidates) : undefined
}

function compareRecords(left, right) {
  const leftTime = recordUpdatedTime(left)
  const rightTime = recordUpdatedTime(right)
  if (leftTime !== undefined || rightTime !== undefined) {
    if (leftTime === undefined) return -1
    if (rightTime === undefined) return 1
    if (leftTime !== rightTime) return leftTime < rightTime ? -1 : 1
  }

  const leftProgress = typeof left?.progress === 'number' ? left.progress : -Infinity
  const rightProgress = typeof right?.progress === 'number' ? right.progress : -Infinity
  if (leftProgress !== rightProgress) return leftProgress < rightProgress ? -1 : 1

  const leftKey = stableStringify(left)
  const rightKey = stableStringify(right)
  return leftKey === rightKey ? 0 : leftKey < rightKey ? -1 : 1
}

function eventKey(event) {
  if (isObject(event) && event.id !== undefined && event.id !== null) return `id:${event.id}`
  if (isObject(event) && event.eventId !== undefined && event.eventId !== null) return `event:${event.eventId}`
  return `value:${stableStringify(event)}`
}

function mergeEvents(left, right) {
  const events = new Map()
  for (const event of [...collection(left), ...collection(right)]) {
    const key = eventKey(event)
    const previous = events.get(key)
    if (!previous || compareEvents(event, previous) > 0) events.set(key, clone(event))
  }

  return [...events.values()].sort((a, b) => {
    const aTime = eventTimestamp(a)
    const bTime = eventTimestamp(b)
    if (aTime !== undefined || bTime !== undefined) {
      if (aTime === undefined) return 1
      if (bTime === undefined) return -1
      if (aTime !== bTime) return aTime - bTime
    }
    return stableStringify(a).localeCompare(stableStringify(b))
  })
}

function compareEvents(left, right) {
  const leftTime = eventTimestamp(left)
  const rightTime = eventTimestamp(right)
  if (leftTime !== undefined || rightTime !== undefined) {
    if (leftTime === undefined) return -1
    if (rightTime === undefined) return 1
    if (leftTime !== rightTime) return leftTime < rightTime ? -1 : 1
  }
  return stableStringify(left).localeCompare(stableStringify(right))
}

function mergeProgress(result, left, right) {
  const eventFields = PROGRESS_ARRAY_FIELDS.filter((field) =>
    Array.isArray(left?.[field]) || Array.isArray(right?.[field]),
  )
  for (const field of eventFields) result[field] = mergeEvents(left?.[field], right?.[field])

  const leftTime = progressUpdatedAt(left)
  const rightTime = progressUpdatedAt(right)
  let source = left
  if (compareProgressSources(left, right, leftTime, rightTime) < 0) source = right

  for (const field of ['progress', 'status', 'completed', 'mastery']) {
    if (Object.prototype.hasOwnProperty.call(source ?? {}, field)) result[field] = clone(source[field])
  }
}

function compareProgressSources(left, right, leftTime, rightTime) {
  if (leftTime !== undefined || rightTime !== undefined) {
    if (leftTime === undefined) return -1
    if (rightTime === undefined) return 1
    if (leftTime !== rightTime) return leftTime < rightTime ? -1 : 1
  }

  const leftProgress = typeof left?.progress === 'number' ? left.progress : -Infinity
  const rightProgress = typeof right?.progress === 'number' ? right.progress : -Infinity
  if (leftProgress !== rightProgress) return leftProgress < rightProgress ? -1 : 1
  return stableStringify(left).localeCompare(stableStringify(right))
}

function mergeMarkers(result, left, right) {
  for (const { name, timestamp } of MARKERS) {
    const leftActive = left?.[name] === true || left?.[timestamp] != null
    const rightActive = right?.[name] === true || right?.[timestamp] != null
    if (!leftActive && !rightActive) continue

    const leftTime = timeValue(left?.[timestamp]) ?? recordUpdatedAt(left)
    const rightTime = timeValue(right?.[timestamp]) ?? recordUpdatedAt(right)
    const markerTime = [leftTime, rightTime].filter((value) => value !== undefined)
    result[name] = true
    if (markerTime.length) result[timestamp] = new Date(Math.max(...markerTime)).toISOString()
  }
}

function mergeRecords(left, right) {
  if (!isObject(left)) return clone(right)
  if (!isObject(right)) return clone(left)

  const olderFirst = compareRecords(left, right) <= 0 ? [left, right] : [right, left]
  const result = { ...clone(olderFirst[0]), ...clone(olderFirst[1]) }
  mergeProgress(result, left, right)
  mergeMarkers(result, left, right)
  return result
}

function mergeCollection(left, right, kind) {
  const records = new Map()
  for (const record of [...collection(left), ...collection(right)]) {
    const key = recordKey(record, kind)
    records.set(key, records.has(key) ? mergeRecords(records.get(key), record) : clone(record))
  }

  return [...records.entries()]
    .sort(([leftKey, leftRecord], [rightKey, rightRecord]) => {
      const leftId = recordId(leftRecord, kind) ?? leftKey
      const rightId = recordId(rightRecord, kind) ?? rightKey
      return String(leftId).localeCompare(String(rightId)) || leftKey.localeCompare(rightKey)
    })
    .map(([, record]) => record)
}

function mergeWorkspaceFields(local, remote) {
  const result = {}
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])
  keys.delete('nodes')
  keys.delete('projects')

  for (const key of [...keys].sort()) {
    const hasLocal = Object.prototype.hasOwnProperty.call(local, key)
    const hasRemote = Object.prototype.hasOwnProperty.call(remote, key)
    if (hasLocal && hasRemote && isObject(local[key]) && isObject(remote[key])) {
      result[key] = mergeWorkspaceFields(local[key], remote[key])
    } else if (hasRemote) {
      result[key] = clone(remote[key])
    } else {
      result[key] = clone(local[key])
    }
  }
  return result
}

/**
 * Wrap a workspace in a versioned, device-labelled sync payload.
 * The supplied clock makes the function deterministic and easy to test.
 */
export function makeSyncEnvelope(workspace, deviceId, now) {
  return {
    version: SYNC_SCHEMA_VERSION,
    deviceId: String(deviceId ?? 'unknown-device'),
    exportedAt: isoTime(now),
    workspace: clone(workspaceValue(workspace)),
  }
}

/**
 * Read a sync payload only when its schema is known. Invalid or future data
 * returns the exact fallback supplied by the caller.
 */
export function normaliseSyncedWorkspace(payload, fallback) {
  let value = payload
  if (typeof payload === 'string') {
    try {
      value = JSON.parse(payload)
    } catch {
      return fallback
    }
  }

  if (!isObject(value) || (value.version ?? value.schemaVersion) !== SYNC_SCHEMA_VERSION || !isObject(value.workspace)) {
    return fallback
  }
  return clone(value.workspace)
}

/** Merge two workspaces without mutating either input. */
export function mergeWorkspaces(local, remote) {
  const left = workspaceValue(local)
  const right = workspaceValue(remote)
  return {
    ...mergeWorkspaceFields(left, right),
    nodes: mergeCollection(left.nodes, right.nodes, 'node'),
    projects: mergeCollection(left.projects, right.projects, 'project'),
  }
}

/** Return a filesystem-safe, deterministic name for a workspace export. */
export function buildWorkspaceBackupName(deviceId, now) {
  const safeDeviceId = String(deviceId ?? 'unknown-device')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown-device'
  const timestamp = isoTime(now).replace(/[:.]/g, '-')
  return `just-start-workspace-${safeDeviceId}-${timestamp}.json`
}
