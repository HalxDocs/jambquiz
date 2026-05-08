import { useState } from 'react'
import { updateStudent } from '../store/useStore'

export default function Supporters({ student, setStudent, setView }) {
  const [parentPhone, setParentPhone] = useState('')
  const [teacherPhone, setTeacherPhone] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    const p = parentPhone.trim()
    const t = teacherPhone.trim()
    if (!p && !t) { setErr('Enter at least one phone number (parent or teacher)'); return }
    if (p && p.length < 7) { setErr('Enter a valid parent phone number'); return }
    if (t && t.length < 7) { setErr('Enter a valid teacher phone number'); return }
    setLoading(true); setErr('')
    try {
      const updates = {}
      if (p) updates.parentPhone = `+234${p}`
      if (t) updates.teacherPhone = `+234${t}`
      await updateStudent(student.id, updates)
      setStudent({ ...student, ...updates })
      setView('subjects')
    } catch {
      setErr('Failed to save. Check your connection.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-7 pt-4">
          <div className="w-16 h-16 mx-auto bg-[#111] rounded-2xl flex items-center justify-center mb-4 text-3xl">
            🤝
          </div>
          <h2 className="text-[1.6rem] font-bold text-[#111] leading-tight tracking-tight font-display mb-2">
            Add your support system
          </h2>
          <p className="text-[13px] text-[#555] font-body leading-snug">
            This is one of the most important steps.
          </p>
        </div>

        {/* Why card */}
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-5 space-y-3">
          {[
            { icon: '📊', text: 'Your parent and teacher get a weekly report on your progress, so they know exactly where to support you.' },
            { icon: '🔁', text: 'This accountability loop is what separates students who show up consistently from those who drift away.' },
            { icon: '🎯', text: 'Students with active support contacts score significantly higher and attend more sessions.' },
          ].map(({ icon, text }, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-lg shrink-0 mt-0.5">{icon}</span>
              <p className="text-xs text-[#555] font-body leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        {/* Inputs */}
        <div className="space-y-3.5 mb-4">
          <div>
            <label className="text-[11px] font-bold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
              Parent / Guardian Phone
            </label>
            <div className="flex border border-[#E5E5E5] rounded-xl overflow-hidden focus-within:border-[#111] transition-colors bg-white">
              <span className="px-3 py-3 text-sm font-semibold text-[#555] bg-[#F8F8F7] border-r border-[#E5E5E5] select-none font-label">+234</span>
              <input
                type="tel"
                value={parentPhone}
                onChange={(e) => { setParentPhone(e.target.value.replace(/^\+?234/, '')); setErr('') }}
                placeholder="803 000 0000"
                className="flex-1 px-3 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
              Teacher / Tutor Phone
            </label>
            <div className="flex border border-[#E5E5E5] rounded-xl overflow-hidden focus-within:border-[#111] transition-colors bg-white">
              <span className="px-3 py-3 text-sm font-semibold text-[#555] bg-[#F8F8F7] border-r border-[#E5E5E5] select-none font-label">+234</span>
              <input
                type="tel"
                value={teacherPhone}
                onChange={(e) => { setTeacherPhone(e.target.value.replace(/^\+?234/, '')); setErr('') }}
                placeholder="803 000 0000"
                className="flex-1 px-3 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none bg-white"
              />
            </div>
          </div>
        </div>

        {err && (
          <div className="mb-3 px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-red-600 text-xs font-label">{err}</p>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={loading}
          className={`w-full rounded-xl py-3.5 text-sm font-bold tracking-wide transition-all active:scale-[0.99] font-display ${
            loading
              ? 'bg-[#E5E5E5] text-[#AAA] cursor-not-allowed'
              : 'bg-[#111] text-white hover:bg-[#222]'
          }`}
        >
          {loading ? 'Saving…' : 'Continue →'}
        </button>

        <p className="text-center text-[11px] text-[#AAA] mt-4 font-label leading-relaxed">
          Their numbers are only used to send your weekly progress report via WhatsApp. Nothing else.
        </p>

      </div>
    </div>
  )
}
