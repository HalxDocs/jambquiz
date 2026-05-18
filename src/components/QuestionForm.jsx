import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { SUBJECTS, WEEKS, addQuestion, editQuestion, deleteQuestion, copyQuestionsToWeek, saveQuestionLimit, setQuizDates } from '../store/useStore'
import { compressImage } from './ImageUpload'

export default function QuestionForm({
  questions,
  selectedSubject,
  selectedWeek,
  onSubjectChange,
  onWeekChange,
  questionLimit,
  onSaveLimit,
  quizDate1,
  quizDate2,
  onSetQuizDates,
}) {
  const [form, setForm] = useState({ question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 0, explanation: '', explanationImage: '', image: '', optionImages: ['', '', '', ''] })
  const [uploadingImg, setUploadingImg] = useState(null)
  const [editingFirestoreId, setEditingFirestoreId] = useState(null)
  const [expandedQuestion, setExpandedQuestion] = useState(null)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [localQuizDate1, setLocalQuizDate1] = useState(quizDate1 || '')
  const [localQuizDate2, setLocalQuizDate2] = useState(quizDate2 || '')
  const [localQuestionLimit, setLocalQuestionLimit] = useState(questionLimit)

  const resetForm = () => {
    setForm({ question: '', optionA: '', optionB: '', optionC: '', optionD: '', answer: 0, explanation: '', explanationImage: '', image: '', optionImages: ['', '', '', ''] })
    setEditingFirestoreId(null)
    setErr('')
  }

  const handleImageUpload = async (file, target, index = null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file'); return }
    setUploadingImg(target + (index !== null ? index : ''))
    try {
      const dataUrl = await compressImage(file)
      if (target === 'question') setForm((f) => ({ ...f, image: dataUrl }))
      else if (target === 'explanation') setForm((f) => ({ ...f, explanationImage: dataUrl }))
      else if (target === 'option' && index !== null) {
        setForm((f) => {
          const next = [...f.optionImages]
          next[index] = dataUrl
          return { ...f, optionImages: next }
        })
      }
    } catch {
      setErr('Failed to process image')
    }
    setUploadingImg(null)
  }

  const handleAddOrEdit = async () => {
    if (!form.question.trim()) { setErr('Enter a question'); return }
    if (!form.optionA.trim() || !form.optionB.trim() || !form.optionC.trim() || !form.optionD.trim()) { setErr('Fill in all 4 options'); return }
    const qData = {
      question: form.question.trim(),
      options: [form.optionA.trim(), form.optionB.trim(), form.optionC.trim(), form.optionD.trim()],
      answer: parseInt(form.answer),
      explanation: form.explanation.trim(),
      explanationImage: form.explanationImage || '',
      image: form.image || '',
      optionImages: form.optionImages || ['', '', '', ''],
    }
    try {
      if (editingFirestoreId) {
        await editQuestion(editingFirestoreId, qData)
        setSuccess('Question updated!')
      } else {
        await addQuestion(selectedSubject, selectedWeek, qData)
        setSuccess('Question added!')
      }
      resetForm()
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      console.error(e)
      setErr('Failed. Check your connection.')
    }
  }

  const handleEdit = (q) => {
    setForm({
      question: q.question,
      optionA: q.options[0], optionB: q.options[1], optionC: q.options[2], optionD: q.options[3],
      answer: q.answer,
      explanation: q.explanation || '',
      explanationImage: q.explanationImage || '',
      image: q.image || '',
      optionImages: q.optionImages && q.optionImages.length === 4 ? q.optionImages : ['', '', '', ''],
    })
    setEditingFirestoreId(q.firestoreId)
    setExpandedQuestion(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (firestoreId) => {
    if (!window.confirm('Delete this question?')) return
    try {
      await deleteQuestion(firestoreId)
      setSuccess('Deleted!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      console.error(e)
      alert('Failed to delete.')
    }
  }

  const handleSaveLimit = async () => {
    try {
      await saveQuestionLimit(selectedSubject, selectedWeek, localQuestionLimit)
      onSaveLimit(localQuestionLimit)
      setSuccess('Limit saved!')
      setTimeout(() => setSuccess(''), 3000)
    } catch { alert('Failed to save limit.') }
  }

  const handleTransferQuestions = async (fromWeek) => {
    if (!window.confirm(`Copy all ${selectedSubject} questions from ${fromWeek} → ${selectedWeek}?`)) return
    setTransferring(true)
    try {
      const count = await copyQuestionsToWeek(selectedSubject, fromWeek, selectedWeek)
      setSuccess(`${count} question(s) transferred from ${fromWeek}!`)
      setTimeout(() => setSuccess(''), 4000)
    } catch { alert('Transfer failed. Check your connection.') }
    setTransferring(false)
  }

  const handleSaveQuizDates = async () => {
    try {
      const date1 = localQuizDate1 ? new Date(localQuizDate1).toISOString() : ''
      const date2 = localQuizDate2 ? new Date(localQuizDate2).toISOString() : ''
      await setQuizDates(date1, date2)
      onSetQuizDates(localQuizDate1, localQuizDate2)
      setSuccess('Quiz dates saved!')
      setTimeout(() => setSuccess(''), 3000)
    } catch { alert('Failed to save quiz dates.') }
  }

  const toDatetimeLocal = (val) => {
    if (!val) return ''
    try {
      const d = new Date(val)
      const p = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
    } catch { return '' }
  }

  const defaultLimit = selectedSubject === 'English Language' ? 40 : 25

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">Subject</label>
          <select
            value={selectedSubject}
            onChange={(e) => { onSubjectChange(e.target.value); resetForm() }}
            className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white"
          >
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">Week</label>
          <select
            value={selectedWeek}
            onChange={(e) => { onWeekChange(e.target.value); resetForm() }}
            className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white"
          >
            {WEEKS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-[#EBEBEB] rounded-xl p-4 mb-4">
        <p className="text-xs font-bold text-[#111] font-body mb-0.5">Quiz Schedule</p>
        <p className="text-[11px] text-[#AAA] font-label mb-3">Set 2 dates when students can take the quiz</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="text-[10px] font-bold text-[#888] uppercase tracking-wide block mb-1 font-label">Date 1</label>
            <input
              type="datetime-local"
              value={toDatetimeLocal(localQuizDate1)}
              onChange={(e) => setLocalQuizDate1(e.target.value)}
              className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-xs text-[#111] focus:outline-none focus:border-[#111] bg-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[#888] uppercase tracking-wide block mb-1 font-label">Date 2</label>
            <input
              type="datetime-local"
              value={toDatetimeLocal(localQuizDate2)}
              onChange={(e) => setLocalQuizDate2(e.target.value)}
              className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-xs text-[#111] focus:outline-none focus:border-[#111] bg-white"
            />
          </div>
        </div>
        <button
          onClick={handleSaveQuizDates}
          className="text-xs bg-[#111] text-white px-3 py-1.5 rounded-lg font-label hover:bg-[#222] transition-colors"
        >
          Save Dates
        </button>
      </div>

      <div className="bg-white border border-[#EBEBEB] rounded-xl p-4 mb-4">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs font-bold text-[#111] font-body">{questions.length} questions in pool</p>
            <p className="text-[11px] text-[#AAA] font-label mt-0.5">
              Each student gets {Math.min(localQuestionLimit, questions.length)} random questions
              <span className="text-[#CCC]"> · default {defaultLimit}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={questions.length || 100}
              value={localQuestionLimit}
              onChange={(e) => setLocalQuestionLimit(parseInt(e.target.value) || defaultLimit)}
              className="w-14 border border-[#E5E5E5] rounded-lg px-2 py-1.5 text-xs text-center bg-white focus:outline-none focus:border-[#111]"
            />
            <button
              onClick={handleSaveLimit}
              className="text-xs bg-[#111] text-white px-3 py-1.5 rounded-lg font-label hover:bg-[#222] transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#EBEBEB] rounded-xl p-4 mb-4">
        <p className="text-xs font-bold text-[#111] font-body mb-0.5">Transfer Questions → {selectedWeek}</p>
        <p className="text-[11px] text-[#AAA] font-label mb-2">Copy {selectedSubject} questions from another week into this one</p>
        <div className="flex flex-wrap gap-1.5">
          {WEEKS.filter((w) => w !== selectedWeek).map((w) => (
            <button
              key={w}
              onClick={() => handleTransferQuestions(w)}
              disabled={transferring}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-[#E5E5E5] text-[#555] bg-white hover:border-[#111] hover:text-[#111] disabled:opacity-40 transition-colors font-label"
            >
              {w} +
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-4">
        <p className="text-sm font-bold text-[#111] font-display mb-4">
          {editingFirestoreId ? '✏️ Edit Question' : 'Add Question'}
          <span className="text-[#AAA] text-xs font-label font-normal ml-2">
            {selectedSubject} · {selectedWeek}
          </span>
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">Question</label>
            <textarea
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              placeholder="Type the question here…"
              rows={3}
              className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] resize-none"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">
              Question Image <span className="text-[#CCC] normal-case tracking-normal">optional · auto-compressed</span>
            </label>
            {form.image ? (
              <div className="relative inline-block">
                <img src={form.image} alt="Question" className="max-h-40 rounded-xl border border-[#E5E5E5]" />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, image: '' })}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-[#E5E5E5] rounded-full flex items-center justify-center text-[#555] hover:text-red-500 hover:border-red-200 shadow-sm"
                  title="Remove image"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={12} color="currentColor" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-[#CCC] rounded-xl cursor-pointer hover:border-[#111] hover:bg-[#FAFAF9] transition-colors">
                <span className="text-xs text-[#888] font-label">
                  {uploadingImg === 'question' ? 'Uploading…' : '📷 Upload image'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e.target.files?.[0], 'question')}
                  className="hidden"
                />
              </label>
            )}
          </div>
          {['A', 'B', 'C', 'D'].map((letter, idx) => (
            <div key={letter}>
              <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">Option {letter}</label>
              <input
                value={form[`option${letter}`]}
                onChange={(e) => setForm({ ...form, [`option${letter}`]: e.target.value })}
                placeholder={`Option ${letter}`}
                className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] mb-1.5"
              />
              {form.optionImages[idx] ? (
                <div className="relative inline-block mt-1">
                  <img src={form.optionImages[idx]} alt={`Option ${letter}`} className="max-h-24 rounded-lg border border-[#E5E5E5]" />
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...form.optionImages]
                      next[idx] = ''
                      setForm({ ...form, optionImages: next })
                    }}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-white border border-[#E5E5E5] rounded-full flex items-center justify-center text-[#555] hover:text-red-500 hover:border-red-200 shadow-sm"
                    title="Remove image"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={10} color="currentColor" />
                  </button>
                </div>
              ) : (
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed border-[#DDD] rounded-lg cursor-pointer hover:border-[#111] transition-colors">
                  <span className="text-[10px] text-[#888] font-label">
                    {uploadingImg === 'option' + idx ? 'Uploading…' : '📷 Add image'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e.target.files?.[0], 'option', idx)}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          ))}
          <div>
            <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">Correct Answer</label>
            <select
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: e.target.value })}
              className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white"
            >
              {['A', 'B', 'C', 'D'].map((l, i) => <option key={l} value={i}>Option {l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-[#888] uppercase tracking-wide block mb-1.5 font-label">
              Explanation <span className="text-[#CCC] normal-case tracking-normal">optional</span>
            </label>
            <textarea
              value={form.explanation}
              onChange={(e) => setForm({ ...form, explanation: e.target.value })}
              placeholder="Why is this the correct answer?"
              rows={2}
              className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] resize-none mb-1.5"
            />
            {form.explanationImage ? (
              <div className="relative inline-block mt-1">
                <img src={form.explanationImage} alt="Explanation" className="max-h-32 rounded-xl border border-[#E5E5E5]" />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, explanationImage: '' })}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-[#E5E5E5] rounded-full flex items-center justify-center text-[#555] hover:text-red-500 hover:border-red-200 shadow-sm"
                  title="Remove image"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={12} color="currentColor" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-[#CCC] rounded-xl cursor-pointer hover:border-[#111] hover:bg-[#FAFAF9] transition-colors">
                <span className="text-xs text-[#888] font-label">
                  {uploadingImg === 'explanation' ? 'Uploading…' : '📷 Add explanation image (optional)'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e.target.files?.[0], 'explanation')}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {err && <div className="mt-3 px-3.5 py-2 bg-red-50 border border-red-100 rounded-xl"><p className="text-red-600 text-xs font-label">{err}</p></div>}
        {success && <div className="mt-3 px-3.5 py-2 bg-green-50 border border-green-100 rounded-xl"><p className="text-green-600 text-xs font-label">{success}</p></div>}

        <div className="flex gap-2.5 mt-4">
          {editingFirestoreId && (
            <button onClick={resetForm} className="flex-1 border border-[#E5E5E5] rounded-xl py-3 text-sm font-semibold text-[#555] hover:bg-[#F8F8F7] font-label">
              Cancel
            </button>
          )}
          <button
            onClick={handleAddOrEdit}
            className="flex-1 bg-[#111] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#222] transition-colors font-display"
          >
            {editingFirestoreId ? 'Save Changes' : 'Add Question'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm font-bold text-[#111] font-display">Question Pool</p>
          <span className="text-[11px] font-semibold bg-[#F3F3F2] text-[#555] px-2.5 py-1 rounded-lg font-label">
            {questions.length} total
          </span>
        </div>
        {questions.length === 0 ? (
          <p className="text-[#CCC] text-sm text-center py-6 font-label">
            No questions for {selectedSubject} · {selectedWeek}
          </p>
        ) : (
          <div className="space-y-2">
            {questions.map((q, i) => (
              <div key={q.firestoreId} className="border border-[#F0F0F0] rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedQuestion(expandedQuestion === q.firestoreId ? null : q.firestoreId)}
                  className="w-full flex justify-between items-center p-3 text-left hover:bg-[#FAFAF9] transition-colors"
                >
                  <p className="text-xs text-[#111] font-semibold font-body flex-1 pr-2 leading-snug">
                    {i + 1}. {q.question.length > 60 ? q.question.slice(0, 60) + '…' : q.question}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] font-bold text-white bg-[#111] w-5 h-5 rounded-full flex items-center justify-center font-label">
                      {String.fromCharCode(65 + q.answer)}
                    </span>
                    {q.explanation && (
                      <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-label">exp</span>
                    )}
                    <span className="text-[#CCC] text-xs">{expandedQuestion === q.firestoreId ? '▲' : '▼'}</span>
                  </div>
                </button>

                {expandedQuestion === q.firestoreId && (
                  <div className="px-3 pb-3 border-t border-[#F0F0F0]">
                    <p className="text-xs text-[#111] font-semibold font-body mt-2 mb-2 leading-snug">{q.question}</p>
                    {q.image && <img src={q.image} alt="Question" className="max-h-32 rounded-lg border border-[#E5E5E5] mb-3" />}
                    <div className="grid grid-cols-2 gap-1 mb-3">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className={`text-xs px-2.5 py-1.5 rounded-lg font-label ${
                          oi === q.answer ? 'bg-green-100 text-green-700 font-semibold' : 'bg-[#F8F8F7] text-[#888]'
                        }`}>
                          <p>{String.fromCharCode(65 + oi)}. {opt}{oi === q.answer && ' ✓'}</p>
                          {q.optionImages?.[oi] && <img src={q.optionImages[oi]} alt={`Option ${oi}`} className="max-h-16 rounded mt-1" />}
                        </div>
                      ))}
                    </div>
                    {q.explanation && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 mb-3">
                        <p className="text-[10px] font-bold text-blue-700 font-label mb-0.5">Explanation</p>
                        <p className="text-xs text-blue-600 font-label whitespace-pre-line leading-relaxed">{q.explanation}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(q)} className="flex-1 text-blue-600 text-xs border border-blue-100 rounded-lg px-3 py-2 hover:bg-blue-50 font-label transition-colors">
                        ✏️ Edit
                      </button>
                      <button onClick={() => handleDelete(q.firestoreId)} className="flex-1 text-red-500 text-xs border border-red-100 rounded-lg px-3 py-2 hover:bg-red-50 font-label transition-colors">
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
