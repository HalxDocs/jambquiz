// Global dark-mode overrides. Applied to <body class="app-dark"> across all
// app views (everything except the public landing page, which has its own
// dark styling). This mirrors the old per-page auth-dark / dashboard-dark
// injections but covers every page in one place.

export const DARK_CSS = `
  body.app-dark { background: #0A0A0A !important; }

  body.app-dark .bg-\\[\\#F8F8F7\\] { background: #0A0A0A !important; }
  body.app-dark .bg-white { background-color: #161616 !important; }
  body.app-dark .bg-\\[\\#F3F3F2\\] { background-color: #1A1A1A !important; }
  body.app-dark .bg-\\[\\#FAFAF9\\] { background-color: #1A1A1A !important; }
  body.app-dark .bg-\\[\\#F5F5F5\\] { background-color: #1A1A1A !important; }
  body.app-dark .bg-\\[\\#EBEBEB\\] { background-color: #2A2A2A !important; }
  body.app-dark .bg-\\[\\#E5E5E5\\] { background-color: #2A2A2A !important; }
  body.app-dark .bg-\\[\\#F0F0F0\\] { background-color: #2A2A2A !important; }
  body.app-dark .bg-\\[\\#DDD\\] { background-color: #2A2A2A !important; }
  body.app-dark .bg-\\[\\#FFF8E7\\] { background-color: #2A2410 !important; }
  body.app-dark .bg-red-50 { background-color: #2A1414 !important; }
  body.app-dark .bg-red-100 { background-color: #3A1A1A !important; }
  body.app-dark .bg-green-50 { background-color: #14241A !important; }
  body.app-dark .bg-green-100 { background-color: #1A3A2A !important; }
  body.app-dark .bg-yellow-50 { background-color: #2A2410 !important; }
  body.app-dark .bg-yellow-100 { background-color: #3A2E12 !important; }
  body.app-dark .bg-amber-50 { background-color: #2A2410 !important; }
  body.app-dark .bg-amber-100 { background-color: #3A2E12 !important; }
  body.app-dark .bg-blue-50 { background-color: #141E2A !important; }
  body.app-dark .bg-blue-100 { background-color: #1A2A3A !important; }
  body.app-dark .bg-orange-50 { background-color: #2A1A10 !important; }
  body.app-dark .bg-emerald-50 { background-color: #14241A !important; }
  body.app-dark .bg-violet-50 { background-color: #1E1626 !important; }
  body.app-dark .bg-purple-50 { background-color: #1E1626 !important; }
  body.app-dark .bg-purple-100 { background-color: #2A1A3A !important; }
  body.app-dark .bg-rose-50 { background-color: #2A1414 !important; }

  body.app-dark .text-\\[\\#111\\] { color: #EDEDED !important; }
  body.app-dark .text-\\[\\#333\\] { color: #DDD !important; }
  body.app-dark .text-\\[\\#555\\] { color: #AAA !important; }
  body.app-dark .text-\\[\\#666\\] { color: #999 !important; }
  body.app-dark .text-\\[\\#777\\] { color: #888 !important; }
  body.app-dark .text-\\[\\#888\\] { color: #888 !important; }
  body.app-dark .text-\\[\\#999\\] { color: #777 !important; }
  body.app-dark .text-\\[\\#AAA\\] { color: #777 !important; }
  body.app-dark .text-\\[\\#BBB\\] { color: #666 !important; }
  body.app-dark .text-\\[\\#CCC\\] { color: #666 !important; }
  body.app-dark .text-\\[\\#DDD\\] { color: #CCC !important; }

  body.app-dark .border-\\[\\#EBEBEB\\] { border-color: #2A2A2A !important; }
  body.app-dark .border-\\[\\#E5E5E5\\] { border-color: #2A2A2A !important; }
  body.app-dark .border-\\[\\#F3F3F2\\] { border-color: #2A2A2A !important; }
  body.app-dark .border-\\[\\#F0F0F0\\] { border-color: #2A2A2A !important; }
  body.app-dark .border-\\[\\#E8E8E8\\] { border-color: #2A2A2A !important; }
  body.app-dark .border-\\[\\#DDD\\] { border-color: #3A3A3A !important; }
  body.app-dark .border-\\[\\#CCC\\] { border-color: #3A3A3A !important; }
  body.app-dark .border-\\[\\#D0D0D0\\] { border-color: #3A3A3A !important; }
  body.app-dark .border-red-100 { border-color: #3A1A1A !important; }
  body.app-dark .border-green-100 { border-color: #1A3A2A !important; }
  body.app-dark .divide-\\[\\#F3F3F2\\] > :not([hidden]) ~ :not([hidden]) { border-color: #2A2A2A !important; }

  body.app-dark input { background-color: #161616 !important; color: #DDD !important; border-color: #2A2A2A !important; }
  body.app-dark select { background-color: #161616 !important; color: #DDD !important; border-color: #2A2A2A !important; }
  body.app-dark textarea { background-color: #161616 !important; color: #DDD !important; border-color: #2A2A2A !important; }
  body.app-dark select option { background-color: #161616 !important; color: #DDD !important; }
  body.app-dark input::placeholder { color: #666 !important; }
  body.app-dark textarea::placeholder { color: #666 !important; }
`

export function applyDarkTheme(isDark) {
  const existing = document.getElementById('app-dark-styles')
  if (isDark) {
    if (!existing) {
      const style = document.createElement('style')
      style.id = 'app-dark-styles'
      style.textContent = DARK_CSS
      document.head.appendChild(style)
    }
    document.body.classList.add('app-dark')
  } else {
    document.body.classList.remove('app-dark')
    if (existing) existing.remove()
  }
}
