import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon } from '@hugeicons/core-free-icons'
import { logEvent } from '../store/useStore'

const SUBJECTS = [
  { value: 'feature-request', label: 'Feature Request' },
  { value: 'bug-report', label: 'Report a Bug' },
  { value: 'question', label: 'Question / Suggestion' },
  { value: 'other', label: 'Other' },
]

export default function Contact({ student, setView }) {
  const [subject, setSubject] = useState('feature-request')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!message.trim()) return
    logEvent(student.id, 'contact_sent', { subject })
    const name = student.name || 'Student'
    const emailBody = `Name: ${name}\nSubject: ${SUBJECTS.find((s) => s.value === subject)?.label}\n\nMessage:\n${message.trim()}`
    window.location.href = `mailto:contact@274lab.com?subject=${encodeURIComponent(`[${SUBJECTS.find((s) => s.value === subject)?.label}] from ${name}`)}&body=${encodeURIComponent(emailBody)}`
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <div className="max-w-md mx-auto px-4 pb-10">
        <div className="pt-8 pb-6">
          <button onClick={() => setView('dashboard')}
            className="text-xs text-[#888] hover:text-[#111] font-label transition-colors mb-3 inline-flex items-center gap-1">
            ← Back to Dashboard
          </button>
          <h2 className="text-lg sm:text-xl font-bold text-[#111] font-display">Contact / Feature Request</h2>
          <p className="text-xs text-[#888] font-label mt-1">
            Have a suggestion or found a bug? Send us a message.
          </p>
        </div>

        {sent ? (
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-6 text-center">
            <div className="mb-3 flex justify-center"><HugeiconsIcon icon={Mail01Icon} size={36} color="#111" /></div>
            <p className="text-sm font-bold text-[#111] font-display mb-1">Message sent!</p>
            <p className="text-xs text-[#888] font-label mb-4">
              Your email client should have opened. If not, reach us directly at{' '}
              <a href="mailto:contact@274lab.com" className="text-[#111] underline underline-offset-2">contact@274lab.com</a>
            </p>
            <button onClick={() => setView('dashboard')}
              className="w-full bg-[#111] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#222] transition-all font-display">
              Back to Dashboard
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white border border-[#EBEBEB] rounded-2xl p-5 space-y-4">
            <div>
              <label className="text-[10px] font-bold text-[#888] uppercase tracking-wide font-label block mb-1.5">Subject</label>
              <select value={subject} onChange={(e) => setSubject(e.target.value)}
                className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] focus:outline-none focus:border-[#111] bg-white">
                {SUBJECTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#888] uppercase tracking-wide font-label block mb-1.5">Your Message</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your feature request, bug, or suggestion..."
                rows={5}
                className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2.5 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111] resize-none" />
            </div>
            <button type="submit" disabled={!message.trim()}
              className="w-full bg-[#111] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#222] transition-all font-display disabled:opacity-40">
              Send Message → (opens your email)
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
