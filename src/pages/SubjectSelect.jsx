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
      if (selected.length >= 4) {
        setErr('You can only select 4 subjects')
        return
      }
      setSelected([...selected, subject])
    }
    setErr('')
  }

  const handleSave = async () => {
    if (selected.length !== 4) {
      setErr('Please select exactly 4 subjects')
      return
    }
    setLoading(true)
    try {
      await updateStudent(student.id, { subjects: selected })
      const updated = { ...student, subjects: selected }
      setStudent(updated)
      setView('dashboard')
    } catch (e) {
      setErr('Failed to save. Check your connection and try again.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">

        <div className="text-center py-8">
          <h2 className="text-2xl font-bold text-gray-900">Select Your 4 JAMB Subjects</h2>
          <p className="text-gray-500 text-sm mt-2">Hi {student?.name}, choose exactly 4 subjects</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm text-gray-500">Selected</span>
            <span className={`text-sm font-bold ${selected.length === 4 ? 'text-green-600' : 'text-gray-900'}`}>
              {selected.length} / 4
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {SUBJECTS.map((subject) => {
              const isSelected = selected.includes(subject)
              return (
                <button
                  key={subject}
                  onClick={() => toggle(subject)}
                  className={`p-3 rounded-xl text-xs font-medium text-left transition-all border ${
                    isSelected
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {isSelected && <span className="mr-1">✓</span>}
                  {subject}
                </button>
              )
            })}
          </div>
        </div>

        {err && (
          <p className="text-red-500 text-xs text-center mb-3">{err}</p>
        )}

        {selected.length === 4 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4">
            <p className="text-green-700 text-xs font-medium mb-1">Your selected subjects:</p>
            <div className="flex flex-wrap gap-2">
              {selected.map((s) => (
                <span key={s} className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-lg">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={selected.length !== 4 || loading}
          className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${
            selected.length === 4 && !loading
              ? 'bg-gray-900 text-white hover:bg-gray-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {loading ? 'Saving...' : 'Save & Continue →'}
        </button>

      </div>
    </div>
  )
}