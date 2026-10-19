import { describe, expect, it } from 'vitest'
import { buildGraphModel } from './graph.js'

describe('buildGraphModel', () => {
  it('turns prerequisite forms into deterministic directed edges', () => {
    const model = buildGraphModel([
      { id: 'child', title: 'Child', parents: [{ id: 'root', threshold: 0.6 }] },
      { id: 'root', title: 'Root', progress: 1, status: 'done' },
      { id: 'loose', title: 'Loose topic' },
    ])
    expect(model.edges).toEqual([{ from: 'root', to: 'child' }])
    expect(model.nodes.map((node) => node.label)).toEqual(['Child', 'Loose topic', 'Root'])
    expect(model.nodes.find((node) => node.id === 'root').position.x).toBeLessThan(model.nodes.find((node) => node.id === 'child').position.x)
  })

  it('keeps independent nodes in a visible cluster and reports missing parents', () => {
    const model = buildGraphModel([
      { id: 'a', title: 'A', prerequisites: { parents: ['missing'] } },
      { id: 'b', title: 'B' },
    ])
    expect(model.edges).toEqual([])
    expect(model.missing).toEqual([{ from: 'missing', to: 'a' }])
    expect(model.nodes.every((node) => node.position)).toBe(true)
  })

  it('normalises percentage progress and detects cycles without throwing', () => {
    const model = buildGraphModel([
      { id: 'a', title: 'A', progress: 50, parents: ['b'] },
      { id: 'b', title: 'B', parents: ['a'] },
    ])
    expect(model.nodes.find((node) => node.id === 'a').progress).toBe(0.5)
    expect(model.cycles.length).toBeGreaterThan(0)
  })
})
