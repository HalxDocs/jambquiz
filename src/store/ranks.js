import { RANK_TIERS } from './constants'

function getConsistencyRank(scores) {
  const sessions = new Set()
  ;(scores || []).forEach((s) => sessions.add(`${s.week}::${s.subject}`))
  const count = sessions.size
  let current = RANK_TIERS[0]
  let next = null
  for (let i = 0; i < RANK_TIERS.length; i++) {
    if (count >= RANK_TIERS[i].min) current = RANK_TIERS[i]
    else { next = RANK_TIERS[i]; break }
  }
  const isElite = current.name === 'ELITE'
  const sessionsInRank = count - current.min
  const barFill = isElite ? 5 : Math.min(sessionsInRank, 5)
  const toNext = next ? next.min - count : 0
  return {
    rank: current.name,
    color: current.color,
    sessions: count,
    nextRank: next?.name || null,
    nextAt: next?.min || null,
    barFill,
    toNext,
  }
}

export { getConsistencyRank, RANK_TIERS }
