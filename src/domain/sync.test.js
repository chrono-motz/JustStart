import { describe, expect, it } from 'vitest'
import {
  SYNC_SCHEMA_VERSION,
  buildWorkspaceBackupName,
  makeSyncEnvelope,
  mergeWorkspaces,
  normaliseSyncedWorkspace,
} from './sync.js'

const NOW = '2026-10-17T12:34:56.000Z'

describe('workspace sync utilities', () => {
  it('round-trips a workspace through a sync envelope', () => {
    const workspace = {
      nodes: [{ id: 'node-2', progress: 0.4 }],
      projects: [{ id: 'project-1', name: 'Study' }],
      activeProject: 'Study',
    }

    const envelope = makeSyncEnvelope(workspace, 'laptop', NOW)

    expect(envelope).toEqual({
      version: SYNC_SCHEMA_VERSION,
      deviceId: 'laptop',
      exportedAt: NOW,
      workspace,
    })
    expect(normaliseSyncedWorkspace(envelope, { nodes: [] })).toEqual(workspace)
  })

  it('keeps local-only and remote-only nodes and projects', () => {
    const merged = mergeWorkspaces(
      {
        nodes: [{ id: 'local-node', title: 'Local' }],
        projects: [{ id: 'local-project', name: 'Local project' }],
      },
      {
        nodes: [{ id: 'remote-node', title: 'Remote' }],
        projects: [{ id: 'remote-project', name: 'Remote project' }],
      },
    )

    expect(merged.nodes.map((node) => node.id)).toEqual(['local-node', 'remote-node'])
    expect(merged.projects.map((project) => project.id)).toEqual(['local-project', 'remote-project'])
  })

  it('uses the newest progress timestamp and retains progress events', () => {
    const merged = mergeWorkspaces(
      {
        nodes: [{
          id: 'node',
          progress: 0.25,
          status: 'in_progress',
          updatedAt: '2026-10-17T09:00:00.000Z',
          progressEvents: [{ id: 'local-event', timestamp: '2026-10-17T09:00:00.000Z', progress: 0.25 }],
        }],
      },
      {
        nodes: [{
          id: 'node',
          progress: 0.9,
          status: 'done',
          updatedAt: '2026-10-17T08:00:00.000Z',
          progressEvents: [{ id: 'remote-event', timestamp: '2026-10-17T10:00:00.000Z', progress: 0.9 }],
        }],
      },
    )

    expect(merged.nodes[0].progress).toBe(0.9)
    expect(merged.nodes[0].status).toBe('done')
    expect(merged.nodes[0].progressEvents.map((event) => event.id)).toEqual(['local-event', 'remote-event'])
  })

  it('falls back for unsupported schemas and preserves deletion markers', () => {
    const fallback = { nodes: [{ id: 'fallback' }], projects: [] }
    expect(normaliseSyncedWorkspace({ version: SYNC_SCHEMA_VERSION + 1, workspace: {} }, fallback)).toBe(fallback)

    const merged = mergeWorkspaces(
      { nodes: [{ id: 'node', title: 'Topic', updatedAt: NOW }] },
      { nodes: [{ id: 'node', deleted: true, deletedAt: '2026-10-17T13:00:00.000Z' }] },
    )
    expect(merged.nodes).toEqual([expect.objectContaining({ id: 'node', title: 'Topic', deleted: true })])
    expect(buildWorkspaceBackupName('my laptop', NOW)).toBe(
      'just-start-workspace-my-laptop-2026-10-17T12-34-56-000Z.json',
    )
  })
})
