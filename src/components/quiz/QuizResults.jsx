import { useState } from 'react'
import { normalizeTopic } from '../../store/useStore'
import Corrections from './Corrections'

const WaIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current shrink-0">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.556 4.116 1.524 5.845L0 24l6.289-1.506A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.8 9.8 0 01-4.988-1.364l-.358-.213-3.733.894.928-3.637-.232-.373A9.793 9.793 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z" />
  </svg>
)

export default function QuizResults({
  allResults,
  weekLabel,
  medalToast,
  setMedalToast,
  nextWeekTopics,
  parentPhone,
  teacherPhone,
  buildWAMsg,
  student,
  onBackToDashboard,
  onViewResults,
}) {
  const [expandedSubject, setExpandedSubject] = useState(null)
  const total = allResults.reduce((a, r) => a + r.score, 0)
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

        {(parentPhone || teacherPhone) && (
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-4">
            <p className="text-[11px] font-bold text-[#888] uppercase tracking-[0.15em] font-label mb-0.5">Send Report via WhatsApp</p>
            <p className="text-[10px] text-[#AAA] font-label mb-3">Includes scores, next week topics & encouragement</p>
            <div className="space-y-2">
              {parentPhone && (
                <a href={buildWAMsg(parentPhone, allResults)} target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 w-full bg-green-600 hover:bg-green-700 text-white rounded-xl px-4 py-3 transition-colors">
                  <WaIcon />
                  <div className="text-left">
                    <p className="text-sm font-bold font-display">Send to Parent</p>
                    <p className="text-[11px] text-green-200 font-label">{student.parentPhone}</p>
                  </div>
                </a>
              )}
              {teacherPhone && (
                <a href={buildWAMsg(teacherPhone, allResults)} target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 w-full bg-[#111] hover:bg-[#222] text-white rounded-xl px-4 py-3 transition-colors">
                  <WaIcon />
                  <div className="text-left">
                    <p className="text-sm font-bold font-display">Send to Teacher</p>
                    <p className="text-[11px] text-[#666] font-label">{student.teacherPhone}</p>
                  </div>
                </a>
              )}
            </div>
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
                      {t.video && <a href={t.video} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg font-label shrink-0">▶</a>}
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
