import { useState, useEffect } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { MedalFirstPlaceIcon, MedalSecondPlaceIcon, MedalThirdPlaceIcon, CrownIcon, Award01Icon, BookOpen01Icon, StarIcon, StarCircleIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { db, collection, doc, onSnapshot, getDoc, getDocs, query, where } from '../firebase'
import { getStudentScores } from '../store/scores'
import { logEvent } from '../store/useStore'


const MEDAL_ICONS = [MedalFirstPlaceIcon, MedalSecondPlaceIcon, MedalThirdPlaceIcon]

const TITLES = [
  { min: 350, label: 'JAMB Champion', icon: CrownIcon, emoji: Award01Icon, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  { min: 300, label: 'Honor Roll', icon: Award01Icon, emoji: BookOpen01Icon, color: 'text-blue-600', bg: 'bg-blue-100' },
  { min: 200, label: 'Scholar', icon: BookOpen01Icon, emoji: StarIcon, color: 'text-purple-600', bg: 'bg-purple-100' },
  { min: 100, label: 'Quiz Apprentice', icon: StarCircleIcon, emoji: StarCircleIcon, color: 'text-green-600', bg: 'bg-green-100' },
  { min: 0, label: 'Rising Star', icon: StarCircleIcon, emoji: StarIcon, color: 'text-amber-600', bg: 'bg-amber-100' },
]

function getTitle(total) {
  return TITLES.find((t) => total >= t.min) || TITLES[TITLES.length - 1]
}

function scoreBar(total) {
  const pct = Math.min(100, (total / 400) * 100)
  const color = total >= 300 ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' : total >= 200 ? 'bg-gradient-to-r from-blue-400 to-blue-500' : total >= 100 ? 'bg-gradient-to-r from-purple-400 to-purple-500' : 'bg-gradient-to-r from-gray-300 to-gray-400'
  return { pct, color }
}

function getScoreEmoji(pct) {
  if (pct >= 90) return '🔥'
  if (pct >= 75) return '💪'
  if (pct >= 50) return '📈'
  if (pct >= 25) return '🌱'
  return '💤'
}

function getConsistencyFromCount(count) {
  if (count >= 21) return { label: 'ELITE', color: 'text-green-600' }
  if (count >= 16) return { label: 'SCHOLAR', color: 'text-purple-600' }
  if (count >= 11) return { label: 'CADET', color: 'text-blue-600' }
  if (count >= 6) return { label: 'LEARNER', color: 'text-yellow-600' }
  if (count >= 1) return { label: 'ROOKIE', color: 'text-gray-500' }
  return { label: 'GHOST', color: 'text-gray-400' }
}

function getRankEmoji(diff) {
  if (diff <= 0) return ''
  if (diff === 1) return '🔥 1 rank behind — so close!'
  if (diff <= 3) return `🔥 ${diff} ranks behind — gaining fast!`
  if (diff <= 10) return `📈 ${diff} ranks behind — keep pushing!`
  return `🚀 ${diff} ranks behind — grind time!`
}

export default function Leaderboard({ student, setView }) {
  const [activeTab, setActiveTab] = useState('overall')
  const [friendSearch, setFriendSearch] = useState('')
  const [friendResults, setFriendResults] = useState([])
  const [overallBoard, setOverallBoard] = useState([])
  const [myRank, setMyRank] = useState(null)

  const [subjectBoards, setSubjectBoards] = useState([])

  useEffect(() => { logEvent(student.id, 'page_view', { page: 'leaderboard' }) }, [])

  useEffect(() => {
    let unsubLeaderboard

    // Load aggregated leaderboard overview
    const overallRef = doc(db, 'leaderboard', 'overall')
    getDoc(overallRef).then((snap) => {
      if (snap.exists() && snap.data().top?.length) {
        setOverallBoard(snap.data().top.map((s) => ({ ...s, id: s.id })))
      }
    })

    // Listen for leaderboard updates (overall + per-subject)
    unsubLeaderboard = onSnapshot(
      collection(db, 'leaderboard'),
      (snap) => {
        const boards = []
        snap.docs.forEach((d) => {
          if (d.id === 'overall' && d.data().top?.length) {
            setOverallBoard(d.data().top.map((s) => ({ ...s, id: s.id })))
          } else if (d.id.startsWith('subject_')) {
            const subject = d.id.replace(/^subject_/, '').replace(/_/g, ' ')
            boards.push({ subject, ranked: d.data().top || [] })
          }
        })
        if (boards.length) setSubjectBoards(boards)
      }
    )

    // Load user's own rank
    getDoc(doc(db, 'leaderboard_student_ranks', student.id)).then((snap) => {
      if (snap.exists()) setMyRank(snap.data())
    })

    return () => { unsubLeaderboard?.() }
  }, [student])

  // Use aggregated board if available
  const finalBoard = overallBoard

  const activeSubjectBoards = subjectBoards

  const myRow = finalBoard.findIndex((s) => s.id === student.id)

  useEffect(() => {
    const q = friendSearch.trim()
    if (q.length < 2) { setFriendResults([]); return }
    let cancelled = false
    const searchTerm = q.toLowerCase().trim()
    const nameQuery = query(
      collection(db, 'students'),
      where('nameLower', '>=', searchTerm),
      where('nameLower', '<', searchTerm + '~')
    )
    const nickQuery = query(
      collection(db, 'students'),
      where('nicknameLower', '>=', searchTerm),
      where('nicknameLower', '<', searchTerm + '~')
    )
    Promise.all([getDocs(nameQuery), getDocs(nickQuery)]).then(async ([nameSnap, nickSnap]) => {
      if (cancelled) return
      const map = new Map()
      nameSnap.docs.forEach((d) => { if (!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() }) })
      nickSnap.docs.forEach((d) => { if (!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() }) })
      const students = Array.from(map.values()).slice(0, 20)
      const rankPromises = students.map((s) =>
        getDoc(doc(db, 'leaderboard_student_ranks', s.id)).then((snap) =>
          snap.exists() ? { studentId: s.id, ...snap.data() } : null
        ).catch(() => null)
      )
      const ranks = await Promise.all(rankPromises)
      const rankMap = {}
      ranks.forEach((r) => { if (r) rankMap[r.studentId] = r })
      const results = students.map((s) => {
        const fr = rankMap[s.id] || null
        let cr = null
        if (fr?.sessionCount != null) {
          cr = getConsistencyFromCount(fr.sessionCount)
        }
        return { ...s, friendRank: fr, consistencyRank: cr }
      })
      // Fallback: fetch scores for students without rank docs
      const noRank = results.filter((s) => !s.friendRank)
      if (noRank.length > 0) {
        const scoreData = await Promise.all(
          noRank.map((s) =>
            getStudentScores(s.id).then((scores) => ({ id: s.id, scores })).catch(() => ({ id: s.id, scores: [] }))
          )
        )
        scoreData.forEach(({ id, scores }) => {
          if (!scores.length) return
          const best = {}
          const uniqueWeeks = new Set()
          scores.forEach((sc) => {
            if (!best[sc.subject] || sc.score > best[sc.subject].score) best[sc.subject] = sc
            uniqueWeeks.add(sc.week)
          })
          const top = Object.values(best)
          const total = top.reduce((a, sc) => a + sc.score, 0)
          const uniqueSessions = new Set()
          scores.forEach((sc) => uniqueSessions.add(`${sc.week}::${sc.subject}`))
          const sessionCount = uniqueSessions.size
          const cr = getConsistencyFromCount(sessionCount)
          const idx = results.findIndex((r) => r.id === id)
          if (idx !== -1) {
            results[idx].friendRank = { total, rank: null, sessionCount, goldMedals: uniqueWeeks.size }
            results[idx].consistencyRank = cr
          }
        })
      }
      setFriendResults([...results])
    })
    return () => { cancelled = true }
  }, [friendSearch])

  const TABS = [
    { key: 'overall', label: 'Overall' },
    { key: 'subject', label: 'By Subject' },
    { key: 'friends', label: 'Find Friends' },
  ]

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <div className="max-w-md mx-auto px-4 pb-10">

        {/* Header */}
        <div className="flex items-center gap-3 pt-8 pb-5">
          <button
            onClick={() => setView('dashboard')}
            className="text-[#888] hover:text-[#111] text-sm font-label transition-colors"
          >
            ← Back
          </button>
          <h2 className="text-xl font-bold text-[#111] font-display">Leaderboard</h2>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-[#EBEBEB] rounded-xl mb-5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all font-label ${
                activeTab === t.key
                  ? 'bg-white text-[#111] shadow-sm'
                  : 'text-[#999] hover:text-[#555]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── OVERALL ── */}
        {activeTab === 'overall' && (
          <div>
            {finalBoard.length === 0 ? (
              <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
                <p className="text-[#CCC] text-sm font-label">No scores yet</p>
              </div>
            ) : (
              <div className="bg-white border border-[#EBEBEB] rounded-2xl overflow-hidden">
                {/* Top 3 podium */}
                {finalBoard.length >= 2 && (
                  <div className="bg-gradient-to-b from-[#1a1a1a] to-[#111] p-5 flex items-end justify-center gap-3 mb-0">
                    {/* 2nd */}
                    {finalBoard[1] && (
                      <div className="flex-1 text-center pb-2">
                        <div className="mb-1 flex justify-center"><HugeiconsIcon icon={MedalSecondPlaceIcon} size={28} color="#A8A8A8" /></div>
                        <p className="text-[11px] font-bold text-white font-display truncate">{finalBoard[1].name.split(' ')[0]}</p>
                        {finalBoard[1].nickname && <p className="text-[9px] text-[#666] font-label truncate">@{finalBoard[1].nickname}</p>}
                        <p className="text-[10px] text-[#555] font-label mt-1 inline-flex items-center gap-0.5 justify-center"><HugeiconsIcon icon={getTitle(finalBoard[1].total || 0).icon} size={11} color="#666" /> {getTitle(finalBoard[1].total || 0).label}</p>
                        <p className="text-[11px] font-bold text-[#CCC] font-display mt-1">{finalBoard[1].total}<span className="text-[9px] text-[#555] font-label">/400</span></p>
                      </div>
                    )}
                    {/* 1st */}
                    {finalBoard[0] && (
                      <div className="flex-1 text-center">
                        <div className="mb-1 flex justify-center"><HugeiconsIcon icon={MedalFirstPlaceIcon} size={36} color="#FFD700" /></div>
                        <p className="text-[13px] font-bold text-white font-display truncate">{finalBoard[0].name.split(' ')[0]}</p>
                        {finalBoard[0].nickname && <p className="text-[9px] text-[#888] font-label truncate">@{finalBoard[0].nickname}</p>}
                        <p className="text-[10px] text-[#777] font-label mt-1 inline-flex items-center gap-0.5 justify-center"><HugeiconsIcon icon={getTitle(finalBoard[0].total || 0).icon} size={11} color="#888" /> {getTitle(finalBoard[0].total || 0).label}</p>
                        <p className="text-[12px] font-bold text-yellow-400 font-display mt-1">{finalBoard[0].total}<span className="text-[9px] text-[#666] font-label">/400</span></p>
                      </div>
                    )}
                    {/* 3rd */}
                    {finalBoard[2] && (
                      <div className="flex-1 text-center pb-4">
                        <div className="mb-1 flex justify-center"><HugeiconsIcon icon={MedalThirdPlaceIcon} size={24} color="#CD7F32" /></div>
                        <p className="text-[11px] font-bold text-white font-display truncate">{finalBoard[2].name.split(' ')[0]}</p>
                        {finalBoard[2].nickname && <p className="text-[9px] text-[#666] font-label truncate">@{finalBoard[2].nickname}</p>}
                        <p className="text-[10px] text-[#555] font-label mt-1 inline-flex items-center gap-0.5 justify-center"><HugeiconsIcon icon={getTitle(finalBoard[2].total || 0).icon} size={11} color="#666" /> {getTitle(finalBoard[2].total || 0).label}</p>
                        <p className="text-[11px] font-bold text-[#CCC] font-display mt-1">{finalBoard[2].total}<span className="text-[9px] text-[#555] font-label">/400</span></p>
                      </div>
                    )}
                  </div>
                )}

                {/* Full list */}
                <div className="divide-y divide-[#F3F3F2]">
                  {finalBoard.map((s, i) => {
                    const isMe = s.id === student.id
                    const title = getTitle(s.total || 0)
                    const bar = scoreBar(s.total || 0)
                    const pct = Math.min(100, ((s.total || 0) / 400) * 100)
                    const cr = s.sessionCount != null ? getConsistencyFromCount(s.sessionCount) : null
                    return (
                      <div key={s.id} className={`px-4 py-3 ${isMe ? 'bg-[#FFF8E7]' : ''}`}>
                        <div className="flex items-center gap-3">
                          <span className={`w-10 h-10 flex items-center justify-center rounded-xl text-lg font-bold font-display shrink-0 ${i < 3 ? 'bg-gradient-to-br from-yellow-400 to-amber-600 text-white shadow-md shadow-yellow-200' : 'bg-[#F3F3F2] text-[#888]'}`}>
                            {i < 3 ? <HugeiconsIcon icon={MEDAL_ICONS[i]} size={20} color="currentColor" /> : `#${i + 1}`}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className={`text-sm font-bold font-body truncate ${isMe ? 'text-[#111]' : 'text-[#333]'}`}>
                                {s.name}
                              </p>
                              {isMe && <span className="text-[10px] text-[#F59E0B] font-bold font-label bg-amber-100 px-1.5 py-0.5 rounded-full">YOU</span>}
                              <span className="text-xs shrink-0">{getScoreEmoji(pct)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {s.nickname && <span className="text-[10px] text-[#999] font-label">@{s.nickname}</span>}
                              {cr && <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold font-label ${cr.color}`}><HugeiconsIcon icon={StarCircleIcon} size={10} color="currentColor" />{cr.label}</span>}
                              {s.year && <span className="text-[9px] font-bold text-white bg-[#555] px-1.5 py-0.5 rounded font-label">{s.year}</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold font-display text-[#111]">{s.total || 0}</p>
                            <p className="text-[9px] text-[#AAA] font-label">/400</p>
                          </div>
                        </div>
                        <div className="mt-2 w-full bg-[#F3F3F2] rounded-full h-2 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${bar.color}`} style={{ width: `${bar.pct}%` }} />
                        </div>
                        <div className="mt-1.5 flex items-center gap-1">
                          {s.goldMedals > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-xs tracking-[0.08em]">
                              {Array.from({ length: Math.min(s.goldMedals, 7) }, (_, idx) => (
                                <HugeiconsIcon key={idx} icon={MedalFirstPlaceIcon} size={12} color="#F59E0B" />
                              ))}
                              {s.goldMedals > 7 && <span className="text-[9px] font-bold font-label text-[#999]">+{s.goldMedals - 7}</span>}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {myRow === -1 && (
                  <div className="border-t border-[#F3F3F2] px-4 py-3 bg-[#FAFAF9]">
                    <p className="text-xs text-[#AAA] font-label text-center">
                      You haven't qualified yet — complete all 4 subjects to appear here
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── BY SUBJECT ── */}
        {activeTab === 'subject' && (
          <div className="space-y-4">
            {activeSubjectBoards.length === 0 ? (
              <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
                <p className="text-[#CCC] text-sm font-label">No scores yet</p>
              </div>
            ) : activeSubjectBoards.filter((sb) => student.subjects.includes(sb.subject) || true).map(({ subject, ranked }) => (
              <div key={subject} className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
                <p className="text-[11px] font-bold text-[#888] uppercase tracking-[0.15em] font-label mb-3">{subject}</p>
                <div className="space-y-2">
                  {ranked.map((s, i) => {
                    const pct = Math.round((s.score / s.outOf) * 100)
                    const isMe = s.id === student.id
                    return (
                      <div key={s.id} className={`flex items-center gap-2.5 py-1.5 ${i < ranked.length - 1 ? 'border-b border-[#F8F8F7]' : ''}`}>
                        <span className="w-5 text-center text-xs font-bold font-display shrink-0 text-[#CCC]">
                          {i < 3 ? <HugeiconsIcon icon={MEDAL_ICONS[i]} size={14} color="#999" /> : i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold font-body truncate ${isMe ? 'text-[#111] font-bold' : 'text-[#333]'}`}>
                            {s.name}{isMe && <span className="text-[10px] text-[#AAA] font-label ml-1">(you)</span>}
                          </p>
                          {s.nickname && <p className="text-[9px] text-[#999] font-label truncate">@{s.nickname}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-bold font-display text-[#111]">{s.score}</span>
                          <span className="text-[10px] text-[#AAA] font-label">/{s.outOf}</span>
                          <span className={`ml-1.5 text-[10px] font-bold font-label ${pct >= 70 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                            {pct}%
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── FIND FRIENDS ── */}
        {activeTab === 'friends' && (
          <div>
            <input
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              placeholder="Search by name or nickname…"
              className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] bg-white mb-4"
              autoFocus
            />
            {friendSearch.trim().length > 0 && friendSearch.trim().length < 2 && (
              <p className="text-xs text-[#AAA] font-label text-center py-4">Type at least 2 characters to search</p>
            )}
            {friendSearch.trim().length >= 2 && friendResults.length === 0 && (
              <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
                <p className="text-[#CCC] text-sm font-label">No student found</p>
              </div>
            )}
            {friendResults.length > 0 && (
              <div className="space-y-3">
                {friendResults.map((s) => {
                  const isMe = s.id === student.id
                  const fr = s.friendRank
                  const rank = fr?.rank || 0
                  const total = fr?.total || 0
                  const medalCount = fr?.goldMedals || 0
                  return (
                    <div key={s.id} className={`bg-white border ${isMe ? 'border-[#F59E0B]' : 'border-[#EBEBEB]'} rounded-2xl overflow-hidden`}>
                      <div className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          {rank > 0 ? (
                            <span className={`w-9 h-9 flex items-center justify-center rounded-xl text-base font-bold font-display shrink-0 ${rank <= 3 ? 'bg-gradient-to-br from-yellow-400 to-amber-600 text-white shadow-sm shadow-yellow-200' : 'bg-[#F3F3F2] text-[#888]'}`}>
                              {rank <= 3 ? <HugeiconsIcon icon={MEDAL_ICONS[rank - 1]} size={20} color="currentColor" /> : `#${rank}`}
                            </span>
                          ) : (
                            <span className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#F8F8F7] text-[#CCC] text-[11px] font-label shrink-0">NR</span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-bold text-[#111] font-display truncate">{s.name}</p>
                              {isMe && <span className="text-[10px] text-[#F59E0B] font-bold font-label bg-amber-100 px-1.5 py-0.5 rounded-full shrink-0">YOU</span>}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {s.nickname ? <span className="text-[10px] text-[#999] font-label">@{s.nickname}</span> : null}
                              {s.consistencyRank && (
                                <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold font-label ${s.consistencyRank.color}`}><HugeiconsIcon icon={StarCircleIcon} size={10} color="currentColor" />{s.consistencyRank.label}</span>
                              )}
                              {s.year && <span className="text-[9px] text-[#AAA] font-label">{s.year}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                      {fr ? (
                        <div className="px-3.5 pb-3.5">
                          <div className="bg-[#F8F8F7] rounded-xl px-3 py-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-baseline gap-1">
                                <span className="text-base font-bold font-display text-[#111]">{total}</span>
                                <span className="text-[10px] text-[#AAA] font-label">/400</span>
                                <span className="ml-2 text-[9px] text-[#BBB] font-label">Score</span>
                              </div>
                              {medalCount > 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="inline-flex items-center gap-0.5 text-xs tracking-[0.06em]">
                                    {Array.from({ length: Math.min(medalCount, 7) }, (_, idx) => (
                                      <HugeiconsIcon key={idx} icon={MedalFirstPlaceIcon} size={12} color="#F59E0B" />
                                    ))}
                                    {medalCount > 7 && <span className="text-[9px] font-bold font-label text-[#999]">+{medalCount - 7}</span>}
                                  </span>
                                  <span className="text-[9px] text-[#BBB] font-label">{medalCount} {medalCount === 1 ? 'medal' : 'medals'}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="px-3.5 pb-3.5">
                          <div className="bg-[#F8F8F7] rounded-xl px-3 py-2 text-center">
                            <p className="text-[11px] text-[#AAA] font-label">No scores yet — {s.name.split(' ')[0]} hasn't started</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {!friendSearch.trim() && (
              <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
                <div className="mb-2 flex justify-center"><HugeiconsIcon icon={Search01Icon} size={32} color="#CCC" /></div>
                <p className="text-sm font-semibold text-[#111] font-display mb-1">Find a Friend</p>
                <p className="text-[11px] text-[#AAA] font-label">Search by name or nickname to see their rank and medals</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
