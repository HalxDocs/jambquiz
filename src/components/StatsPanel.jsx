import { useState } from 'react'
import { SUBJECTS, getAccessStatus } from '../store/useStore'

export default function StatsPanel({ students, scores, payments, onTabChange }) {
  const [statsYear, setStatsYear] = useState('all')

  const currentYear = new Date().getFullYear()
  const jamb_years = ['SS3', ...Array.from({ length: 10 }, (_, i) => String(currentYear + i))]
  const filterYears = ['all', ...jamb_years]

  const getTotalScore = (studentId) => {
    const s = scores.filter((sc) => sc.studentId === studentId)
    if (!s.length) return null
    const best = {}
    s.forEach((sc) => {
      if (!best[sc.subject] || sc.score > best[sc.subject].score) best[sc.subject] = sc
    })
    const subjects = Object.values(best)
    if (subjects.length < 4) return null
    return subjects.slice(0, 4).reduce((a, sc) => a + sc.score, 0)
  }

  const getYearStats = (yr) => {
    const grp = yr === 'all' ? students : students.filter((s) => s.year === yr)
    if (!grp.length) return null
    const grpScores = scores.filter((sc) => grp.find((s) => s.id === sc.studentId))
    const avg = grpScores.length ? Math.round(grpScores.reduce((a, b) => a + b.score, 0) / grpScores.length) : 0

    const top = grp
      .map((s) => ({ name: s.name, total: getTotalScore(s.id) }))
      .filter((s) => s.total !== null)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)

    const topBySubject = SUBJECTS.map((subject) => {
      const subScores = grpScores.filter((sc) => sc.subject === subject)
      if (!subScores.length) return null

      const byStudent = {}
      subScores.forEach((sc) => {
        const student = grp.find((s) => s.id === sc.studentId)
        if (!student) return
        if (!byStudent[sc.studentId] || sc.score > byStudent[sc.studentId].score) {
          byStudent[sc.studentId] = { name: student.name, score: sc.score, outOf: sc.outOf || 100 }
        }
      })

      const ranked = Object.values(byStudent)
        .map((s) => ({ ...s, pct: Math.round((s.score / s.outOf) * 100) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)

      return { subject, ranked }
    }).filter(Boolean).filter((s) => s.ranked.length > 0)

    return { count: grp.length, attempts: grpScores.length, avg, top, topBySubject }
  }

  const stats = getYearStats(statsYear)

  return (
    <div>
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {filterYears.map((y) => (
          <button
            key={y}
            onClick={() => setStatsYear(y)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors font-label ${
              statsYear === y ? 'bg-[#111] text-white' : 'bg-white border border-[#E5E5E5] text-[#555]'
            }`}
          >
            {y === 'all' ? 'All Years' : y}
          </button>
        ))}
      </div>

      {!stats ? (
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
          <p className="text-[#CCC] text-sm font-label">No data yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { value: stats.count, label: 'Students', color: 'text-[#111]' },
              { value: stats.attempts, label: 'Attempts', color: 'text-blue-600' },
              { value: stats.avg, label: 'Avg Score', color: stats.avg >= 70 ? 'text-green-600' : stats.avg >= 50 ? 'text-yellow-600' : 'text-red-500' },
            ].map(({ value, label, color }) => (
              <div key={label} className="bg-white border border-[#EBEBEB] rounded-xl p-4 text-center">
                <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
                <p className="text-[10px] text-[#AAA] font-label mt-1">{label}</p>
              </div>
            ))}
          </div>

          {(() => {
            const grpStudents = statsYear === 'all' ? students : students.filter((s) => s.year === statsYear)
            const grpStudentIds = new Set(grpStudents.map((s) => s.id))
            const grpPayments = payments.filter((p) => grpStudentIds.has(p.studentId))
            const totalRev = grpPayments.reduce((a, p) => a + (p.amount || 0), 0)
            const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
            const monthRev = grpPayments.filter((p) => new Date(p.paidAt).getTime() >= monthStart).reduce((a, p) => a + (p.amount || 0), 0)
            let active = 0, trial = 0, expired = 0
            grpStudents.forEach((s) => {
              const st = getAccessStatus(s).status
              if (st === 'active') active++
              else if (st === 'trial') trial++
              else expired++
            })
            return (
              <button
                onClick={() => onTabChange && onTabChange('payments')}
                className="w-full text-left bg-[#111] text-white rounded-2xl p-5 hover:bg-[#222] transition-colors"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label mb-1">Revenue {statsYear !== 'all' ? `— ${statsYear}` : ''}</p>
                    <div className="flex items-end gap-1.5">
                      <span className="text-3xl font-bold font-display">₦{totalRev.toLocaleString()}</span>
                      <span className="text-[#666] text-xs mb-1 font-label">all time</span>
                    </div>
                    <p className="text-[11px] text-[#AAA] font-label mt-1">₦{monthRev.toLocaleString()} this month</p>
                  </div>
                  <span className="text-[10px] font-semibold text-[#888] hover:text-white font-label">View →</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10">
                  <div className="text-center">
                    <p className="text-base font-bold text-green-400 font-display">{active}</p>
                    <p className="text-[10px] text-[#666] font-label">Active</p>
                  </div>
                  <div className="text-center border-x border-white/10">
                    <p className="text-base font-bold text-yellow-400 font-display">{trial}</p>
                    <p className="text-[10px] text-[#666] font-label">Trial</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold text-red-400 font-display">{expired}</p>
                    <p className="text-[10px] text-[#666] font-label">Expired</p>
                  </div>
                </div>
              </button>
            )
          })()}

          {stats.top.length > 0 && (
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
              <p className="text-sm font-bold text-[#111] font-display mb-3">
                Top Performers {statsYear !== 'all' ? `— ${statsYear}` : ''}
              </p>
              <div className="space-y-2">
                {stats.top.map((s, i) => (
                  <div key={i} className="flex justify-between items-center py-2.5 border-b border-[#F3F3F2] last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-display ${
                        i === 0 ? 'bg-yellow-100 text-yellow-700' :
                        i === 1 ? 'bg-[#F3F3F2] text-[#555]' :
                        'bg-orange-50 text-orange-600'
                      }`}>
                        {i + 1}
                      </span>
                      <p className="text-sm font-semibold text-[#111] font-body">{s.name}</p>
                    </div>
                    <p className="text-sm font-bold text-[#111] font-display">
                      {s.total}<span className="text-[10px] text-[#AAA] font-label">/400</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.topBySubject && stats.topBySubject.length > 0 && (
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
              <p className="text-sm font-bold text-[#111] font-display mb-4">
                Top Performers by Subject {statsYear !== 'all' ? `— ${statsYear}` : ''}
              </p>
              <div className="space-y-5">
                {stats.topBySubject.map(({ subject, ranked }) => (
                  <div key={subject}>
                    <p className="text-[11px] font-bold text-[#888] uppercase tracking-[0.15em] font-label mb-2">{subject}</p>
                    <div className="space-y-1.5">
                      {ranked.map((s, i) => (
                        <div key={i} className="flex justify-between items-center py-2 px-3 bg-[#F8F8F7] rounded-xl">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-display shrink-0 ${
                              i === 0 ? 'bg-yellow-100 text-yellow-700' :
                              i === 1 ? 'bg-[#E5E5E5] text-[#555]' :
                              'bg-orange-50 text-orange-600'
                            }`}>
                              {i + 1}
                            </span>
                            <p className="text-xs font-semibold text-[#111] font-body">{s.name}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold font-display text-[#111]">{s.score}</span>
                            <span className="text-[10px] text-[#AAA] font-label">/{s.outOf}</span>
                            <span className={`ml-2 text-[10px] font-bold font-label ${
                              s.pct >= 70 ? 'text-green-600' : s.pct >= 50 ? 'text-yellow-600' : 'text-red-500'
                            }`}>{s.pct}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
            <p className="text-sm font-bold text-[#111] font-display mb-4">Performance by Subject</p>
            <div className="space-y-4">
              {SUBJECTS.map((subject) => {
                const grp = statsYear === 'all' ? students : students.filter((s) => s.year === statsYear)
                const subScores = scores.filter((sc) => sc.subject === subject && grp.find((s) => s.id === sc.studentId))
                if (!subScores.length) return null
                const subAvg = Math.round(subScores.reduce((a, b) => a + b.score, 0) / subScores.length)
                const subMax = subScores[0]?.outOf || 160
                const pct = Math.round((subAvg / subMax) * 100)
                return (
                  <div key={subject}>
                    <div className="flex justify-between items-center mb-1.5">
                      <p className="text-xs font-semibold text-[#333] font-body">{subject}</p>
                      <p className="text-[11px] text-[#888] font-label">{subAvg}/{subMax} · {subScores.length} attempts</p>
                    </div>
                    <div className="w-full bg-[#F3F3F2] rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-400'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
