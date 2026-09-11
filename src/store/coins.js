import { functions, httpsCallable } from '../firebase'

export const LIFELINE_COST = { ask3: 10, ask2: 6, ask1: 2, peek: 2, fifty: 2 }
export const LIFELINE_USES_PER_TEST = 3

export async function getCoinBalance(studentId) {
  const res = await httpsCallable(functions, 'getCoinBalance')({ studentId })
  return res.data
}

export async function listCoinPacks() {
  const res = await httpsCallable(functions, 'listCoinPacks')()
  return res.data
}

export async function shareResult(studentId, week) {
  const res = await httpsCallable(functions, 'shareResult')({ studentId, week })
  return res.data
}

export async function updateSquad(studentId, squad) {
  const res = await httpsCallable(functions, 'updateSquad')({ studentId, squad })
  return res.data
}

export async function useLifeline(payload) {
  const res = await httpsCallable(functions, 'useLifeline')(payload)
  return res.data
}

export async function createCoinsCheckout(studentId, packId) {
  const callbackUrl = typeof window !== 'undefined' ? window.location.origin + '/' : undefined
  const res = await httpsCallable(functions, 'createPaystackCheckout')({ studentId, type: 'coins', packId, callbackUrl })
  return res.data
}
