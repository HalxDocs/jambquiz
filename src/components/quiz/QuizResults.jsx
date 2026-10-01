import { useState } from 'react'
import { normalizeTopic, shareResult } from '../../store/useStore'
import { useToastStore } from '../../store/toast'
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
  const [sharing, setSharing] = useState(false)
  const [shared, setShared] = useState(false)
  const total = (allResults || []).reduce((a, r) => a + r.score, 0)

  // GOAT assist attribution (server-computed per correct assisted answer)
  const assistLines = (() => {
    const byGoat = {}
    ;(allResults || []).forEach((r) => {
      ;(r.assists || []).forEach((a) => {
        if (!a.goatName) return
        if (!byGoat[a.goatName]) byGoat[a.goatName] = { points: 0, count: 0 }
        byGoat[a.goatName].points += a.points || 0
        if ((a.points || 0) > 0) byGoat[a.goatName].count += 1
      })
    })
    return Object.entries(byGoat).map(([name, v]) => ({ name, points: v.points, count: v.count }))
  })()

  const handleShare = async () => {
    const studentId = allResults?.[0]?.studentId
    const week = allResults?.[0]?.week || weekLabel
    const text = `I scored ${total}/${maxTotal} on 274Lab ${week}!${assistLines.length ? ' ' + assistLines.map((l) => `🐐 ${l.name} assisted me (+${l.points}pts)`).join(' · ') : ''} — Think you can beat me? https://www.274lab.com/`
    const award = async () => {
      if (shared) return
      setShared(true)
      if (!studentId) return
      try {
        const res = await shareResult(studentId, week)
        if (res?.ok && !res?.alreadyShared) {
          useToastStore.getState().showToast('+5 coins for sharing!', 'success')
        }
      } catch {}
    }
    setSharing(true)
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: 'My 274Lab score', text })
          await award()
        } catch {
          // user dismissed the sheet — no coins
        }
      } else {
        // No Web Share API (in-app browsers): WhatsApp deep link + clipboard, then award once
        try { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank') } catch {}
        try {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
        } catch {}
        await award()
      }
    } finally {
      setSharing(false)
    }
  }
  const autopsy = runAutopsy({ currentResults: allResults, historyResults: [] })
  const maxTotal = (allResults || []).length * 100
  const medal = total >= 280 ? '🥇' : total >= 200 ? '🥈' : '🥉'
  const medalLabel = medal === '🥇' ? 'GOLD MEDAL' : medal === '🥈' ? 'SILVER MEDAL' : 'BRONZE MEDAL'
  const pct = Math.round((total / maxTotal) * 100)

  // Branded share image: score card + assisting GOATs, drawn on canvas so it
  // can be shared straight to WhatsApp/status as a PNG. Also awards +5 coins
  // (once per week) just like the text share.
  const handleShareImage = async () => {
    const award = async () => {
      if (shared) return
      setShared(true)
      const studentId = allResults?.[0]?.studentId
      const week = allResults?.[0]?.week || weekLabel
      if (!studentId || !week) return
      try {
        const res = await shareResult(studentId, week)
        if (res?.ok && !res?.alreadyShared) {
          useToastStore.getState().showToast('+5 coins for sharing!', 'success')
        } else if (res?.alreadyShared) {
          useToastStore.getState().showToast('Already shared this week', 'info')
        }
      } catch {}
    }
    try {
      const subjects = (allResults || []).slice(0, 6)
      const goats = assistLines.slice(0, 4)
      const W = 1080
      const H = 640 + subjects.length * 96 + (goats.length ? 130 + goats.length * 78 : 0) + 170
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const x = c.getContext('2d')
      const rr = (px, py, w, h, r) => {
        x.beginPath()
        if (x.roundRect) x.roundRect(px, py, w, h, r)
        else x.rect(px, py, w, h)
      }
      // Background
      x.fillStyle = '#111111'
      x.fillRect(0, 0, W, H)
      // Gold top strip
      x.fillStyle = '#F5C518'
      x.fillRect(0, 0, W, 14)
      let y = 110
      x.textAlign = 'center'
      // Brand
      x.fillStyle = '#F5C518'
      x.font = 'bold 44px Arial'
      x.fillText('274Lab', W / 2, y)
      y += 56
      x.fillStyle = '#999999'
      x.font = '28px Arial'
      x.fillText(String(weekLabel || '').toUpperCase() + '  •  WEEKLY RESULT', W / 2, y)
      y += 120
      // Medal + label
      x.font = '150px serif'
      x.fillText(medal, W / 2, y)
      y += 80
      x.fillStyle = '#FFFFFF'
      x.font = 'bold 52px Arial'
      x.fillText(medalLabel, W / 2, y)
      y += 130
      // Total score
      x.fillStyle = '#FFFFFF'
      x.font = 'bold 170px Arial'
      x.fillText(String(total), W / 2, y)
      y += 70
      x.fillStyle = '#888888'
      x.font = '44px Arial'
      x.fillText('/ ' + String(maxTotal) + '  •  ' + String(pct) + '%', W / 2, y)
      y += 90
      // Subject rows
      x.textAlign = 'left'
      subjects.forEach((r) => {
        rr(90, y, W - 180, 76, 20)
        x.fillStyle = 'rgba(255,255,255,0.07)'
        x.fill()
        x.fillStyle = '#DDDDDD'
        x.font = 'bold 34px Arial'
        x.fillText(String(r.subject || '').slice(0, 26), 130, y + 50, 620)
        x.fillStyle = '#F5C518'
        x.font = 'bold 36px Arial'
        x.textAlign = 'right'
        x.fillText(String(r.score) + '/100', W - 130, y + 50)
        x.textAlign = 'left'
        y += 96
      })
      y += 30
      // Assisting GOATs — visible brag on the shared image
      if (goats.length) {
        x.textAlign = 'center'
        x.fillStyle = '#F5C518'
        x.font = 'bold 34px Arial'
        x.fillText('🐐  ASSISTED BY THE GOATs', W / 2, y)
        y += 78
        goats.forEach((g) => {
          rr(90, y - 52, W - 180, 68, 34)
          x.fillStyle = 'rgba(245,197,24,0.12)'
          x.fill()
          x.fillStyle = '#FFFFFF'
          x.font = 'bold 33px Arial'
          x.fillText('🐐 ' + String(g.name).slice(0, 24) + '  •  +' + String(g.points) + 'pts', W / 2, y, W - 260)
          y += 78
        })
        y += 40
      }
      // Footer
      x.textAlign = 'center'
      x.fillStyle = '#777777'
      x.font = '30px Arial'
      x.fillText('Think you can beat me?  •  274lab.com', W / 2, H - 70)
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
      if (!blob) throw new Error('canvas failed')
      const safeWeek = String(weekLabel || 'result').replace(/\s+/g, '').toLowerCase()
      const file = new File([blob], '274lab-' + safeWeek + '.png', { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'My 274Lab score' })
          await award()
        } catch {
          // dismissed — no coins
        }
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        useToastStore.getState().showToast('Image downloaded — share it on WhatsApp!', 'success')
        await award()
      }
    } catch {
      useToastStore.getState().showToast('Could not make image — use text share instead', 'info')
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F8F7] pb-10">
      {medalToast && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setMedalToast(null)}>
          <div className="bg-white rounded-3xl p-6 text-center max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-7xl mb-2">{medalToast.medal}</p>
            <p className="text-xl font-bold text-[#111] font-display mb-1">
              {medalToast.medal === '🥇' ? 'Gold Medal!' : medalToast.medal === '🥈' ? 'Silver Medal!' : 'Bronze Medal!'}
            </p>
            <p className="text-sm text-[#888] font-label">{weekLabel}</p>
            <p className="text-2xl font-bold text-[#111] font-display mt-1">{medalToast.total} / {medalToast.max}</p>
            {assistLines.length > 0 && (
              <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-3 py-1.5 mt-3 font-label inline-block">
                {assistLines.map((l) => `🐐 ${l.name} +${l.points}pts`).join(' · ')}
              </p>
            )}
            <div className="mt-4 space-y-2">
              <button onClick={handleShareImage} disabled={sharing}
                className="w-full bg-[#111] text-white rounded-xl py-3.5 text-sm font-bold font-display hover:bg-[#222] active:scale-[0.99] transition-all disabled:opacity-50">
                {sharing ? 'Sharing…' : shared ? 'Shared ✓ +5 coins' : `📸 Share as image → +5 coins${assistLines.length ? ' · show your GOATs 🐐' : ''}`}
              </button>
              <button onClick={handleShare} disabled={sharing}
                className="w-full bg-[#25D366] text-white rounded-xl py-3.5 text-sm font-bold font-display hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-50">
                {sharing ? 'Sharing…' : shared ? 'Shared ✓ +5 coins' : '💬 Share on WhatsApp → +5 coins'}
              </button>
              <button onClick={() => setMedalToast(null)} className="w-full text-xs text-[#AAA] hover:text-[#666] font-label py-2 transition-colors">
                Continue →
              </button>
            </div>
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
            {(allResults || []).map((r) => {
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
                  {isExp && (r.released === false || !r.questions
                    ? <p className="text-xs text-[#AAA] font-label py-2">Corrections will unlock once the quiz window closes.</p>
                    : <Corrections questions={r.questions} answers={r.answers} />)}
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

        {(assistLines.length > 0) && (
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 mb-4">
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest font-label mb-2">🐐 GOAT assists</p>
            <div className="space-y-1">
              {assistLines.map((l) => (
                <p key={l.name} className="text-xs text-[#555] font-body">
                  <span className="font-bold text-[#111]">🐐 {l.name}</span> assisted you <span className="font-bold text-[#111]">+{l.points}pts</span>
                </p>
              ))}
            </div>
            <button onClick={handleShare} disabled={sharing}
              className="w-full mt-3 bg-[#25D366] text-white rounded-xl py-3 text-sm font-bold font-display hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-50">
              {sharing ? 'Sharing…' : shared ? 'Shared ✓ +5 coins' : 'SHARE → get 5 coins'}
            </button>
          </div>
        )}
        {assistLines.length === 0 && (
          <button onClick={handleShare} disabled={sharing}
            className="w-full mb-4 bg-[#25D366] text-white rounded-xl py-3 text-sm font-bold font-display hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-50">
            {sharing ? 'Sharing…' : shared ? 'Shared ✓ +5 coins' : 'SHARE my score → get 5 coins'}
          </button>
        )}

        <button onClick={onViewResults} className="w-full bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm font-semibold text-[#555] hover:border-[#CCC] font-label transition-colors">
          View All Results →
        </button>
      </div>
    </div>
  )
}
