import { useState } from 'react'
import { normalizeTopic } from '../../store/useStore'
import { safeUrl } from '../../lib/safeUrl'
import { runAutopsy } from '../../lib/weakTopicAutopsy'
import Corrections from './Corrections'

export default function QuizResults({
  allResults,
  weekLabel,
  medalToast,
  setMedalToast,
  nextWeekTopics,
  onBackToDashboard,
  onViewResults,
}) {
  const [expandedSubject, setExpandedSubject] = useState(null)
  const [autopsyOpen, setAutopsyOpen] = useState(false)
  const [autopsyCopied, setAutopsyCopied] = useState(false)
  const total = allResults.reduce((a, r) => a + r.score, 0)
  const autopsy = runAutopsy({ currentResults: allResults, historyResults: [] })
  const maxTotal = allResults.length * 100
  const medal = total >= 280 ? '🥇' : total >= 200 ? '🥈' : '🥉'
  const pct = Math.round((total / maxTotal) * 100)

  return (
    <div className="min-h-screen bg-[#F8F8F7] pb-10">
      {medalToast && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setMedalToast(null)}>
          <div className="bg-white rounded-3xl p-8 text-center max-w-xs w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-7xl mb-3">{medalToast.medal}</p>
            <p className="text-xl font-bold text-[#111] font-display mb-1">
              {medalToast.medal === '🥇' ? 'Gold Medal!' : medalToast.medal === '🥈' ? 'Silver Medal!' : 'Bronze Medal!'}
            </p>
            <p className="text-sm text-[#888] font-label mb-1">{weekLabel}</p>
            <p className="text-2xl font-bold text-[#111] font-display mb-4">{medalToast.total} / {medalToast.max}</p>
            <button onClick={() => setMedalToast(null)} className="bg-[#111] text-white px-8 py-2.5 rounded-xl text-sm font-bold font-display">
              Continue →
            </button>
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto px-4">
        <div className="flex items-center gap-3 pt-8 pb-4">
          <button onClick={onBackToDashboard} className="text-[#888] hover:text-[#111] text-sm font-label transition-colors">← Dashboard</button>
        </div>

        <div className="bg-[#111] text-white rounded-2xl p-6 mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label">{weekLabel} · All Subjects</p>
              <div className="flex items-end gap-2 mt-1">
                <span className="text-5xl font-bold font-display">{total}</span>
                <span className="text-[#555] text-lg mb-1 font-label">/{maxTotal}</span>
              </div>
              <p className={`text-sm font-bold font-display mt-1 ${pct >= 70 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                {pct >= 70 ? 'Excellent work!' : pct >= 50 ? 'Good effort!' : 'Keep practising!'}
              </p>
            </div>
            <span className="text-5xl">{medal}</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1">
            <div className="bg-white h-1 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        </div>

        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-4">
          <p className="text-[11px] font-bold text-[#888] uppercase tracking-[0.15em] font-label mb-3">Subject Breakdown</p>
          <div className="divide-y divide-[#F3F3F2]">
            {allResults.map((r) => {
              const sp = r.score
              const isExp = expandedSubject === r.subject
              return (
                <div key={r.subject}>
                  <button onClick={() => setExpandedSubject(isExp ? null : r.subject)} className="flex items-center gap-2.5 w-full py-3 text-left">
                    <p className="flex-1 text-sm font-semibold text-[#111] font-body">{r.subject}</p>
                    <div className="w-14 bg-[#F3F3F2] rounded-full h-1.5 shrink-0">
                      <div className={`h-1.5 rounded-full ${sp >= 70 ? 'bg-green-500' : sp >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${sp}%` }} />
                    </div>
                    <span className="text-sm font-bold font-display text-[#111] w-14 text-right shrink-0">{r.score}/100</span>
                    <span className={`text-[10px] font-bold font-label w-8 text-right shrink-0 ${sp >= 70 ? 'text-green-600' : sp >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>{sp}%</span>
                    <span className="text-[#CCC] text-xs shrink-0 w-3">{isExp ? '▲' : '▼'}</span>
                  </button>
                  {isExp && <Corrections questions={r.questions} answers={r.answers} />}
                </div>
              )
            })}
          </div>
        </div>

        {autopsy.hasData && (
          <div className="bg-gradient-to-br from-[#111] to-[#222] text-white rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🔬</span>
              <p className="text-[10px] font-semibold text-[#999] uppercase tracking-[0.2em] font-label">Weak Topic Autopsy</p>
            </div>
            <p className="text-base font-bold font-display mb-1">Where you're bleeding points.</p>
            <p className="text-[11px] text-[#AAA] font-label mb-3">A one-tap diagnosis from the questions you just missed.</p>
            <button
              onClick={() => setAutopsyOpen(!autopsyOpen)}
              className="w-full bg-white text-[#111] rounded-xl py-2.5 text-sm font-bold font-display hover:bg-[#F3F3F2] transition-colors"
            >
              {autopsyOpen ? 'Hide Diagnosis ▲' : 'Run Autopsy — show me what to study tonight ▼'}
            </button>

            {autopsyOpen && autopsy.tonight && (
              <div className="mt-4 space-y-3">
                {autopsy.worstSubjects.length > 0 && (
                  <div className="space-y-2">
                    {autopsy.worstSubjects.slice(0, 3).map((s) => (
                      <div key={s.subject} className="bg-white/5 border border-white/10 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-bold font-display">{s.subject}</p>
                          <span className={`text-[10px] font-bold font-label px-2 py-0.5 rounded-full ${
                            s.avgPct >= 60 ? 'bg-yellow-500/20 text-yellow-300' :
                            'bg-red-500/20 text-red-300'
                          }`}>
                            {s.avgPct}% · ~{s.pointsLost} pts lost
                          </span>
                        </div>
                        {s.biggestBleeding && s.biggestBleeding.key !== '__unmatched__' && (
                          <p className="text-[11px] text-[#CCC] font-label">
                            Bleeding from: <span className="text-white font-semibold">{s.biggestBleeding.label}</span>
                            {s.biggestBleeding.count > 1 && <span className="text-[#999]"> · {s.biggestBleeding.count} question{s.biggestBleeding.count > 1 ? 's' : ''}</span>}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-white text-[#111] rounded-2xl p-4">
                  <p className="text-[10px] font-bold text-[#888] uppercase tracking-[0.15em] font-label mb-1">Tonight's One Action</p>
                  <p className="text-base font-bold font-display mb-3">{autopsy.tonight.oneAction}</p>
                  <div className="bg-[#F8F8F7] border border-[#EBEBEB] rounded-xl p-3 mb-2">
                    <p className="text-[10px] font-bold text-[#888] uppercase tracking-wide font-label mb-1">The Key Sentence</p>
                    <p className="text-xs text-[#111] font-body leading-relaxed">{autopsy.tonight.keySentence}</p>
                  </div>
                  <div className="bg-[#F8F8F7] border border-[#EBEBEB] rounded-xl p-3 mb-3">
                    <p className="text-[10px] font-bold text-[#888] uppercase tracking-wide font-label mb-1">Do This Now</p>
                    <p className="text-xs text-[#111] font-body leading-relaxed">{autopsy.tonight.practicePrompt}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-green-700 bg-green-100 border border-green-200 px-2 py-1 rounded-full font-label">
                      Expected: {autopsy.tonight.expectedPoints}
                    </span>
                    <button
                      onClick={() => {
                        const text = `🔬 Weak Topic Autopsy — ${weekLabel}\n\n${autopsy.tonight.oneAction}\n\nKey sentence: ${autopsy.tonight.keySentence}\n\nDo this now: ${autopsy.tonight.practicePrompt}\n\nExpected: ${autopsy.tonight.expectedPoints}\n\n— 274Lab`
                        if (navigator.clipboard?.writeText) {
                          navigator.clipboard.writeText(text).then(() => {
                            setAutopsyCopied(true)
                            setTimeout(() => setAutopsyCopied(false), 2000)
                          })
                        }
                      }}
                      className="text-[10px] font-bold text-[#555] hover:text-[#111] font-label transition-colors"
                    >
                      {autopsyCopied ? '✓ Copied' : 'Copy to notes'}
                    </button>
                  </div>
                </div>

                {autopsy.parentLine && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide font-label mb-1">Read this to yourself</p>
                    <p className="text-xs text-[#DDD] font-body leading-relaxed">{autopsy.parentLine}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        

        {Object.keys(nextWeekTopics).some((k) => normalizeTopic(nextWeekTopics[k])?.name) && (
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-4">
            <p className="text-[11px] font-bold text-[#888] uppercase tracking-[0.15em] font-label mb-3">Next Week — Topics to Revise</p>
            <div className="space-y-2">
              {Object.entries(nextWeekTopics).map(([subj, raw]) => {
                const t = normalizeTopic(raw)
                if (!t?.name) return null
                return (
                  <div key={subj} className="flex justify-between items-center py-1 gap-2">
                    <p className="text-xs text-[#555] font-body shrink-0">{subj}</p>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-xs text-[#111] font-semibold bg-[#F3F3F2] px-2.5 py-1 rounded-lg font-label truncate">{t.name}</p>
                      {safeUrl(t.video) && <a href={safeUrl(t.video)} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg font-label shrink-0">▶</a>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <button onClick={onViewResults} className="w-full bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm font-semibold text-[#555] hover:border-[#CCC] font-label transition-colors">
          View All Results →
        </button>
      </div>
    </div>
  )
}
