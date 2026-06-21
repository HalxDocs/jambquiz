import { useState, useEffect } from 'react'
import { SUBJECTS, WEEKS, setTopics, getTopics, normalizeTopic } from '../../store/useStore'
import { useToastStore } from '../../store/toast'
import { safeUrl } from '../../lib/safeUrl'

export default function TopicEditor({
  activeWeek,
  onSetActiveWeek,
  topicWeek,
  onTopicWeekChange,
  topicInputs,
  onSetTopicInputs,
  topics,
  onSetTopics,
}) {
  const [topicSuccess, setTopicSuccess] = useState('')
  const [openKeyPoints, setOpenKeyPoints] = useState(new Set())
  const [success, setSuccess] = useState('')

  useEffect(() => {
    getTopics(topicWeek).then((raw) => {
      const normalized = {}
      Object.entries(raw || {}).forEach(([sub, val]) => {
        const t = normalizeTopic(val)
        if (t) normalized[sub] = t
      })
      onSetTopics(normalized)
      onSetTopicInputs(normalized)
    })
  }, [topicWeek])

  const handleSaveTopics = async () => {
    try {
      await setTopics(topicWeek, topicInputs)
      onSetTopics(topicInputs)
      useToastStore.getState().showToast(`Topics saved for ${topicWeek}`, 'success')
    } catch (e) { useToastStore.getState().showToast(e?.message || 'Failed to save topics. Check your connection.') }
  }

  const handleCopyTopicsFrom = async (sourceWeek) => {
    if (sourceWeek === topicWeek) return
    if (!window.confirm(`Copy topics from ${sourceWeek} → ${topicWeek}? This replaces current inputs (you still need to Save).`)) return
    try {
      const raw = await getTopics(sourceWeek)
      const normalized = {}
      Object.entries(raw || {}).forEach(([sub, val]) => {
        const t = normalizeTopic(val)
        if (t) normalized[sub] = t
      })
      onSetTopicInputs(normalized)
      useToastStore.getState().showToast(`Copied from ${sourceWeek} — review and Save`, 'success')
    } catch (e) { useToastStore.getState().showToast(e?.message || 'Failed to copy topics. Check your connection.') }
  }

  const handleSetActiveWeek = async (week) => {
    try {
      await onSetActiveWeek(week)
      useToastStore.getState().showToast(`Active week → ${week}`, 'success')
    } catch { useToastStore.getState().showToast('Failed to set active week. Check your connection.') }
  }

  const toggleKeyPoints = (subject) => {
    setOpenKeyPoints((prev) => {
      const next = new Set(prev)
      if (next.has(subject)) next.delete(subject)
      else next.add(subject)
      return next
    })
  }

  const updateTopic = (subject, field, value) => {
    const cur = topicInputs[subject] || { name: '', video: '', keyPoints: [] }
    onSetTopicInputs({ ...topicInputs, [subject]: { ...cur, [field]: value } })
  }

  const updateKeyPoint = (subject, idx, value) => {
    const cur = topicInputs[subject] || { name: '', video: '', keyPoints: [] }
    const newKps = Array.from({ length: 10 }, (_, i) => cur.keyPoints?.[i] || '')
    newKps[idx] = value
    onSetTopicInputs({ ...topicInputs, [subject]: { ...cur, keyPoints: newKps } })
  }

  return (
    <div>
      <div className="bg-[#111] text-white rounded-2xl p-5 mb-5">
        <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label mb-0.5">
          Active Quiz Week
        </p>
        <p className="text-xs text-[#666] mb-4 font-label">
          Controls which week students quiz on.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {WEEKS.map((w) => (
            <button
              key={w}
              onClick={() => handleSetActiveWeek(w)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all font-display ${
                activeWeek === w ? 'bg-white text-[#111]' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {w.replace('Week ', 'W')}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[#555] font-label">
          Active: <span className="text-white font-semibold">{activeWeek}</span>
        </p>
        {success && <p className="text-green-400 text-xs mt-2 font-label">{success}</p>}
      </div>

      <div className="mb-4">
        <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">Set Topics for Week</label>
        <select
          value={topicWeek}
          onChange={(e) => onTopicWeekChange(e.target.value)}
          className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white"
        >
          {WEEKS.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
      </div>

      <div className="bg-white border border-[#EBEBEB] rounded-xl p-3 mb-4 flex items-center gap-2">
        <p className="text-[11px] text-[#888] font-label shrink-0">Copy from:</p>
        <div className="flex flex-wrap gap-1.5 flex-1">
          {WEEKS.filter((w) => w !== topicWeek).map((w) => (
            <button
              key={w}
              onClick={() => handleCopyTopicsFrom(w)}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-[#E5E5E5] text-[#555] bg-white hover:border-[#111] hover:text-[#111] transition-colors font-label"
            >
              ↺ {w}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-4">
        <p className="text-sm font-bold text-[#111] font-display mb-1">Topics for {topicWeek}</p>
        <p className="text-xs text-[#AAA] font-label mb-4">
          Shown to students after completing their quiz as next week's revision guide.
        </p>
        <div className="space-y-5">
          {SUBJECTS.map((subject) => {
            const cur = topicInputs[subject] || { name: '', video: '', keyPoints: [] }
            const kps = Array.from({ length: 10 }, (_, i) => cur.keyPoints?.[i] || '')
            const filledKps = kps.filter((k) => k.trim()).length
            const isOpen = openKeyPoints.has(subject)
            return (
              <div key={subject}>
                <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">{subject}</label>
                <input
                  value={cur.name || ''}
                  onChange={(e) => updateTopic(subject, 'name', e.target.value)}
                  placeholder="e.g. Vectors, Adaptation…"
                  className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] mb-1.5"
                />
                <input
                  value={cur.smsName || ''}
                  onChange={(e) => updateTopic(subject, 'smsName', e.target.value)}
                  placeholder="SMS short name (optional) — e.g. Vectors"
                  className="w-full border border-[#E5E5E5] rounded-lg px-3 py-1.5 text-xs text-[#555] focus:outline-none focus:border-[#111] placeholder:text-[#CCC] mb-1.5"
                />
                <input
                  type="url"
                  value={cur.video || ''}
                  onChange={(e) => updateTopic(subject, 'video', e.target.value)}
                  placeholder="YouTube URL (optional)"
                  className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-xs text-[#555] focus:outline-none focus:border-[#111] placeholder:text-[#CCC] mb-1.5"
                />
                <button
                  type="button"
                  onClick={() => toggleKeyPoints(subject)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-[#555] hover:text-[#111] transition-colors font-label"
                >
                  <span>{isOpen ? '▲' : '▼'}</span>
                  <span>Key Points</span>
                  {filledKps > 0 && (
                    <span className="bg-[#111] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full font-label">{filledKps}</span>
                  )}
                </button>
                {isOpen && (
                  <div className="mt-2 space-y-1.5 pl-1">
                    {kps.map((kp, kpIdx) => (
                      <div key={kpIdx} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[#CCC] font-label w-4 shrink-0">{kpIdx + 1}</span>
                        <input
                          value={kp}
                          onChange={(e) => updateKeyPoint(subject, kpIdx, e.target.value)}
                          placeholder={`Key point ${kpIdx + 1}…`}
                          className="flex-1 border border-[#E5E5E5] rounded-lg px-2.5 py-1.5 text-xs text-[#111] focus:outline-none focus:border-[#111] placeholder:text-[#DDD]"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {topicSuccess && (
          <div className="mt-3 px-3.5 py-2 bg-green-50 border border-green-100 rounded-xl">
            <p className="text-green-600 text-xs font-label">{topicSuccess}</p>
          </div>
        )}
        <button
          onClick={handleSaveTopics}
          className="w-full mt-4 bg-[#111] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#222] transition-colors font-display"
        >
          Save Topics for {topicWeek}
        </button>
      </div>

      {Object.keys(topics).some((k) => topics[k]?.name) && (
        <div className="bg-[#F3F3F2] border border-[#EBEBEB] rounded-2xl p-4">
          <p className="text-xs font-bold text-[#555] font-display mb-3">Saved — {topicWeek}</p>
          <div className="space-y-2">
            {Object.entries(topics).map(([subject, t]) => t?.name ? (
              <div key={subject} className="flex justify-between items-center gap-2">
                <p className="text-xs text-[#555] font-body shrink-0">{subject}</p>
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-xs font-semibold text-[#111] bg-white border border-[#E5E5E5] px-2.5 py-1 rounded-lg font-label truncate">{t.name}{t.smsName ? <span className="text-[#999] font-normal ml-1">SMS: {t.smsName}</span> : null}</p>
                  {t.video && (
                    <a href={safeUrl(t.video)} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg font-label hover:bg-red-100 shrink-0" title={safeUrl(t.video)}>
                      ▶ Video
                    </a>
                  )}
                </div>
              </div>
            ) : null)}
          </div>
        </div>
      )}
    </div>
  )
}
