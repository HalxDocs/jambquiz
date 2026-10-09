// Go backend client (Railway). Base URL comes from VITE_API_BASE;
// everything here is inert until that variable is set.
export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

export function apiConfigured() {
  return API_BASE !== ''
}

async function post(path, body) {
  if (!apiConfigured()) throw new Error('Online reset is not available yet. Please try again later or contact support.')
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.error || 'Request failed. Please try again.')
  return data
}

export const RESET_FLAG = 'jamb_show_reset'

export function openPasswordReset(setView, setHomeMode) {
  try { localStorage.setItem(RESET_FLAG, '1') } catch { /* non-fatal */ }
  if (setHomeMode) setHomeMode('login')
  setView('home')
}

export const requestPasswordReset = (name) =>
  post('/api/auth/reset-request', { name })

export const confirmPasswordReset = (name, code, newPassword) =>
  post('/api/auth/reset-confirm', { name, code, newPassword })
