import { describe, expect, it } from 'vitest'
import { buildAIContext } from './aiContext.js'

const sampleWorkspace = () => ({
  projects: [
    { id: 'compiler', name: 'Compiler Design', description: 'A compiler study plan.', color: 'violet' },
    { name: 'All focus areas', color: 'ink' },
  ],
  nodes: [
    {
      id: 'compiler-parsing',
      project: 'Compiler Design',
      kind: 'topic',
      topic: 'parsing',
      title: 'Parsing',
      description: 'Build structure from tokens.',
      resource: {
        type: 'pdf',
        path: '/SampleSlides/CompilerDesign/03_parsing.pdf',
        label: '03_parsing.pdf',
      },
      progress: 0.35,
      session: { accessToken: 'do-not-export' },
    },
    {
      id: 'parser-guide',
      project: 'Compiler Design',
      title: 'Parser guide',
      resource: {
        type: 'other',
        url: 'https://example.com/parser-guide',
        name: 'Parser guide',
      },
    },
  ],
})

describe('AI context catalog', () => {
  it('exports sample-like nodes with focus areas, stable IDs, and useful metadata only', () => {
    const workspace = sampleWorkspace()
    const context = buildAIContext({ ...workspace, generatedAt: '2026-10-20T00:00:00.000Z' })

    expect(context).toEqual({
      schemaVersion: '1.0',
      generatedAt: '2026-10-20T00:00:00.000Z',
      focusAreas: [{ id: 'compiler', name: 'Compiler Design', description: 'A compiler study plan.' }],
      topics: [
        {
          id: 'compiler-parsing',
          project: 'Compiler Design',
          focusArea: 'Compiler Design',
          focusAreaId: 'compiler',
          title: 'Parsing',
          description: 'Build structure from tokens.',
          topic: 'parsing',
          kind: 'topic',
        },
        {
          id: 'parser-guide',
          project: 'Compiler Design',
          focusArea: 'Compiler Design',
          focusAreaId: 'compiler',
          title: 'Parser guide',
          kind: 'topic',
        },
      ],
      resources: [
        {
          nodeId: 'compiler-parsing',
          type: 'file',
          kind: 'pdf',
          path: 'SampleSlides/CompilerDesign/03_parsing.pdf',
          name: '03_parsing.pdf',
        },
        { nodeId: 'parser-guide', type: 'url', url: 'https://example.com/parser-guide', name: 'Parser guide' },
      ],
    })
  })

  it('normalizes file, URL, and storage identity while omitting temporary paths', () => {
    const context = buildAIContext({
      nodes: [
        {
          id: 'file-node',
          project: 'Reading',
          title: 'Stored notes',
          resource: {
            type: 'text',
            sourcePath: 'notes/guide.md',
            path: 'blob:https://app.example/temporary',
            name: 'guide.md',
            storagePath: 'ai-intake/file-node/guide.md',
            storageBucket: 'resources',
            storageProvider: 'supabase',
            signedUrl: 'https://storage.example/signed?token=secret',
          },
        },
        {
          id: 'url-node',
          project: 'Reading',
          title: 'Public reference',
          resource: { type: 'other', url: 'https://example.com/reference?q=parsing' },
        },
      ],
    })

    expect(context.resources).toEqual([
      {
        nodeId: 'file-node',
        type: 'file',
        kind: 'text',
        sourcePath: 'notes/guide.md',
        name: 'guide.md',
        storage: { path: 'ai-intake/file-node/guide.md', bucket: 'resources', provider: 'supabase' },
      },
      { nodeId: 'url-node', type: 'url', url: 'https://example.com/reference?q=parsing', name: 'reference' },
    ])
    expect(JSON.stringify(context)).not.toContain('blob:')
    expect(JSON.stringify(context)).not.toContain('signedUrl')
    expect(JSON.stringify(context)).not.toContain('token=secret')
  })

  it('preserves AI item IDs and deterministically deduplicates topics', () => {
    const input = {
      nodes: [
        { id: 'ai-item-real-node-duplicate', aiItemId: 'manifest-item-7', project: 'Research', title: 'A topic', resource: { url: 'https://example.com/a' } },
        { id: 'ai-item-real-node', aiItemId: 'manifest-item-7', project: 'Research', title: 'A topic', description: 'Same topic', resource: { url: 'https://example.com/a' } },
      ],
      projects: [{ name: 'Research' }],
      generatedAt: new Date('2026-10-20T00:00:00.000Z'),
    }
    const context = buildAIContext(input)

    expect(context.topics).toHaveLength(1)
    expect(context.topics[0].aiItemId).toBe('manifest-item-7')
    expect(context.resources).toHaveLength(2)
    expect(context.generatedAt).toBe('2026-10-20T00:00:00.000Z')
  })

  it('is deterministic, JSON serializable, and does not mutate its input', () => {
    const workspace = sampleWorkspace()
    const before = structuredClone(workspace)
    const first = buildAIContext({ ...workspace, generatedAt: 'fixed' })
    const second = buildAIContext({
      nodes: [...workspace.nodes].reverse(),
      projects: [...workspace.projects].reverse(),
      generatedAt: 'fixed',
    })

    expect(first).toEqual(second)
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
    expect(workspace).toEqual(before)
  })

  it('does not export private fields, file contents, or unsafe URLs', () => {
    const context = buildAIContext({
      nodes: [{
        id: 'private-node',
        project: 'Private',
        title: 'Private source',
        description: 'Keep this useful description.',
        content: 'file contents must not be exported',
        accessToken: 'secret-token',
        session: { user: 'private-session' },
        resource: {
          sourcePath: '/Users/alice/private.pdf',
          path: 'data:application/pdf;base64,secret-file-content',
          url: 'https://example.com/file?access_token=secret',
          name: 'private.pdf',
        },
      }],
    })

    const serialized = JSON.stringify(context)
    expect(serialized).toContain('Keep this useful description.')
    expect(serialized).toContain('private.pdf')
    expect(serialized).not.toContain('file contents must not be exported')
    expect(serialized).not.toContain('secret-token')
    expect(serialized).not.toContain('private-session')
    expect(serialized).not.toContain('Users/alice')
    expect(serialized).not.toContain('access_token')
    expect(context.resources[0]).toMatchObject({ type: 'file', name: 'private.pdf' })
    expect(context.resources[0]).not.toHaveProperty('url')
    expect(context.resources[0]).not.toHaveProperty('path')
  })
})
