/*
 * Completion-aware selection for the Just Start recommendation surface.
 *
 * Nodes are plain objects. The canonical prerequisite shape is:
 *
 *   {
 *     id: 'parsing',
 *     parents: ['lexing'],
 *     parentRule: 'ALL',
 *     progressThreshold: 0.8,
 *     progress: 0.4,
 *     status: 'in_progress'
 *   }
 *
 * `prerequisites: { parents, rule, progress }` and `parentIds` are accepted
 * as equivalent input forms because imported study data often uses either.
 * The functions do not mutate nodes or the input collection.
 */

const COMPLETED_STATUSES = new Set([
  'done',
  'complete',
  'completed',
  'finished',
  'worked_elsewhere',
  'worked-elsewhere',
  'worked elsewhere',
])
const SKIPPED_STATUSES = new Set(['skipped', 'skip'])
const DEFAULT_HORIZON_MS = 14 * 24 * 60 * 60 * 1000

function asArray(value) {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function nodeId(value) {
  if (value && typeof value === 'object') return value.id ?? value.nodeId
  return value
}

function displayName(node, fallback = 'this prerequisite') {
  return node?.title ?? node?.name ?? node?.label ?? node?.id ?? fallback
}

function normaliseProgress(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  // Percentages are convenient in imported data; the public model is 0..1.
  const progress = value > 1 ? value / 100 : value
  return Math.max(0, Math.min(1, progress))
}

function normaliseThreshold(value, fallback = 1) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value))
}

function getNodeMap(nodes) {
  if (nodes instanceof Map) return nodes
  const map = new Map()
  for (const node of collectionValues(nodes)) {
    const id = nodeId(node)
    if (id != null) map.set(String(id), node)
  }
  return map
}

function collectionValues(collection) {
  return collection instanceof Map ? [...collection.values()] : asArray(collection)
}

function prerequisiteConfig(node) {
  const raw = node?.prerequisites
  const rawIsConfig = raw && !Array.isArray(raw) && typeof raw === 'object'
  const parentValue = rawIsConfig
    ? raw.parents ?? raw.parentIds ?? raw.nodes ?? raw.ids
    : raw ?? node?.parents ?? node?.parentIds

  const parents = asArray(parentValue).map((parent) => {
    if (parent && typeof parent === 'object') {
      return {
        id: nodeId(parent),
        threshold: parent.threshold ?? parent.progressThreshold ?? parent.progress,
      }
    }
    return { id: parent }
  })

  const rule = String(
    (rawIsConfig ? raw.rule ?? raw.mode : undefined)
      ?? node?.parentRule
      ?? node?.prerequisiteRule
      ?? node?.gateRule
      ?? 'ALL',
  ).toUpperCase() === 'ANY' ? 'ANY' : 'ALL'

  const threshold = normaliseThreshold(
    (rawIsConfig ? raw.progress ?? raw.threshold ?? raw.minProgress : undefined)
      ?? node?.progressThreshold
      ?? node?.prerequisiteProgress
      ?? node?.minimumParentProgress
      ?? 1,
  )

  return { parents, rule, threshold }
}

function parentThreshold(node, parent, config) {
  const thresholds = node?.parentProgressThresholds
  const fromMap = thresholds && parent.id != null ? thresholds[parent.id] : undefined
  return normaliseThreshold(parent.threshold ?? fromMap, config.threshold)
}

function isSkipped(node) {
  return SKIPPED_STATUSES.has(String(node?.status ?? '').toLowerCase()) || node?.skipped === true
}

function isComplete(node, threshold = 1) {
  if (!node || isSkipped(node)) return false
  if (node.completed === true || COMPLETED_STATUSES.has(String(node.status ?? '').toLowerCase())) {
    return true
  }
  return normaliseProgress(node.progress) >= threshold
}

function inspectParent(parent, nodeMap, threshold) {
  const id = nodeId(parent)
  const actual = id == null ? undefined : nodeMap.get(String(id))
  const name = displayName(actual, id == null ? 'an unnamed prerequisite' : String(id))

  if (!actual) {
    return {
      id,
      satisfied: false,
      reason: `Prerequisite "${name}" is missing.`,
    }
  }
  if (isSkipped(actual)) {
    return {
      id,
      satisfied: false,
      progress: normaliseProgress(actual.progress),
      reason: `Prerequisite "${name}" was skipped and is not complete.`,
    }
  }

  const progress = normaliseProgress(actual.progress)
  const satisfied = isComplete(actual, threshold)
  return {
    id,
    satisfied,
    progress,
    threshold,
    reason: satisfied
      ? undefined
      : `Prerequisite "${name}" is ${Math.round(progress * 100)}% complete; needs ${Math.round(threshold * 100)}%.`,
  }
}

/**
 * Return detailed gate state for a node. Missing parents and skipped parents
 * are hard failures; a skipped node never unlocks another node.
 */
export function getPrerequisiteStatus(node, nodes) {
  const config = prerequisiteConfig(node)
  const nodeMap = getNodeMap(nodes)
  const parents = config.parents.map((parent) =>
    inspectParent(parent, nodeMap, parentThreshold(node, parent, config)),
  )
  const satisfied = config.rule === 'ANY'
    ? parents.length === 0 || parents.some((parent) => parent.satisfied)
    : parents.every((parent) => parent.satisfied)

  let blockedReasons = parents.filter((parent) => !parent.satisfied).map((parent) => parent.reason)
  if (config.rule === 'ANY' && parents.length > 1 && blockedReasons.length > 0 && !satisfied) {
    blockedReasons = [`Any prerequisite must reach its required progress. ${blockedReasons.join(' ')}`]
  }

  return {
    satisfied,
    rule: config.rule,
    threshold: config.threshold,
    parents,
    blockedReasons,
  }
}

/** Determine whether all/any prerequisite gates for `node` are satisfied. */
export function arePrerequisitesSatisfied(node, nodes) {
  return getPrerequisiteStatus(node, nodes).satisfied
}

// Singular spelling is useful at call sites and keeps the domain API forgiving.
export const isPrerequisiteSatisfied = arePrerequisitesSatisfied

function normaliseCollection(input) {
  if (Array.isArray(input) || input instanceof Map) return input
  return input?.nodes ?? input?.items ?? []
}

function isAvailable(node) {
  return !isSkipped(node)
    && !node?.completed
    && !COMPLETED_STATUSES.has(String(node?.status ?? '').toLowerCase())
}

/**
 * Evaluate every node, retaining blocked candidates and human-readable causes
 * so a UI can explain why a recommendation is not available.
 */
export function evaluateCandidates(input) {
  const nodes = normaliseCollection(input)
  const nodeMap = getNodeMap(nodes)
  return collectionValues(nodes).map((node) => {
    const gate = getPrerequisiteStatus(node, nodeMap)
    const blockedReasons = [...gate.blockedReasons]
    if (isSkipped(node)) blockedReasons.unshift(`"${displayName(node)}" was skipped.`)
    if (!isAvailable(node) && !isSkipped(node)) blockedReasons.unshift(`"${displayName(node)}" is already complete.`)
    return {
      node,
      eligible: isAvailable(node) && gate.satisfied,
      blockedReasons,
      prerequisite: gate,
    }
  })
}

/** Return only nodes that can be started now, in source order. */
export function getEligibleCandidates(input) {
  return evaluateCandidates(input).filter((candidate) => candidate.eligible).map((candidate) => candidate.node)
}

function toTime(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const time = Date.parse(value)
    return Number.isNaN(time) ? undefined : time
  }
  return undefined
}

function numberScore(value, fallback = 0) {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value))
}

/** A 0..1 urgency score: overdue is highest, no deadline is zero. */
export function deadlinePressure(node, now = 0, horizonMs = DEFAULT_HORIZON_MS) {
  const deadline = toTime(node?.deadline ?? node?.dueAt ?? node?.dueDate)
  if (deadline == null) return 0
  if (deadline <= now) return 1
  return Math.max(0, Math.min(1, 1 - (deadline - now) / horizonMs))
}

function stableHash(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

function scoreParts(node, options = {}) {
  // The caller supplies the clock so scoring remains deterministic and pure.
  const now = toTime(options.now) ?? 0
  const weights = { deadline: 0.35, importance: 0.25, unlockValue: 0.2, startability: 0.2, ...options.weights }
  const parts = {
    deadline: deadlinePressure(node, now, options.horizonMs ?? DEFAULT_HORIZON_MS),
    importance: numberScore(node?.importance ?? node?.priority),
    unlockValue: numberScore(node?.unlockValue ?? node?.unlock ?? node?.unlocks),
    startability: numberScore(node?.startability ?? node?.startable ?? node?.ease),
  }
  const score = Object.keys(parts).reduce((total, key) => total + parts[key] * (weights[key] ?? 0), 0)
  return { ...parts, score }
}

/** Return the weighted ranking score without changing the node. */
export function scoreCandidate(node, options = {}) {
  return scoreParts(node, options)
}

/**
 * Rank eligible nodes. Ties use a seeded stable hash (or id/title when no
 * seed is supplied), so the result does not depend on input order.
 */
export function rankCandidates(input, options = {}) {
  const candidates = getEligibleCandidates(input)
  const seed = String(options.seed ?? 'just-start')
  return [...candidates].sort((left, right) => {
    const scoreDifference = scoreParts(right, options).score - scoreParts(left, options).score
    if (Math.abs(scoreDifference) > 1e-12) return scoreDifference
    const leftKey = `${seed}:${String(nodeId(left) ?? displayName(left))}`
    const rightKey = `${seed}:${String(nodeId(right) ?? displayName(right))}`
    const tieDifference = stableHash(rightKey) - stableHash(leftKey)
    if (Math.abs(tieDifference) > 1e-12) return tieDifference
    return String(nodeId(left) ?? displayName(left)).localeCompare(String(nodeId(right) ?? displayName(right)))
  })
}

/** Select the highest-ranked eligible node, or null when no work is startable. */
export function selectRecommendedNode(input, options = {}) {
  return rankCandidates(input, options)[0] ?? null
}

export const selectRecommendation = selectRecommendedNode

export const isGateSatisfied = arePrerequisitesSatisfied
export const getEligibleNodes = getEligibleCandidates
export const recommendNextNode = selectRecommendedNode
