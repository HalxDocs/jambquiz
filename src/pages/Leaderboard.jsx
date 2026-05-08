import { useState, useEffect } from 'react'
import { listenScores, listenStudents, getConsistencyRank, SUBJECTS, WEEKS } from '../store/useStore'

const RANK_COLOR = {
  gray:   { badge: 'bg-[#F3F3F2] text-[#555] border-[#E5E5E5]' },
  yellow: { badge: 'bg-yellow-50 text-yellow-700 border-yellow-100' },
  blue:   { badge: 'bg-blue-50 text-blue-700 border-blue-100' },
  purple: { badge: 'bg-purple-50 text-purple-700 border-purple-100' },
  green:  { badge: 'bg-green-50 text-green-700 border-green-100' },
}

const MEDAL = ['🥇', '🥈', '🥉']

export default function Leaderboard({ student, setView }) {
  const [students, setStudents] = useState([])
  const [scores, setScores] = useState([])
  const [activeTab, setActiveTab] = useState('overall')
  const [friendSearch, setFriendSearch] = useState('')

  useEffect(() => {
    const unsubStudents = listenStudents((all) => setStudents(all))
    const unsubScores = listenScores((all) => setScores(all))
    return () => { unsubStudents(); unsubScores() }
  }, [])

  // Best score per subject per student → JAMB total (4-subject sum)
  const getTotal = (studentId) => {
    const mine = scores.filter((s) => s.studentId === studentId)
    const best = {}
    mine.forEach((sc) => {
      if (!best[sc.subject] || sc.score > best[sc.subject].score) best[sc.subject] = sc
    })
    const top = Object.values(best)
    if (top.length < 4) return null
    return top.slice(0, 4).reduce((a, sc) => a + sc.score, 0)
  }

  const getSubjectBest = (studentId, subject) => {
    const mine = scores.filter((s) => s.studentId === studentId && s.subject === subject)
    if (!mine.length) return null
    return mine.reduce((best, sc) => sc.score > best.score ? sc : best, mine[0])
  }

  // Overall leaderboard
  const overallBoard = students
    .map((s) => ({ ...s, total: getTotal(s.id), rank: getConsistencyRank(scores.filter((sc) => sc.studentId === s.id)) }))
    .filter((s) => s.total !== null)
    .sort((a, b) => b.total - a.total)

  // Per-subject leaderboards
  const subjectBoards = SUBJECTS.map((subject) => {
    const ranked = students
      .map((s) => {
        const best = getSubjectBest(s.id, subject)
        return best ? { name: s.name, id: s.id, score: best.score, outOf: best.outOf || 100 } : null
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
    return { subject, ranked }
  }).filter((sb) => sb.ranked.length > 0)

  // Per-rank leaderboard (top scorer within each rank)
  const byRank = {}
  students.forEach((s) => {
    const myScores = scores.filter((sc) => sc.studentId === s.id)
    const { rank, color } = getConsistencyRank(myScores)
    const total = getTotal(s.id)
    if (rank === 'GHOST') return
    if (!byRank[rank]) byRank[rank] = { rank, color, members: [] }
    byRank[rank].members.push({ name: s.name, id: s.id, total })
  })
  const rankGroups = Object.values(byRank).map((g) => ({
    ...g,
    members: g.members.sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 5),
  })).sort((a, b) => {
    const order = ['ELITE', 'SCHOLAR', 'CADET', 'LEARNER', 'ROOKIE']
    return order.indexOf(a.rank) - order.indexOf(b.rank)
  })

  const myRow = overallBoard.findIndex((s) => s.id === student.id)

  // Medal track helper
  const getStudentMedals = (studentId) => {
    const mine = scores.filter((s) => s.studentId === studentId)
    return WEEKS.map((week) => {
      const ws = mine.filter((s) => s.week === week)
      if (!ws.length) return null
      const bySubject = {}
      ws.forEach((s) => { if (!bySubject[s.subject] || s.score > bySubject[s.subject]) bySubject[s.subject] = s.score })
      const total = Object.values(bySubject).reduce((a, b) => a + b, 0)
      return total >= 280 ? '🥇' : total >= 200 ? '🥈' : '🥉'
    }).filter(Boolean)
  }

  const friendResults = friendSearch.trim().length >= 2
    ? students.filter((s) => s.name.toLowerCase().includes(friendSearch.trim().toLowerCase()))
    : []

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
            {overallBoard.length === 0 ? (
              <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
                <p className="text-[#CCC] text-sm font-label">No scores yet</p>
              </div>
            ) : (
              <div className="bg-white border border-[#EBEBEB] rounded-2xl overflow-hidden">
                {/* Top 3 podium */}
                {overallBoard.length >= 2 && (
                  <div className="bg-[#111] p-5 flex items-end justify-center gap-3 mb-0">
                    {/* 2nd */}
                    {overallBoard[1] && (
                      <div className="flex-1 text-center pb-2">
                        <p className="text-2xl mb-1">🥈</p>
                        <p className="text-[11px] font-bold text-white font-display truncate">{overallBoard[1].name.split(' ')[0]}</p>
                        <p className="text-[10px] text-[#666] font-label mt-0.5">{overallBoard[1].total}/400</p>
                      </div>
                    )}
                    {/* 1st */}
                    {overallBoard[0] && (
                      <div className="flex-1 text-center">
                        <p className="text-3xl mb-1">🥇</p>
                        <p className="text-[12px] font-bold text-white font-display truncate">{overallBoard[0].name.split(' ')[0]}</p>
                        <p className="text-[10px] text-[#888] font-label mt-0.5">{overallBoard[0].total}/400</p>
                      </div>
                    )}
                    {/* 3rd */}
                    {overallBoard[2] && (
                      <div className="flex-1 text-center pb-4">
                        <p className="text-xl mb-1">🥉</p>
                        <p className="text-[11px] font-bold text-white font-display truncate">{overallBoard[2].name.split(' ')[0]}</p>
                        <p className="text-[10px] text-[#666] font-label mt-0.5">{overallBoard[2].total}/400</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Full list */}
                <div className="divide-y divide-[#F3F3F2]">
                  {overallBoard.map((s, i) => {
                    const isMe = s.id === student.id
                    return (
                      <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-[#FAFAF9]' : ''}`}>
                        <span className={`w-6 text-center text-sm font-bold font-display shrink-0 ${i < 3 ? '' : 'text-[#CCC]'}`}>
                          {i < 3 ? MEDAL[i] : `${i + 1}`}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className={`text-sm font-bold font-body truncate ${isMe ? 'text-[#111]' : 'text-[#333]'}`}>
                              {s.name}{isMe && <span className="text-[10px] text-[#AAA] font-label ml-1">(you)</span>}
                            </p>
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border font-label ${RANK_COLOR[s.rank.color]?.badge || RANK_COLOR.gray.badge}`}>
                            ⚡ {s.rank.rank}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-[#111] font-display shrink-0">
                          {s.total}<span className="text-[10px] text-[#AAA] font-label">/400</span>
                        </p>
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
            {subjectBoards.length === 0 ? (
              <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
                <p className="text-[#CCC] text-sm font-label">No scores yet</p>
              </div>
            ) : subjectBoards.filter((sb) => student.subjects.includes(sb.subject) || true).map(({ subject, ranked }) => (
              <div key={subject} className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
                <p className="text-[11px] font-bold text-[#888] uppercase tracking-[0.15em] font-label mb-3">{subject}</p>
                <div className="space-y-2">
                  {ranked.map((s, i) => {
                    const pct = Math.round((s.score / s.outOf) * 100)
                    const isMe = s.id === student.id
                    return (
                      <div key={s.id} className={`flex items-center gap-2.5 py-1.5 ${i < ranked.length - 1 ? 'border-b border-[#F8F8F7]' : ''}`}>
                        <span className="w-5 text-center text-xs font-bold font-display shrink-0 text-[#CCC]">
                          {i < 3 ? MEDAL[i] : i + 1}
                        </span>
                        <p className={`flex-1 text-xs font-semibold font-body truncate ${isMe ? 'text-[#111] font-bold' : 'text-[#333]'}`}>
                          {s.name}{isMe && <span className="text-[10px] text-[#AAA] font-label ml-1">(you)</span>}
                        </p>
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
              placeholder="Search by name…"
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
                  const myScores = scores.filter((sc) => sc.studentId === s.id)
                  const { rank, color } = getConsistencyRank(myScores)
                  const medals = getStudentMedals(s.id)
                  const isMe = s.id === student.id
                  return (
                    <div key={s.id} className={`bg-white border rounded-2xl p-4 ${isMe ? 'border-[#111]' : 'border-[#EBEBEB]'}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-bold text-[#111] font-body">
                            {s.name}{isMe && <span className="text-[10px] text-[#AAA] font-label ml-1">(you)</span>}
                          </p>
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full font-label tracking-widest border mt-1 ${RANK_COLOR[color]?.badge || RANK_COLOR.gray.badge}`}>
                            ⚡ {rank}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#AAA] font-label">{medals.length} medal{medals.length !== 1 ? 's' : ''}</p>
                      </div>
                      {medals.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {medals.map((m, i) => (
                            <span key={i} className="text-base leading-none">{m}</span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-[#CCC] font-label">No medals yet</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {!friendSearch.trim() && (
              <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
                <p className="text-2xl mb-2">🔍</p>
                <p className="text-sm font-semibold text-[#111] font-display mb-1">Find a Friend</p>
                <p className="text-[11px] text-[#AAA] font-label">Search by name to see their rank and medals</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
