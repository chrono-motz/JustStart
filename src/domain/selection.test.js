import { describe, expect, it } from 'vitest'
import {
  arePrerequisitesSatisfied,
  evaluateCandidates,
  getEligibleCandidates,
  getPrerequisiteStatus,
  rankCandidates,
  selectRecommendedNode,
} from './selection.js'

const NOW = Date.parse('2026-01-01T00:00:00Z')

function node(id, values = {}) {
  return { id, title: id, progress: 0, status: 'todo', ...values }
}

describe('completion-aware prerequisite gates', () => {
  it('requires every parent for an ALL gate and respects progress thresholds', () => {
    const nodes = [
      node('lexing', { progress: 0.8 }),
      node('parsing', { progress: 1, status: 'done' }),
      node('semantic-analysis', {
        parents: ['lexing', 'parsing'],
        parentRule: 'ALL',
        progressThreshold: 0.75,
      }),
    ]

    expect(arePrerequisitesSatisfied(nodes[2], nodes)).toBe(true)
    nodes[0].progress = 0.7
    const gate = getPrerequisiteStatus(nodes[2], nodes)
    expect(gate.satisfied).toBe(false)
    expect(gate.blockedReasons[0]).toContain('needs 75%')
  })

  it('unlocks an ANY gate when one parent reaches its threshold', () => {
    const nodes = [
      node('reading', { progress: 0.2 }),
      node('lecture', { progress: 0.7 }),
      node('practice', {
        prerequisites: { parents: ['reading', 'lecture'], rule: 'ANY', progress: 0.6 },
      }),
    ]

    expect(arePrerequisitesSatisfied(nodes[2], nodes)).toBe(true)
    nodes[1].progress = 0.5
    expect(getPrerequisiteStatus(nodes[2], nodes).blockedReasons[0]).toContain('Any prerequisite')
  })

  it('treats partial progress as insufficient and skipped parents as hard blocks', () => {
    const nodes = [
      node('intro', { progress: 0.5 }),
      node('skipped-topic', { status: 'skipped', progress: 1 }),
      node('advanced', { parents: [{ id: 'intro', threshold: 0.8 }, 'skipped-topic'] }),
    ]

    const result = getPrerequisiteStatus(nodes[2], nodes)
    expect(result.satisfied).toBe(false)
    expect(result.blockedReasons.join(' ')).toMatch(/needs 80%/)
    expect(result.blockedReasons.join(' ')).toMatch(/was skipped/)
  })
})

describe('candidate eligibility and recommendation', () => {
  it('excludes done and skipped nodes while exposing useful blocked reasons', () => {
    const nodes = [
      node('done', { status: 'done', progress: 1 }),
      node('skipped', { status: 'skipped' }),
      node('blocked', { parents: ['missing'], progressThreshold: 1 }),
      node('ready'),
    ]

    expect(getEligibleCandidates(nodes).map((item) => item.id)).toEqual(['ready'])
    const blocked = evaluateCandidates(nodes).find((item) => item.node.id === 'skipped')
    expect(blocked.eligible).toBe(false)
    expect(blocked.blockedReasons[0]).toContain('was skipped')
  })

  it('puts deadline pressure ahead of a less urgent candidate', () => {
    const nodes = [
      node('later', {
        deadline: '2026-01-10T00:00:00Z',
        importance: 0.5,
        unlockValue: 0.5,
        startability: 0.5,
      }),
      node('urgent', {
        deadline: '2026-01-02T00:00:00Z',
        importance: 0.5,
        unlockValue: 0.5,
        startability: 0.5,
      }),
    ]

    expect(rankCandidates(nodes, { now: NOW }).map((item) => item.id)[0]).toBe('urgent')
  })

  it('selects an eligible node and breaks exact ties deterministically', () => {
    const nodes = [
      node('alpha', { importance: 0.5 }),
      node('beta', { importance: 0.5 }),
      node('blocked', { parents: ['missing'] }),
    ]
    const first = selectRecommendedNode(nodes, { seed: 'demo', now: NOW })
    const second = selectRecommendedNode([...nodes].reverse(), { seed: 'demo', now: NOW })

    expect(first.id).not.toBe('blocked')
    expect(first.id).toBe(second.id)
  })
})
