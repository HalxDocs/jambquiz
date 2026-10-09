// Coins store — Go backend (shapes mirror the old callables).
import { apiGet, apiPost } from '../lib/api'

export const LIFELINE_COST = { ask3: 10, ask2: 6, ask1: 2, peek: 2, fifty: 2 }
export const LIFELINE_USES_PER_TEST = 5

export async function getCoinBalance(studentId) {
  const res = await apiGet(`/api/coins/balance?studentId=${encodeURIComponent(studentId)}`)
  return res
}

export async function listCoinPacks() {
  const res = await apiGet('/api/coins/packs')
  return res
}

export async function shareResult(studentId, week) {
  const res = await apiPost('/api/coins/share', { studentId, week })
  return res
}

export async function updateSquad(studentId, squad) {
  const res = await apiPost('/api/coins/squad', { studentId, squad })
  return res
}

export async function useLifeline(payload) {
  const res = await apiPost('/api/coins/lifeline', payload)
  return res
}

export async function peekStatus(payload) {
  const res = await apiPost('/api/coins/peek-status', payload)
  return res
}

export async function createCoinsCheckout(studentId, packId) {
  const callbackUrl = typeof window !== 'undefined' ? window.location.origin + '/' : undefined
  const res = await apiPost('/api/payments/paystack/create', { studentId, type: 'coins', packId, callbackUrl })
  return res
}
