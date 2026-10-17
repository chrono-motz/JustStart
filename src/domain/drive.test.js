import { describe, expect, it, vi } from 'vitest'
import {
  DRIVE_API_BASE_URL,
  DRIVE_APP_FOLDER_NAME,
  DRIVE_SCOPE,
  DRIVE_WORKSPACE_FILE_NAME,
  createDriveClient,
  driveJsonRequest,
} from './drive.js'

function jsonResponse(value, status = 200, statusText = 'OK') {
  return {
    status,
    statusText,
    headers: { get: () => 'application/json' },
    json: vi.fn(async () => value),
    text: vi.fn(async () => JSON.stringify(value)),
  }
}

function textResponse(value, status = 200, statusText = 'OK') {
  return {
    status,
    statusText,
    headers: { get: () => 'text/plain' },
    text: vi.fn(async () => value),
  }
}

describe('Google Drive transport', () => {
  it('exports the Drive app contract constants', () => {
    expect(DRIVE_API_BASE_URL).toBe('https://www.googleapis.com/drive/v3')
    expect(DRIVE_APP_FOLDER_NAME).toBe('JustStart')
    expect(DRIVE_WORKSPACE_FILE_NAME).toBe('workspace.json')
    expect(DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file')
  })

  it('finds an existing app folder and retains its ID', async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toContain('/files?')
      expect(decodeURIComponent(url).replaceAll('+', ' ')).toContain("'root' in parents and name = 'JustStart'")
      return jsonResponse({ files: [{ id: 'folder-1', name: DRIVE_APP_FOLDER_NAME }] })
    })
    const client = createDriveClient({ fetchImpl, accessToken: 'token-value' })

    const folder = await client.findOrCreateAppFolder()
    expect(folder).toMatchObject({ id: 'folder-1', fileId: 'folder-1' })
    await client.findOrCreateAppFolder()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer token-value')
  })

  it('creates the app folder when the folder is absent', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'new-folder', name: DRIVE_APP_FOLDER_NAME }))
    const client = createDriveClient({ fetchImpl, accessToken: 'token' })

    await expect(client.findOrCreateAppFolder()).resolves.toMatchObject({ id: 'new-folder' })
    const [, request] = fetchImpl.mock.calls[1]
    expect(request.method).toBe('POST')
    expect(JSON.parse(request.body)).toMatchObject({
      name: DRIVE_APP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root'],
    })
  })

  it('reads and writes the workspace while preserving the workspace file ID', async () => {
    const workspace = { resources: [{ id: 'parsing', progress: 0.5 }] }
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'folder-1', name: DRIVE_APP_FOLDER_NAME }] }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'workspace-1', name: DRIVE_WORKSPACE_FILE_NAME }] }))
      .mockResolvedValueOnce(textResponse(JSON.stringify(workspace)))
      .mockResolvedValueOnce(jsonResponse({ id: 'workspace-1', name: DRIVE_WORKSPACE_FILE_NAME }))
    const client = createDriveClient({ fetchImpl, accessToken: 'token' })

    await expect(client.getWorkspaceFile()).resolves.toMatchObject({
      id: 'workspace-1',
      content: workspace,
    })
    await client.putWorkspaceFile(workspace)
    const [url, request] = fetchImpl.mock.calls[3]
    expect(url).toContain('/upload/drive/v3/files/workspace-1?')
    expect(request.method).toBe('PATCH')
    expect(request.headers.get('Content-Type')).toMatch(/^multipart\/related; boundary=/)
    expect(request.body).toContain(JSON.stringify(workspace))
  })

  it('uploads files, lists app files, downloads content, and creates open URLs', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'folder-1', name: DRIVE_APP_FOLDER_NAME }] }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'file-1', name: 'notes.txt' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'file-2', name: 'notes.txt' }))
      .mockResolvedValueOnce(textResponse('hello'))
    const client = createDriveClient({ fetchImpl, accessToken: 'token' })

    await expect(client.listAppFiles()).resolves.toMatchObject([{ id: 'file-1' }])
    const uploaded = await client.uploadFile({ name: 'notes.txt', mimeType: 'text/plain', content: 'hello' })
    expect(uploaded).toMatchObject({ id: 'file-2', fileId: 'file-2' })
    expect(await client.downloadFile('file-2')).toBe('hello')
    expect(client.createSignedLikeOpenUrl('file-2')).toBe('https://drive.google.com/uc?export=download&id=file-2')
    expect(client.webViewUrl('file-2')).toBe('https://drive.google.com/file/d/file-2/view')
  })

  it('rejects failed requests without exposing the token or response body', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 403,
      statusText: 'Forbidden',
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'secret account details' }),
    }))

    await expect(driveJsonRequest(fetchImpl, 'super-secret-token', `${DRIVE_API_BASE_URL}/files`))
      .rejects.toMatchObject({ status: 403, name: 'DriveRequestError' })
    await expect(driveJsonRequest(fetchImpl, 'super-secret-token', `${DRIVE_API_BASE_URL}/files`))
      .rejects.toThrow('Google Drive request failed (403 Forbidden)')
    try {
      await driveJsonRequest(fetchImpl, 'super-secret-token', `${DRIVE_API_BASE_URL}/files`)
    } catch (error) {
      expect(error.message).not.toContain('super-secret-token')
      expect(error.message).not.toContain('secret account details')
    }
  })
})
