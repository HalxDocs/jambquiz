import { useEffect, useState } from 'react'
import { SUBJECTS, listGoats, createGoat, updateGoat, deleteGoat } from '../../store/useStore'
import { useToastStore } from '../../store/toast'

const emptyForm = () => ({ name: '', profession: '', stars: {}, explanations: {} })

function StarPicker({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? 0 : n)}
          className={`w-8 h-8 rounded-lg text-base transition-all active:scale-95 ${
            n <= value ? 'bg-yellow-100 border border-yellow-300' : 'bg-white border border-[#E5E5E5] opacity-50'
          }`}
          title={`${n} star${n > 1 ? 's' : ''}`}
        >
          ⭐
        </button>
      ))}
    </div>
  )
}

export default function GoatManager() {
  const [goats, setGoats] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm())
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState({})

  const load = async () => {
    setLoading(true)
    try {
      setGoats(await listGoats())
    } catch (e) {
      useToastStore.getState().showToast(e?.message || 'Failed to load GOATs')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const setStar = (subject, n) => setForm((f) => ({ ...f, stars: { ...f.stars, [subject]: n } }))
  const setExplanation = (subject, v) => setForm((f) => ({ ...f, explanations: { ...f.explanations, [subject]: v } }))

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editingId) {
        await updateGoat(editingId, form)
        useToastStore.getState().showToast('GOAT updated', 'success')
      } else {
        await createGoat(form)
        useToastStore.getState().showToast('GOAT created', 'success')
      }
      setForm(emptyForm())
      setEditingId(null)
      await load()
    } catch (e) {
      useToastStore.getState().showToast(e?.message || 'Failed to save GOAT')
    }
    setSaving(false)
  }

  const handleEdit = (g) => {
    setEditingId(g.id)
    setForm({ name: g.name || '', profession: g.profession || '', stars: { ...(g.stars || {}) }, explanations: { ...(g.explanations || {}) } })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (g) => {
    if (!window.confirm(`Delete GOAT "${g.name}"? Weeks using this GOAT will show one fewer celeb.`)) return
    try {
      await deleteGoat(g.id)
      useToastStore.getState().showToast(`Deleted "${g.name}"`, 'success')
      await load()
    } catch (e) { useToastStore.getState().showToast(e?.message || 'Failed to delete.') }
  }

  const ratedSubjects = SUBJECTS.filter((s) => (form.stars[s] || 0) > 0)

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#EBEBEB] rounded-xl px-4 py-3 text-sm text-[#555] font-label">
        <strong className="text-[#111]">{goats.length}</strong> GOAT{goats.length === 1 ? '' : 's'} · assign 4 per week in Topics
      </div>

      {/* Create / edit form */}
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 space-y-3">
        <p className="text-[10px] font-bold text-[#888] uppercase tracking-wide font-label">
          {editingId ? 'Edit GOAT' : 'Create GOAT account'}
        </p>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Name of GOAT — e.g. Einstein" maxLength={60}
          className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111]" />
        <input value={form.profession} onChange={(e) => setForm({ ...form, profession: e.target.value })}
          placeholder="Profession — e.g. physicist" maxLength={60}
          className="w-full border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111]" />

        <p className="text-[10px] font-bold text-[#888] uppercase tracking-wide font-label pt-1">Star rating per subject (max 3)</p>
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {SUBJECTS.map((sub) => (
            <div key={sub} className="border border-[#F1F1F0] rounded-xl p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#333] font-body">{sub}</p>
                <StarPicker value={form.stars[sub] || 0} onChange={(n) => setStar(sub, n)} />
              </div>
              {(form.stars[sub] || 0) > 0 && (
                <textarea value={form.explanations[sub] || ''} onChange={(e) => setExplanation(sub, e.target.value)}
                  placeholder={`What does ${form.name || 'this GOAT'} say for ${sub}? (shown on 3-star Ask)`}
                  rows={2} maxLength={1000}
                  className="mt-2 w-full border border-[#E5E5E5] rounded-lg px-2.5 py-2 text-xs text-[#111] placeholder:text-[#CCC] focus:outline-none focus:border-[#111]" />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-[#111] text-white rounded-xl py-2.5 text-xs font-bold hover:bg-[#222] transition-all font-display disabled:opacity-40">
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create GOAT →'}
          </button>
          {editingId && (
            <button onClick={() => { setEditingId(null); setForm(emptyForm()) }}
              className="px-4 rounded-xl border border-[#E5E5E5] text-xs font-bold text-[#888] hover:text-[#111] font-label">
              Cancel
            </button>
          )}
        </div>
        {ratedSubjects.length > 0 && (
          <p className="text-[11px] text-[#888] font-label">Rated in: {ratedSubjects.join(', ')}</p>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
          <div className="w-6 h-6 border-2 border-[#111] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-[#CCC] text-sm font-label">Loading…</p>
        </div>
      ) : goats.length === 0 ? (
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
          <p className="text-[#CCC] text-sm font-label">No GOATs yet — create the first one above</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {goats.map((g) => {
            const subs = Object.keys(g.stars || {})
            const open = !!expanded[g.id]
            return (
              <div key={g.id} className="bg-white border border-[#EBEBEB] rounded-xl p-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#111] font-display truncate">{g.name}</p>
                    <p className="text-[11px] text-[#888] font-label">{g.profession || '—'} · {subs.length} subject{subs.length === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => handleEdit(g)} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-[#E5E5E5] text-[#555] hover:text-[#111] font-label">Edit</button>
                    <button onClick={() => handleDelete(g)} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 font-label">Delete</button>
                    <button onClick={() => setExpanded((p) => ({ ...p, [g.id]: !open }))} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-[#F3F3F2] text-[#555] font-label">{open ? '▲' : '▼'}</button>
                  </div>
                </div>
                {open && (
                  <div className="mt-3 pt-3 border-t border-[#F3F3F2] space-y-1.5">
                    {subs.map((s) => (
                      <div key={s} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-[#555] font-body">{s}</span>
                        <span className="font-label">{'⭐'.repeat(g.stars[s] || 0)}</span>
                      </div>
                    ))}
                    {subs.some((s) => g.explanations?.[s]) && (
                      <p className="text-[10px] text-[#AAA] font-label pt-1">Explanations saved for: {subs.filter((s) => g.explanations?.[s]).join(', ')}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
