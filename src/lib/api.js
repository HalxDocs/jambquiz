// Go backend client (Railway). Base URL comes from VITE_API_BASE;
// everything here is inert until that variable is set.
export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

export function apiConfigured() {
  return API_BASE !== ''
}

export const RESET_FLAG = 'jamb_show_reset'
const TOKEN_KEY = 'go_jwt'
const ME_KEY = 'go_me'

export function openPasswordReset(setView, setHomeMode) {
  try { localStorage.setItem(RESET_FLAG, '1') } catch { /* non-fatal */ }
  if (setHomeMode) setHomeMode('login')
  setView('home')
}

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || '' } catch { /* storage unavailable */ return '' }
}

export function setSession(token, me) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
    if (me) localStorage.setItem(ME_KEY, JSON.stringify(me))
    else if (!token) localStorage.removeItem(ME_KEY)
  } catch { /* storage unavailable */ }
}

export function getCachedMe() {
  try {
    const raw = localStorage.getItem(ME_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { /* storage unavailable */ return null }
}

export function clearSession() {
  setSession(null, null)
}

async function request(method, path, body, token) {
  if (!apiConfigured()) throw new Error('Online services are not available yet. Please try again later or contact support.')
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.error || 'Request failed. Please try again.')
  return data
}

const authHeader = () => getToken()

export const apiGet = (path) => request('GET', path, undefined, authHeader())
export const apiPost = (path, body) => request('POST', path, body, authHeader())
export const apiPut = (path, body) => request('PUT', path, body, authHeader())
export const apiPatch = (path, body) => request('PATCH', path, body, authHeader())
export const apiDelete = (path, body) => request('DELETE', path, body, authHeader())
export const apiPostPublic = (path, body) => request('POST', path, body, '')
export const apiGetPublic = (path) => request('GET', path, undefined, '')

export const requestPasswordReset = (name) =>
  request('POST', '/api/auth/reset-request', { name }, '')

export const confirmPasswordReset = (name, code, newPassword) =>
  request('POST', '/api/auth/reset-confirm', { name, code, newPassword }, '')
