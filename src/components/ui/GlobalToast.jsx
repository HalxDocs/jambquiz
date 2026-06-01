import { useToastStore } from '../../store/toast'

export default function GlobalToast() {
  const { message, type, visible, hideToast } = useToastStore()
  if (!visible) return null

  const styles = {
    error: { bg: 'bg-red-600', icon: '✕' },
    success: { bg: 'bg-green-700', icon: '✓' },
    info: { bg: 'bg-[#111]', icon: 'ℹ' },
  }
  const s = styles[type] || styles.info

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm animate-fade-in">
      <div className={`${s.bg} text-white rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-3`}>
        <span className="text-sm font-bold shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-white/20">{s.icon}</span>
        <p className="flex-1 text-sm font-semibold font-display leading-snug">{message}</p>
        <button onClick={hideToast} className="text-white/60 hover:text-white text-lg leading-none shrink-0 transition-colors">×</button>
      </div>
    </div>
  )
}
