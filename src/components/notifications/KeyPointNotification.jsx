// src/components/KeyPointNotification.jsx
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function KeyPointNotification({ point, onDismiss, patchesActive }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (point) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
        setTimeout(onDismiss, 300)
      }, 15000) // Auto-dismiss after 15 seconds
      return () => clearTimeout(timer)
    }
  }, [point])

  if (!point) return null

  const P = patchesActive
    ? { bg: 'bg-red-700', border: 'border-red-600', accent: 'text-red-300', text: 'text-white' }
    : { bg: 'bg-[#111]', border: 'border-[#333]', accent: 'text-[#888]', text: 'text-white' }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -100, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -100, opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-4 left-4 right-4 z-50 mx-auto max-w-md"
        >
          <div className={`${P.bg} ${P.border} border rounded-2xl p-4 shadow-2xl`}>
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {point.isQuestion ? '🤔' : patchesActive ? '🔴' : '📚'}
                </span>
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-widest font-label ${P.accent}`}>
                    {patchesActive ? 'PATCH ACTIVE' : 'Key Point'}
                  </p>
                  <p className={`text-[11px] font-semibold font-label ${P.accent}`}>
                    {point.subject}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setVisible(false)
                  setTimeout(onDismiss, 300)
                }}
                className={`${P.accent} hover:text-white text-lg leading-none transition-colors`}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <p className={`text-sm font-semibold leading-relaxed font-body mb-3 ${P.text}`}>
              {point.point}
            </p>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setVisible(false)
                  setTimeout(onDismiss, 300)
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold font-label transition-colors ${
                  patchesActive
                    ? 'bg-red-800 text-red-200 hover:bg-red-900'
                    : 'bg-[#222] text-[#AAA] hover:bg-[#333]'
                }`}
              >
                Got it
              </button>
              {point.isQuestion && (
                <button
                  onClick={() => {
                    setVisible(false)
                    setTimeout(onDismiss, 300)
                  }}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold font-label transition-colors ${
                    patchesActive
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-white text-[#111] hover:bg-[#F3F3F2]'
                  }`}
                >
                  Answer Now
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}