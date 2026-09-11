import { useState } from 'react'
import { functions, httpsCallable } from '../firebase'

import SEO from '../components/seo/SEO'

export default function Supporters({ student, setStudent, setView }) {
  const stripInit = (p) => {
    if (!p) return ''
    let v = String(p).replace(/\D/g, '')
    if (v.startsWith('234')) v = v.slice(3)
    if (v.startsWith('0')) v = v.replace(/^0+/, '')
    return v.slice(0, 10)
  }
  const [parentPhone, setParentPhone] = useState(stripInit(student?.parentPhone))
  const [teacherPhone, setTeacherPhone] = useState(stripInit(student?.teacherPhone))
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const isEditing = !!(student?.parentPhone || student?.teacherPhone)

  const handleSave = async () => {
    const p = parentPhone.trim()
    const t = teacherPhone.trim()
    if (!p && !t) { setErr('Enter at least one phone number'); return }
    if (p && p.length < 7) { setErr('Enter a valid phone number'); return }
    if (t && t.length < 7) { setErr('Enter a valid phone number'); return }
    setLoading(true); setErr('')
    try {
      const updates = {}
      const phones = []
      if (p) { const cleaned = p.replace(/^0+/, ''); const full = `+234${cleaned}`; updates.parentPhone = full; phones.push(full) }
      if (t) { const cleaned = t.replace(/^0+/, ''); const full = `+234${cleaned}`; updates.teacherPhone = full; phones.push(full) }
      const fn = httpsCallable(functions, 'updateStudentProfile')
      await fn({ studentId: student.id, ...updates })
      setStudent({ ...student, ...updates })

      // Send the intro SMS in the background so it never blocks the user —
      // poor/invalid recipient numbers shouldn't stall the signup flow.
      try {
        const fn2 = httpsCallable(functions, 'sendAccountabilityIntro')
        fn2({ studentId: student.id, phones }).catch((e) => {
          console.error('[Supporters] Background intro SMS failed:', e?.message || e)
        })
      } catch (e) {
        console.error('[Supporters] Failed to send intro SMS:', e?.message || e)
      }

      // If editing (already has subjects), go back to dashboard; otherwise continue onboarding
      if (isEditing && student?.subjects?.length) {
        setView('dashboard')
      } else {
        setView('subjects')
      }
    } catch (e) {
      console.error('[Supporters] handleSave error:', e)
      setErr(e?.message || 'Failed to save. Check your connection.')
    }
    setLoading(false)
  }

  return (
    <>
      <SEO title="Supporters" />
    <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-7 pt-4">
          {isEditing && (
            <button onClick={() => setView('dashboard')} className="mb-3 text-xs text-[#888] hover:text-[#111] font-label">← Back to dashboard</button>
          )}
          <div className="w-16 h-16 mx-auto bg-[#111] rounded-2xl flex items-center justify-center mb-4 text-3xl">
            🤝
          </div>
          <h2 className="text-[1.6rem] font-bold text-[#111] leading-tight tracking-tight font-display mb-2">
            {isEditing ? 'Edit your support system' : 'Add your support system'}
          </h2>
          <p className="text-[13px] text-[#555] font-body leading-snug">
            {isEditing ? 'Update your accountability partners. Changes take effect immediately.' : 'This is one of the most important steps.'}
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
              PARENT / GUARDIAN / SIBLING PHONE
            </label>
            <div className="flex border border-[#E5E5E5] rounded-xl overflow-hidden focus-within:border-[#111] transition-colors bg-white">
              <span className="px-3 py-3 text-sm font-semibold text-[#555] bg-[#F8F8F7] border-r border-[#E5E5E5] select-none font-label">+234</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={parentPhone}
                onChange={(e) => {
                  let v = e.target.value.replace(/\D/g, '')
                  if (v.startsWith('234')) v = v.slice(3)
                  if (v.startsWith('0')) v = v.replace(/^0+/, '')
                  setParentPhone(v.slice(0, 10)); setErr('')
                }}
                placeholder="803 000 0000"
                className="flex-1 px-3 py-3 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#666] uppercase tracking-wide block mb-1.5 font-label">
              TEACHER / TUTOR / FRIEND PHONE
            </label>
            <div className="flex border border-[#E5E5E5] rounded-xl overflow-hidden focus-within:border-[#111] transition-colors bg-white">
              <span className="px-3 py-3 text-sm font-semibold text-[#555] bg-[#F8F8F7] border-r border-[#E5E5E5] select-none font-label">+234</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={teacherPhone}
                onChange={(e) => {
                  let v = e.target.value.replace(/\D/g, '')
                  if (v.startsWith('234')) v = v.slice(3)
                  if (v.startsWith('0')) v = v.replace(/^0+/, '')
                  setTeacherPhone(v.slice(0, 10)); setErr('')
                }}
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
          {loading ? 'Saving…' : isEditing ? 'Save changes' : 'Continue →'}
        </button>

        <p className="text-center text-[11px] text-[#AAA] mt-4 font-label leading-relaxed">
          Their numbers are only used to send your weekly progress report via SMS. Nothing else.
        </p>

      </div>
    </div>
    </>
  )
}
