import { useState, useEffect } from 'react'
import { db, collection, doc, onSnapshot, getDoc, getDocs, query, where } from '../firebase'

const MEDAL = ['🥇', '🥈', '🥉']

export default function Leaderboard({ student, setView }) {
  const [activeTab, setActiveTab] = useState('overall')
  const [friendSearch, setFriendSearch] = useState('')
  const [friendResults, setFriendResults] = useState([])
  const [overallBoard, setOverallBoard] = useState([])
  const [myRank, setMyRank] = useState(null)

  const [subjectBoards, setSubjectBoards] = useState([])

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
      setFriendResults(students.map((s) => ({ ...s, friendRank: rankMap[s.id] || null })))
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
                  <div className="bg-[#111] p-5 flex items-end justify-center gap-3 mb-0">
                    {/* 2nd */}
                    {finalBoard[1] && (
                      <div className="flex-1 text-center pb-2">
                        <p className="text-2xl mb-1">🥈</p>
                        <p className="text-[11px] font-bold text-white font-display truncate">{finalBoard[1].name.split(' ')[0]}</p>
                        {finalBoard[1].nickname && <p className="text-[9px] text-[#666] font-label truncate">@{finalBoard[1].nickname}</p>}
                        <p className="text-[10px] text-[#666] font-label mt-0.5">{finalBoard[1].total}/400</p>
                      </div>
                    )}
                    {/* 1st */}
                    {finalBoard[0] && (
                      <div className="flex-1 text-center">
                        <p className="text-3xl mb-1">🥇</p>
                        <p className="text-[12px] font-bold text-white font-display truncate">{finalBoard[0].name.split(' ')[0]}</p>
                        {finalBoard[0].nickname && <p className="text-[9px] text-[#888] font-label truncate">@{finalBoard[0].nickname}</p>}
                        <p className="text-[10px] text-[#888] font-label mt-0.5">{finalBoard[0].total}/400</p>
                      </div>
                    )}
                    {/* 3rd */}
                    {finalBoard[2] && (
                      <div className="flex-1 text-center pb-4">
                        <p className="text-xl mb-1">🥉</p>
                        <p className="text-[11px] font-bold text-white font-display truncate">{finalBoard[2].name.split(' ')[0]}</p>
                        {finalBoard[2].nickname && <p className="text-[9px] text-[#666] font-label truncate">@{finalBoard[2].nickname}</p>}
                        <p className="text-[10px] text-[#666] font-label mt-0.5">{finalBoard[2].total}/400</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Full list */}
                <div className="divide-y divide-[#F3F3F2]">
                  {finalBoard.map((s, i) => {
                    const isMe = s.id === student.id
                    return (
                      <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-[#FAFAF9]' : ''}`}>
                        <span className={`w-6 text-center text-sm font-bold font-display shrink-0 ${i < 3 ? '' : 'text-[#CCC]'}`}>
                          {i < 3 ? MEDAL[i] : `${i + 1}`}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold font-body truncate ${isMe ? 'text-[#111]' : 'text-[#333]'}`}>
                            {s.name}{isMe && <span className="text-[10px] text-[#AAA] font-label ml-1">(you)</span>}
                          </p>
                          {s.nickname && <p className="text-[10px] text-[#999] font-label truncate">@{s.nickname}</p>}
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
                          {i < 3 ? MEDAL[i] : i + 1}
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
                  return (
                    <div key={s.id} className={`bg-white border rounded-2xl p-4 ${isMe ? 'border-[#111]' : 'border-[#EBEBEB]'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-[#111] font-body truncate">
                            {s.name}{isMe && <span className="text-[10px] text-[#AAA] font-label ml-1">(you)</span>}
                          </p>
                          {s.nickname && (
                            <p className="text-[11px] text-[#888] font-label mt-0.5">@{s.nickname}</p>
                          )}
                          {s.subjects?.length > 0 && (
                            <p className="text-[10px] text-[#999] font-label mt-0.5">
                              Subjects: {s.subjects.join(', ')}
                            </p>
                          )}
                        </div>
                        {fr && (
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold font-display text-[#111]">#{fr.rank}</p>
                            <p className="text-[10px] text-[#AAA] font-label">Rank</p>
                            <p className="text-xs font-bold font-display text-[#111] mt-0.5">{fr.total || 0}<span className="text-[9px] text-[#AAA] font-label">/400</span></p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {!friendSearch.trim() && (
              <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
                <p className="text-2xl mb-2">🔍</p>
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
