import { DRIVE_SCOPE } from './drive.js'

export const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client'

let scriptPromise

/** Load Google's browser-only Identity Services library once. */
export function loadGoogleIdentityServices(documentRef = globalThis.document) {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve(globalThis.google)
  if (!documentRef?.createElement || !documentRef?.head) {
    return Promise.reject(new Error('Google sign-in is only available in a browser.'))
  }
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const script = documentRef.createElement('script')
    script.src = GOOGLE_IDENTITY_SCRIPT
    script.async = true
    script.defer = true
    script.onload = () => globalThis.google?.accounts?.oauth2
      ? resolve(globalThis.google)
      : reject(new Error('Google sign-in loaded without its OAuth client.'))
    script.onerror = () => reject(new Error('Unable to load Google sign-in. Check your connection.'))
    documentRef.head.appendChild(script)
  })
  return scriptPromise
}

/** Request a short-lived Drive access token without handling user credentials. */
export async function requestDriveAccess({ clientId, googleObject, load = loadGoogleIdentityServices } = {}) {
  if (typeof clientId !== 'string' || !clientId.trim()) {
    throw new Error('Set VITE_GOOGLE_CLIENT_ID before connecting Google Drive.')
  }
  const google = googleObject || await load()
  if (!google?.accounts?.oauth2?.initTokenClient) {
    throw new Error('Google sign-in is unavailable in this browser.')
  }

  return new Promise((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response?.error || !response?.access_token) {
          reject(new Error('Google Drive access was not granted.'))
          return
        }
        resolve({ accessToken: response.access_token, expiresIn: response.expires_in })
      },
      error_callback: () => reject(new Error('Google sign-in was cancelled or failed.')),
    })
    tokenClient.requestAccessToken({ prompt: '' })
  })
}
