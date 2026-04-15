import { useState } from 'react'
import { SUBJECTS, updateStudent } from '../store/useStore'

export default function SubjectSelect({ student, setStudent, setView }) {
  const [selected, setSelected] = useState(student?.subjects || [])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const toggle = (subject) => {
    if (selected.includes(subject)) {
      setSelected(selected.filter((s) => s !== subject))
    } else {
      if (selected.length >= 4) { setErr('You can only select 4 subjects'); return }
      setSelected([...selected, subject])
    }
    setErr('')
  }

  const handleSave = async () => {
    if (selected.length !== 4) { setErr('Please select exactly 4 subjects'); return }
    setLoading(true)
    try {
      await updateStudent(student.id, { subjects: selected })
      setStudent({ ...student, subjects: selected })
      setView('dashboard')
    } catch {
      setErr('Failed to save. Check your connection.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#F8F8F7] p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="pt-10 pb-6">
          <p className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.2em] font-label mb-2">
            Step 1 of 1
          </p>
          <h2 className="text-2xl font-bold text-[#111] font-display leading-tight">
            Choose Your 4 JAMB Subjects
          </h2>
          <p className="text-sm text-[#888] mt-1.5 font-label">
            Hi {student?.name?.split(' ')[0]}, select exactly 4 subjects
          </p>
        </div>

        {/* Selection counter */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-[#888] font-label">
            {selected.length === 0
              ? 'No subjects selected'
              : `${selected.length} of 4 selected`}
          </span>
          <span className={`text-xs font-bold font-label px-2.5 py-1 rounded-full ${
            selected.length === 4
              ? 'bg-[#111] text-white'
              : 'bg-[#EBEBEB] text-[#666]'
          }`}>
            {selected.length} / 4
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-[#EBEBEB] rounded-full h-1 mb-5">
          <div
            className="bg-[#111] h-1 rounded-full transition-all duration-300"
            style={{ width: `${(selected.length / 4) * 100}%` }}
          />
        </div>

        {/* Subject grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {SUBJECTS.map((subject) => {
            const isSelected = selected.includes(subject)
            const order = selected.indexOf(subject)
            return (
              <button
                key={subject}
                onClick={() => toggle(subject)}
                className={`p-3.5 rounded-xl text-left transition-all border relative ${
                  isSelected
                    ? 'bg-[#111] text-white border-[#111]'
                    : 'bg-white text-[#333] border-[#E8E8E8] hover:border-[#999]'
                }`}
              >
                {isSelected && (
                  <span className="absolute top-2.5 right-2.5 w-4 h-4 bg-white/20 rounded-full text-[9px] flex items-center justify-center font-bold text-white">
                    {order + 1}
                  </span>
                )}
                <p className="text-xs font-semibold leading-snug font-body pr-5">{subject}</p>
              </button>
            )
          })}
        </div>

        {/* Selected preview */}
        {selected.length > 0 && (
          <div className="bg-white border border-[#EBEBEB] rounded-xl p-3.5 mb-4">
            <p className="text-[11px] font-semibold text-[#888] uppercase tracking-wide mb-2 font-label">
              Your Selection
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selected.map((s, i) => (
                <span key={s} className="text-xs bg-[#111] text-white px-2.5 py-1 rounded-lg font-label">
                  {i + 1}. {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {err && (
          <div className="mb-3 px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-red-600 text-xs font-label">{err}</p>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={selected.length !== 4 || loading}
          className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all active:scale-[0.99] font-display ${
            selected.length === 4 && !loading
              ? 'bg-[#111] text-white hover:bg-[#222]'
              : 'bg-[#EBEBEB] text-[#AAA] cursor-not-allowed'
          }`}
        >
          {loading ? 'Saving…' : selected.length === 4 ? 'Confirm & Continue →' : `Select ${4 - selected.length} more`}
        </button>

      </div>
    </div>
  )
}
