import { describe, expect, it, vi } from 'vitest'
import { requestDriveAccess } from './googleAuth.js'

describe('Google Drive browser auth', () => {
  it('requests the least-privilege Drive scope and returns the token', async () => {
    const requestAccessToken = vi.fn()
    const initTokenClient = vi.fn((options) => {
      setTimeout(() => options.callback({ access_token: 'token', expires_in: 3600 }), 0)
      return { requestAccessToken }
    })
    const result = await requestDriveAccess({
      clientId: 'client-id',
      googleObject: { accounts: { oauth2: { initTokenClient } } },
    })

    expect(result).toEqual({ accessToken: 'token', expiresIn: 3600 })
    expect(initTokenClient.mock.calls[0][0].scope).toBe('https://www.googleapis.com/auth/drive.file')
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: '' })
  })

  it('returns safe errors for missing configuration and denied access', async () => {
    await expect(requestDriveAccess({})).rejects.toThrow('VITE_GOOGLE_CLIENT_ID')
    const initTokenClient = vi.fn((options) => {
      setTimeout(() => options.callback({ error: 'access_denied' }), 0)
      return { requestAccessToken: vi.fn() }
    })
    await expect(requestDriveAccess({
      clientId: 'client-id',
      googleObject: { accounts: { oauth2: { initTokenClient } } },
    })).rejects.toThrow('access was not granted')
  })
})
