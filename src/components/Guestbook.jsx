import { useCallback, useEffect, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PencilEdit01Icon, Delete02Icon, Alert02Icon } from '@hugeicons/core-free-icons'
import { apiGetPublic, apiPostPublic } from '../lib/api'

// Guestbook backed by GET/POST /api/guestbook on the Go backend. Entries carry
// an optional handwritten signature drawn on the canvas below.
function SignaturePad({ onChange, clearSignal }) {
  const ref = useRef(null)
  const drawing = useRef(false)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const resize = () => {
      const prev = c.toDataURL()
      const rect = c.getBoundingClientRect()
      c.width = rect.width * 2
      c.height = rect.height * 2
      const ctx = c.getContext('2d')
      ctx.scale(2, 2)
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#111'
      if (prev && prev.length > 100) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
        img.src = prev
      }
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c || clearSignal === undefined) return
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    onChange('')
  }, [clearSignal])

  const pos = (e) => {
    const c = ref.current
    const r = c.getBoundingClientRect()
    const p = e.touches ? e.touches[0] : e
    return { x: p.clientX - r.left, y: p.clientY - r.top }
  }

  const start = (e) => {
    e.preventDefault()
    drawing.current = true
    const ctx = ref.current.getContext('2d')
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = ref.current.getContext('2d')
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    onChange(ref.current.toDataURL('image/png'))
  }
  const end = () => { drawing.current = false }

  return (
    <canvas
      ref={ref}
      onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
      onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      className="w-full h-28 bg-white rounded-xl border border-neutral-300 cursor-crosshair touch-none"
    />
  )
}

function Entry({ e }) {
  const date = e.createdAt ? new Date(e.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold text-white font-display truncate">{e.name}</p>
        <span className="text-[10px] text-neutral-500 font-label shrink-0">{date}</span>
      </div>
      {e.message && <p className="text-xs text-neutral-300 font-body leading-relaxed">{e.message}</p>}
      {e.signature?.startsWith('data:') && (
        <img src={e.signature} alt={`${e.name}'s signature`} className="h-14 object-contain self-start opacity-90" />
      )}
    </div>
  )
}

export default function Guestbook() {
  const [entries, setEntries] = useState([])
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [signature, setSignature] = useState('')
  const [clearSignal, setClearSignal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState(false)

  const load = useCallback(() => {
    apiGetPublic('/api/guestbook?limit=30')
      .then((d) => setEntries(Array.isArray(d?.entries) ? d.entries : []))
      .catch(() => setEntries([]))
  }, [])

  useEffect(() => { load() }, [load])

  const submit = async (e) => {
    e.preventDefault()
    setMsg(''); setOk(false)
    if (name.trim().length < 2) { setMsg('Please enter your name'); return }
    if (message.trim().length < 2) { setMsg('Please write a short message'); return }
    setBusy(true)
    try {
      await apiPostPublic('/api/guestbook', { name: name.trim(), message: message.trim(), signature })
      setOk(true)
      setName(''); setMessage(''); setSignature(''); setClearSignal((n) => n + 1)
      load()
    } catch (err) {
      setMsg(err?.message || 'Could not sign. Please try again.')
    }
    setBusy(false)
  }

  return (
    <section id="guestbook" className="relative py-16 sm:py-20 bg-[#0A0A0A] border-t border-white/5">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white font-display tracking-tight">Guestbook</h2>
          <p className="mt-3 text-sm text-neutral-400 font-body max-w-md mx-auto">
            Sign our guestbook and leave a note for the next JAMB candidate.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] items-start">
          {/* Sign form */}
          <form onSubmit={submit} className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-300 font-label mb-1.5">Your name</label>
              <input
                value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
                placeholder="e.g. Chukwuemeka Okafor"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:outline-none focus:border-white/30"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-300 font-label mb-1.5">Message</label>
              <textarea
                value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3}
                placeholder="Write something for the next candidate…"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:outline-none focus:border-white/30 resize-none"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-neutral-300 font-label">Signature <span className="text-neutral-600 font-normal">(optional)</span></label>
                <button
                  type="button" onClick={() => setClearSignal((n) => n + 1)}
                  className="text-[10px] text-neutral-500 hover:text-white font-label inline-flex items-center gap-1"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={12} color="currentColor" /> Clear
                </button>
              </div>
              <SignaturePad onChange={setSignature} clearSignal={clearSignal} />
            </div>

            {msg && (
              <p className="text-xs text-red-400 font-body inline-flex items-center gap-1.5">
                <HugeiconsIcon icon={Alert02Icon} size={13} color="currentColor" /> {msg}
              </p>
            )}
            {ok && <p className="text-xs text-emerald-400 font-body">Signed. Thank you!</p>}

            <button
              type="submit" disabled={busy}
              className="w-full bg-white text-black rounded-xl py-3 text-sm font-bold font-display hover:bg-neutral-200 active:scale-[0.99] transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <HugeiconsIcon icon={PencilEdit01Icon} size={16} color="currentColor" />
              {busy ? 'Signing…' : 'Sign Guestbook'}
            </button>
          </form>

          {/* Entries */}
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {entries.length === 0 ? (
              <p className="text-sm text-neutral-500 font-body text-center py-10">No entries yet. Be the first to sign.</p>
            ) : (
              entries.map((e) => <Entry key={e.id} e={e} />)
            )}
          </div>
        </div>
      </div>
    </section>
  )
}