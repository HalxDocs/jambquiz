import { create } from 'zustand'

const readTheme = () => {
  if (typeof localStorage === 'undefined') return 'dark'
  return localStorage.getItem('app_theme') === 'light' ? 'light' : 'dark'
}

export const useThemeStore = create((set, get) => ({
  theme: readTheme(),
  setTheme: (t) => {
    try { localStorage.setItem('app_theme', t) } catch {}
    set({ theme: t })
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
    return next
  },
}))
