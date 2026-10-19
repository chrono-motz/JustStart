const NODE_WIDTH = 188
const NODE_HEIGHT = 92
const COLUMN_GAP = 72
const ROW_GAP = 34
const PADDING = 42

function asArray(value) {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function parentId(value) {
  if (value && typeof value === 'object') return value.id ?? value.nodeId
  return value
}

function parentIds(node) {
  const raw = node?.prerequisites
  const config = raw && !Array.isArray(raw) && typeof raw === 'object'
  const parents = config
    ? raw.parents ?? raw.parentIds ?? raw.nodes ?? raw.ids
    : raw ?? node?.parents ?? node?.parentIds
  return asArray(parents).map(parentId).filter((id) => id != null).map(String)
}

function nodeLabel(node) {
  return String(node?.title ?? node?.name ?? node?.id ?? 'Untitled topic')
}

function progress(node) {
  if (node?.completed === true || ['done', 'complete', 'completed', 'finished', 'worked_elsewhere', 'worked-elsewhere', 'worked elsewhere'].includes(String(node?.status ?? '').toLowerCase())) return 1
  const value = Number(node?.progress)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value))
}

function sortNodes(nodes) {
  return [...nodes].sort((left, right) => {
    const projectCompare = String(left.project ?? '').localeCompare(String(right.project ?? ''))
    if (projectCompare) return projectCompare
    return nodeLabel(left).localeCompare(nodeLabel(right)) || String(left.id).localeCompare(String(right.id))
  })
}

function connectedDepths(nodes, parentsById) {
  const depths = new Map()
  const visiting = new Set()
  const cycles = []

  function depthFor(id, trail = []) {
    if (depths.has(id)) return depths.get(id)
    if (visiting.has(id)) {
      cycles.push([...trail, id])
      return 0
    }
    visiting.add(id)
    const parents = parentsById.get(id) ?? []
    const depth = parents.length ? Math.max(...parents.filter((parent) => parentsById.has(parent)).map((parent) => depthFor(parent, [...trail, id]))) + 1 : 0
    visiting.delete(id)
    depths.set(id, depth)
    return depth
  }

  nodes.forEach((node) => depthFor(String(node.id)))
  return { depths, cycles }
}

function placeNodes(nodes, parentsById, depths) {
  const connected = nodes.filter((node) => (parentsById.get(String(node.id)) ?? []).some((parent) => parentsById.has(parent)) || [...parentsById.values()].some((parents) => parents.includes(String(node.id))))
  const isolated = nodes.filter((node) => !connected.includes(node))
  const rows = new Map()
  for (const node of sortNodes(connected)) {
    const depth = depths.get(String(node.id)) ?? 0
    const row = rows.get(depth) ?? 0
    rows.set(depth, row + 1)
    node.position = {
      x: PADDING + depth * (NODE_WIDTH + COLUMN_GAP),
      y: PADDING + row * (NODE_HEIGHT + ROW_GAP),
    }
  }

  const connectedHeight = Math.max(0, ...[...rows.values()].map((count) => count * (NODE_HEIGHT + ROW_GAP)))
  const clusterColumns = Math.max(1, Math.ceil(Math.sqrt(Math.max(isolated.length, 1))))
  const clusterStartX = PADDING + Math.max(0, ...[...depths.values()]) * (NODE_WIDTH + COLUMN_GAP) + NODE_WIDTH + COLUMN_GAP
  for (const [index, node] of sortNodes(isolated).entries()) {
    const column = index % clusterColumns
    const row = Math.floor(index / clusterColumns)
    node.position = {
      x: clusterStartX + column * (NODE_WIDTH + COLUMN_GAP),
      y: PADDING + row * (NODE_HEIGHT + ROW_GAP),
    }
  }

  return { nodes, connectedHeight }
}

/** Build a deterministic, presentation-friendly dependency map for the graph view. */
export function buildGraphModel(input = []) {
  const sourceNodes = Array.isArray(input) ? input.filter((node) => node?.id != null) : []
  const nodes = sortNodes(sourceNodes).map((node) => ({
    ...node,
    label: nodeLabel(node),
    progress: progress(node),
    position: null,
  }))
  const nodeIds = new Set(nodes.map((node) => String(node.id)))
  const parentsById = new Map(nodes.map((node) => [String(node.id), parentIds(node)]))
  const edges = []
  const missing = []
  for (const node of nodes) {
    for (const parent of parentsById.get(String(node.id)) ?? []) {
      if (!nodeIds.has(parent)) {
        missing.push({ from: parent, to: String(node.id) })
        continue
      }
      edges.push({ from: parent, to: String(node.id) })
    }
  }
  const { depths, cycles } = connectedDepths(nodes, parentsById)
  placeNodes(nodes, parentsById, depths)
  const maxX = Math.max(...nodes.map((node) => node.position.x + NODE_WIDTH), PADDING * 2 + NODE_WIDTH)
  const maxY = Math.max(...nodes.map((node) => node.position.y + NODE_HEIGHT), PADDING * 2 + NODE_HEIGHT)
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]))
  return {
    nodes,
    edges,
    missing,
    cycles,
    nodeById,
    width: maxX + PADDING,
    height: maxY + PADDING,
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
  }
}
