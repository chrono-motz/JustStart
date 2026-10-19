import { describe, expect, it } from 'vitest'
import {
  AIIntakeValidationError,
  normalizeAIIntakeManifest,
} from './aiIntake.js'

const validManifest = () => ({
  schemaVersion: '1.0',
  topics: [{ id: 'topic-graphs', title: 'Graph algorithms', description: 'Core graph concepts.' }],
  items: [
    {
      id: 'graph-intro',
      topicId: 'topic-graphs',
      title: 'Graph representations',
      description: 'Compare adjacency lists and matrices.',
      resource: { type: 'file', path: './notes/graphs.pdf', label: 'Graph notes', mimeType: 'application/pdf' },
      estimatedMinutes: 20,
      difficulty: 'medium',
      research: { authors: ['A. Author'], year: 2024, sourceUrl: 'https://example.com/paper' },
      warnings: ['Metadata inferred from the source filename.'],
    },
    {
      id: 'graph-search',
      topicId: 'topic-graphs',
      title: 'Search strategies',
      resource: { type: 'url', url: 'https://example.com/search', label: 'Search guide' },
      parents: ['graph-intro'],
      estimatedMinutes: 15,
      difficulty: 'advanced',
    },
  ],
  warnings: ['Review inferred metadata before publishing.'],
})

describe('AI intake manifests', () => {
  it('normalizes supported resources and returns summary counts', () => {
    const input = validManifest()
    const result = normalizeAIIntakeManifest(input)

    expect(result.manifest).toEqual({
      schemaVersion: '1.0',
      topics: [{ id: 'topic-graphs', title: 'Graph algorithms', description: 'Core graph concepts.' }],
      items: [
        {
          id: 'graph-intro', topicId: 'topic-graphs', title: 'Graph representations',
          description: 'Compare adjacency lists and matrices.',
          resource: { type: 'file', path: 'notes/graphs.pdf', label: 'Graph notes', mimeType: 'application/pdf' },
          estimatedMinutes: 20, difficulty: 'intermediate',
          research: { authors: ['A. Author'], year: 2024, sourceUrl: 'https://example.com/paper' },
          warnings: ['Metadata inferred from the source filename.'],
        },
        {
          id: 'graph-search', topicId: 'topic-graphs', title: 'Search strategies',
          resource: { type: 'url', url: 'https://example.com/search', label: 'Search guide' },
          parents: ['graph-intro'], estimatedMinutes: 15, difficulty: 'advanced',
        },
      ],
      warnings: ['Review inferred metadata before publishing.'],
    })
    expect(result.summary).toEqual({
      topicCount: 1, itemCount: 2, resourceCount: 2,
      fileResourceCount: 1, urlResourceCount: 1, warningCount: 2,
    })
    expect(input.items[0].resource.path).toBe('./notes/graphs.pdf')
  })

  it('accepts null-prototype input metadata without mutating it', () => {
    const manifest = validManifest()
    manifest.items[0].research = Object.assign(Object.create(null), { venue: 'PLDI' })
    expect(normalizeAIIntakeManifest(manifest).manifest.items[0].research).toEqual({ venue: 'PLDI' })
  })

  it('preserves evidence-backed dependency details for the graph importer', () => {
    const manifest = validManifest()
    manifest.items[1].parents = [{
      id: 'graph-intro',
      threshold: 75,
      confidence: 0.9,
      reason: 'The search strategies page assumes the representations are understood first.',
    }]
    manifest.items[1].parentRule = 'ALL'
    const result = normalizeAIIntakeManifest(manifest)
    expect(result.manifest.items[1].parents).toEqual([{
      id: 'graph-intro',
      threshold: 0.75,
      confidence: 0.9,
      reason: 'The search strategies page assumes the representations are understood first.',
    }])
    expect(result.manifest.items[1].parentRule).toBe('ALL')
  })

  it.each([
    ['schema version', () => ({ ...validManifest(), schemaVersion: '2.0' }), 'schemaVersion'],
    ['missing topics', () => ({ ...validManifest(), topics: [] }), 'topics'],
    ['malformed item', () => ({ ...validManifest(), items: [null] }), 'items[0]'],
    ['duplicate IDs', () => ({ ...validManifest(), items: [{ ...validManifest().items[0], id: 'topic-graphs' }] }), 'duplicates ID'],
    ['missing topic reference', () => ({ ...validManifest(), items: [{ ...validManifest().items[0], topicId: 'missing-topic' }] }), 'missing topic'],
    ['missing parent reference', () => ({ ...validManifest(), items: [{ ...validManifest().items[0], parents: ['missing-item'] }] }), 'missing item'],
    ['duplicate resource reference', () => ({ ...validManifest(), items: [{ ...validManifest().items[0], id: 'graph-copy' }, { ...validManifest().items[1], resource: validManifest().items[0].resource }] }), 'may be imported once'],
    ['absolute path', () => ({ ...validManifest(), items: [{ ...validManifest().items[0], resource: { type: 'file', path: '/etc/passwd' } }] }), 'must be relative'],
    ['path traversal', () => ({ ...validManifest(), items: [{ ...validManifest().items[0], resource: { type: 'file', path: 'notes/../secret.pdf' } }] }), 'path traversal'],
    ['unsupported resource', () => ({ ...validManifest(), items: [{ ...validManifest().items[0], resource: { type: 'drive', id: 'abc' } }] }), 'unsupported'],
    ['unsafe URL scheme', () => ({ ...validManifest(), items: [{ ...validManifest().items[0], resource: { type: 'url', url: 'javascript:alert(1)' } }] }), 'http or https'],
  ])('rejects %s with an actionable safe error', (_name, makeManifest, expectedMessage) => {
    expect(() => normalizeAIIntakeManifest(makeManifest())).toThrow(expectedMessage)
  })

  it('collects all validation errors and exposes no resource values in the error', () => {
    const manifest = validManifest()
    manifest.schemaVersion = '9.9'
    manifest.items[0].topicId = 'not-a-topic'
    manifest.items[0].resource = { type: 'file', path: '/private/secret-token.txt' }

    try {
      normalizeAIIntakeManifest(manifest)
      throw new Error('expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(AIIntakeValidationError)
      expect(error.errors.length).toBeGreaterThan(1)
      expect(error.message).toContain('schemaVersion')
      expect(error.message).toContain('missing topic')
      expect(error.message).not.toContain('secret-token')
    }
  })
})
