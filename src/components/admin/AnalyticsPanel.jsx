import { useState, useEffect, useMemo } from 'react'
import { db, collection, getDocs, query, limit as fbLimit } from '../../firebase'

const RANGES = [
  { key: '7d', label: '7 days' },
  { key: '14d', label: '14 days' },
  { key: '1m', label: '1 month' },
  { key: '1y', label: '1 year' },
]

function getCutoff(rangeKey) {
  const now = Date.now()
  switch (rangeKey) {
    case '7d': return new Date(now - 7 * 86400000).toISOString().split('T')[0]
    case '14d': return new Date(now - 14 * 86400000).toISOString().split('T')[0]
    case '1m': return new Date(now - 30 * 86400000).toISOString().split('T')[0]
    case '1y': return new Date(now - 365 * 86400000).toISOString().split('T')[0]
    default: return ''
  }
}

function summarize(events, rangeKey) {
  const cutoff = getCutoff(rangeKey)
  const filtered = cutoff ? events.filter((e) => (e.date || '') >= cutoff) : events

  const pageViews = {}
  const dailyActive = {}
  const quizCompletions = { count: 0, totalScore: 0 }
  const uniqueStudents = new Set()

  filtered.forEach((e) => {
    uniqueStudents.add(e.studentId)

    if (e.eventType === 'page_view') {
      const page = e.metadata?.page || 'unknown'
      pageViews[page] = (pageViews[page] || 0) + 1
    }

    if (e.eventType === 'quiz_completed') {
      quizCompletions.count++
      quizCompletions.totalScore += e.metadata?.total || 0
    }

    const date = e.date || e.timestamp?.split('T')[0] || 'unknown'
    dailyActive[date] = (dailyActive[date] || 0) + 1
  })

  const avgScore = quizCompletions.count > 0
    ? Math.round(quizCompletions.totalScore / quizCompletions.count)
    : 0

  const sortedDates = Object.entries(dailyActive).sort((a, b) => a[0].localeCompare(b[0]))

  const topPages = Object.entries(pageViews).sort((a, b) => b[1] - a[1])

  return {
    totalEvents: filtered.length,
    uniqueStudents: uniqueStudents.size,
    avgScore,
    quizCount: quizCompletions.count,
    sortedDates,
    topPages,
  }
}

export default function AnalyticsPanel() {
  const [loading, setLoading] = useState(true)
  const [rawEvents, setRawEvents] = useState([])
  const [range, setRange] = useState('14d')

  const loadAnalytics = async () => {
    setLoading(true)
    try {
      const q = query(collection(db, 'usage_logs'), fbLimit(5000))
      const snap = await getDocs(q)
      const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      events.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      setRawEvents(events)
    } catch (e) {
      const msg = e?.message || ''
      if (msg.includes('index')) {
        console.error('Analytics: missing Firestore index.')
      } else {
        console.error('Failed to load analytics:', msg)
      }
    }
    setLoading(false)
  }

  useEffect(() => { loadAnalytics() }, [])

  const stats = useMemo(() => rawEvents.length ? summarize(rawEvents, range) : null, [rawEvents, range])
  const recent = useMemo(() => {
    if (!rawEvents.length) return []
    const cutoff = getCutoff(range)
    return cutoff ? rawEvents.filter((e) => (e.date || '') >= cutoff) : rawEvents
  }, [rawEvents, range]).slice(0, 50)

  if (loading && !stats) {
    return (
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
        <div className="w-6 h-6 border-2 border-[#111] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-[#CCC] text-sm font-label">Loading analytics…</p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
        <p className="text-[#CCC] text-sm font-label">No usage data yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Range filter */}
      <div className="flex gap-1 p-1 bg-[#EBEBEB] rounded-xl">
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold font-label transition-all ${
              range === r.key ? 'bg-white text-[#111] shadow-sm' : 'text-[#888] hover:text-[#555]'
            }`}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
          <p className="text-[10px] font-bold text-[#888] uppercase tracking-wide font-label mb-0.5">Total Events</p>
          <p className="text-2xl font-bold font-display text-[#111]">{stats.totalEvents.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
          <p className="text-[10px] font-bold text-[#888] uppercase tracking-wide font-label mb-0.5">Active Students</p>
          <p className="text-2xl font-bold font-display text-[#111]">{stats.uniqueStudents}</p>
        </div>
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
          <p className="text-[10px] font-bold text-[#888] uppercase tracking-wide font-label mb-0.5">Quizzes Taken</p>
          <p className="text-2xl font-bold font-display text-[#111]">{stats.quizCount}</p>
        </div>
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
          <p className="text-[10px] font-bold text-[#888] uppercase tracking-wide font-label mb-0.5">Avg Quiz Score</p>
          <p className="text-2xl font-bold font-display text-[#111]">{stats.avgScore}<span className="text-sm text-[#888] font-label">%</span></p>
        </div>
      </div>

      {/* Daily active users */}
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
        <p className="text-xs font-bold text-[#111] font-display mb-3">Daily Activity ({RANGES.find((r) => r.key === range)?.label})</p>
        <div className="space-y-1.5">
          {stats.sortedDates.map(([date, count]) => {
            const max = Math.max(...stats.sortedDates.map(([, c]) => c), 1)
            const pct = (count / max) * 100
            const d = new Date(date + 'T00:00:00')
            const label = d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
            return (
              <div key={date} className="flex items-center gap-2">
                <span className="text-[10px] text-[#888] font-label w-20 shrink-0">{label}</span>
                <div className="flex-1 h-5 bg-[#F3F3F2] rounded-full overflow-hidden">
                  <div className="h-full bg-[#111] rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] font-bold text-[#555] font-label w-6 text-right">{count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Popular pages */}
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
        <p className="text-xs font-bold text-[#111] font-display mb-3">Most Visited Pages</p>
        <div className="space-y-2">
          {stats.topPages.map(([page, count]) => {
            const max = Math.max(...stats.topPages.map(([, c]) => c), 1)
            const pct = (count / max) * 100
            return (
              <div key={page} className="flex items-center gap-2">
                <span className="text-xs text-[#555] font-label capitalize w-24 shrink-0">{page.replace(/_/g, ' ')}</span>
                <div className="flex-1 h-4 bg-[#F3F3F2] rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] font-bold text-[#555] font-label w-8 text-right">{count}</span>
              </div>
            )
          })}
          {stats.topPages.length === 0 && (
            <p className="text-xs text-[#CCC] font-label">No page views tracked yet</p>
          )}
        </div>
      </div>

      {/* Recent events */}
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-[#111] font-display">Recent Events</p>
          <button onClick={loadAnalytics} disabled={loading}
            className="text-[10px] font-bold text-[#888] hover:text-[#111] font-label transition-colors disabled:opacity-40">
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {recent.map((e) => {
            const page = e.metadata?.page || ''
            const subjects = e.metadata?.subjects
            return (
              <div key={e.id} className="flex justify-between items-center gap-2 py-1 border-b border-[#F3F3F2] last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[#555] font-body truncate">
                    {e.eventType === 'page_view' ? `📄 ${page}` :
                     e.eventType === 'quiz_loaded' ? '📝 Quiz loaded' :
                     e.eventType === 'quiz_completed' ? `✅ Quiz done ${subjects ? `(${subjects.length} subjects)` : ''}` :
                     `❓ ${e.eventType}`}
                  </p>
                  <p className="text-[10px] text-[#CCC] font-label">{new Date(e.timestamp).toLocaleString('en-NG')}</p>
                </div>
                <span className="text-[10px] text-[#AAA] font-label shrink-0">{e.studentId?.slice(0, 8)}…</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
