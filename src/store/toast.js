import { create } from 'zustand'

export const useToastStore = create((set) => ({
  message: '',
  type: 'error',
  visible: false,
  showToast: (message, type = 'error') => {
    set({ message, type, visible: true })
    setTimeout(() => set({ visible: false, message: '' }), 4000)
  },
  hideToast: () => set({ visible: false, message: '' }),
}))
