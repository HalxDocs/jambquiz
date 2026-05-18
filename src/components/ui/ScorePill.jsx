export default function ScorePill({ pct }) {
  if (pct === null || pct === undefined) return null
  const color = pct >= 70 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'
  return <span className={`text-xs font-bold font-label ${color}`}>{pct}%</span>
}
