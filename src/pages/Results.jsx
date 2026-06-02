import { useState, useEffect } from 'react'
import { listenScores, WEEKS, logEvent } from '../store/useStore'

import SEO from '../components/seo/SEO'

export default function Results({ student, setView }) {
  const [scores, setScores] = useState([])
  const [expandedWeek, setExpandedWeek] = useState(null)
  const [expandedSubject, setExpandedSubject] = useState(null)

  useEffect(() => {
    const unsub = listenScores((all) => {
      setScores(all)
    }, student.id)
    return () => unsub()
  }, [student])

  useEffect(() => { logEvent(student.id, 'page_view', { page: 'results' }) }, [])

  // Group by week — best score per subject per week
  const weekGroups = WEEKS.map((week) => {
    const ws = scores.filter((s) => s.week === week)
    if (!ws.length) return null
    const bySubject = {}
    ws.forEach((s) => {
      if (!bySubject[s.subject] || s.score > bySubject[s.subject].score) bySubject[s.subject] = s
    })
    const entries = Object.values(bySubject)
    const total = entries.reduce((a, s) => a + s.score, 0)
    const medal = total >= 280 ? '🥇' : total >= 200 ? '🥈' : '🥉'
    const latestDate = entries.reduce((latest, s) => {
      const d = new Date(s.date)
      return d > latest ? d : latest
    }, new Date(0))
    return { week, entries, total, maxTotal: entries.length * 100, medal, latestDate }
  }).filter(Boolean).reverse()

  // All-time best (across all attempts, best per subject)
  const allBest = {}
  scores.forEach((s) => {
    if (!allBest[s.subject] || s.score > allBest[s.subject]) allBest[s.subject] = s.score
  })
  const allBestSubjects = Object.keys(allBest)
  const allBestTotal = allBestSubjects.length >= 4
    ? Object.values(allBest).slice(0, 4).reduce((a, b) => a + b, 0)
    : null

  const renderCorrections = (s) => {
    if (!s.questions) return <p className="text-xs text-white/30 font-label py-2">No corrections data</p>
    return (
      <div className="mt-2 space-y-2">
        {s.questions.map((q, i) => {
          const sa = s.answers[i]
          const isOk = sa === q.answer
          const isSkip = sa === null
          return (
            <div key={i} className={`rounded-xl p-3 border text-xs ${isOk ? 'bg-green-900/40 border-green-700/50' : isSkip ? 'bg-white/5 border-white/10' : 'bg-red-900/40 border-red-700/50'}`}>
              <p className="font-semibold text-white mb-1.5 font-body leading-snug">{i + 1}. {q.question}</p>
              {q.image && <img src={q.image} alt="Q" className="mb-2 max-h-40 w-full object-contain rounded-lg border border-white/10 bg-white/5" />}
              <div className="space-y-0.5 mb-1.5">
                {q.options.map((opt, oi) => (
                  <div key={oi} className={`px-2.5 py-1.5 rounded-lg font-label ${oi === q.answer ? 'bg-green-700 text-green-100 font-semibold' : oi === sa && !isOk ? 'bg-red-700 text-red-100' : 'text-white/40'}`}>
                    {String.fromCharCode(65 + oi)}. {opt}{oi === q.answer && ' ✓'}{oi === sa && !isOk && ' ✗'}
                    {q.optionImages?.[oi] && <img src={q.optionImages[oi]} alt="" className="mt-1 max-h-20 rounded" />}
                  </div>
                ))}
              </div>
              {isSkip && <p className="text-white/30 font-label">Skipped</p>}
              {q.explanation && (
                <div className="bg-blue-900/40 border border-blue-700/50 rounded-lg p-2 mt-1.5">
                  <p className="text-[10px] font-bold text-blue-300 font-label mb-0.5">Explanation</p>
                  <p className="text-blue-200 font-label leading-relaxed whitespace-pre-line">{q.explanation}</p>
                  {q.explanationImage && <img src={q.explanationImage} alt="" className="mt-1.5 max-h-40 w-full object-contain rounded-lg border border-blue-700/30" />}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <SEO title="My Results" />
    <div className="min-h-screen bg-[#F8F8F7]">
      <div className="max-w-md mx-auto px-4 pb-10">

        <div className="flex items-center gap-3 pt-8 pb-5">
          <button onClick={() => setView('dashboard')} className="text-[#888] hover:text-[#111] text-sm font-label transition-colors">← Back</button>
          <h2 className="text-xl font-bold text-[#111] font-display">My Results</h2>
        </div>

        {/* All-time best hero */}
        {allBestTotal !== null && (
          <div className="bg-[#111] text-white rounded-2xl p-5 mb-5">
            <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label mb-1">Total Score</p>
            <div className="flex items-end gap-2 mb-3">
              <span className="text-5xl font-bold font-display">{allBestTotal}</span>
              <span className="text-[#555] text-lg mb-1 font-label">/ 400</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1.5 mb-1.5">
              <div className="h-1.5 rounded-full bg-white transition-all" style={{ width: `${Math.min((allBestTotal / 400) * 100, 100)}%` }} />
            </div>
            <div className="flex justify-between">
              <p className="text-[11px] text-[#555] font-label">{Math.round((allBestTotal / 400) * 100)}%</p>
              <p className={`text-[11px] font-bold font-label ${allBestTotal >= 250 ? 'text-green-400' : allBestTotal >= 180 ? 'text-yellow-400' : 'text-red-400'}`}>
                {allBestTotal >= 250 ? 'Strong Performance' : allBestTotal >= 180 ? 'Average' : 'Needs Improvement'}
              </p>
            </div>
          </div>
        )}

        {/* Week-by-week cards */}
        {weekGroups.length === 0 ? (
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
            <p className="text-[#CCC] text-sm font-label">No results yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {weekGroups.map(({ week, entries, total, maxTotal, medal, latestDate }) => {
              const isExp = expandedWeek === week
              const pct = Math.round((total / maxTotal) * 100)
              const pctColor = pct >= 70 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'
              return (
                <div key={week} className="bg-[#111] rounded-2xl overflow-hidden">
                  <button className="w-full p-4 text-left" onClick={() => { setExpandedWeek(isExp ? null : week); setExpandedSubject(null) }}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl shrink-0">{medal}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white font-display">{week}</p>
                        <p className="text-[10px] text-white/40 font-label">{latestDate.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xl font-bold font-display ${pctColor}`}>{total}</p>
                        <p className="text-[10px] text-white/30 font-label">/{maxTotal}</p>
                      </div>
                      <span className={`text-white/30 text-sm transition-transform shrink-0 ${isExp ? 'rotate-90' : ''}`}>→</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1">
                      <div className={`h-1 rounded-full transition-all ${pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-400'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </button>

                  {isExp && (
                    <div className="px-4 pb-4 border-t border-white/10 pt-3">
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.15em] font-label mb-2">Subject Breakdown</p>
                      <div className="space-y-1.5">
                        {entries.map((s) => {
                          const sp = s.score
                          const isSubExp = expandedSubject === `${week}-${s.subject}`
                          return (
                            <div key={s.subject}>
                              <button
                                onClick={() => setExpandedSubject(isSubExp ? null : `${week}-${s.subject}`)}
                                className="flex items-center gap-2.5 w-full py-1.5 text-left"
                              >
                                <p className="flex-1 text-xs font-semibold text-white/80 font-body">{s.subject}</p>
                                <div className="w-14 bg-white/10 rounded-full h-1 shrink-0">
                                  <div className={`h-1 rounded-full ${sp >= 70 ? 'bg-green-500' : sp >= 50 ? 'bg-yellow-500' : 'bg-red-400'}`} style={{ width: `${sp}%` }} />
                                </div>
                                <span className={`text-xs font-bold font-display w-14 text-right shrink-0 ${sp >= 70 ? 'text-green-400' : sp >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{s.score}/100</span>
                                <span className="text-white/30 text-[10px] shrink-0">{isSubExp ? '▲' : '▼'}</span>
                              </button>
                              {isSubExp && (
                                <div className="ml-1 mb-2">
                                  {renderCorrections(s)}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <button onClick={() => setView('dashboard')} className="w-full mt-5 bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm text-[#888] hover:text-[#111] hover:border-[#CCC] transition-colors font-label">
          Back to Dashboard
        </button>
      </div>
    </div>
    </>
  )
}
