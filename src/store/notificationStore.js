// src/store/notificationStore.js
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const safeStorage = (() => {
  const mem = new Map()
  const memoryStorage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, v),
    removeItem: (k) => mem.delete(k),
  }
  const canUse = () => {
    try {
      const k = '__persist_test__'
      window.localStorage.setItem(k, '1')
      window.localStorage.removeItem(k)
      return true
    } catch {
      return false
    }
  }
  return {
    getItem: (k) => {
      try {
        return canUse() ? window.localStorage.getItem(k) : memoryStorage.getItem(k)
      } catch {
        return memoryStorage.getItem(k)
      }
    },
    setItem: (k, v) => {
      try {
        if (canUse()) window.localStorage.setItem(k, v)
        else memoryStorage.setItem(k, v)
      } catch {
        memoryStorage.setItem(k, v)
      }
    },
    removeItem: (k) => {
      try {
        if (canUse()) window.localStorage.removeItem(k)
        else memoryStorage.removeItem(k)
      } catch {
        memoryStorage.removeItem(k)
      }
    },
  }
})()

// Admin store
export const useAdminNotificationStore = create(
  persist(
    (set) => ({
      enabled: false,
      enabledSince: null,
      lastModifiedBy: null,

      toggle: (by) =>
        set((s) => ({
          enabled: !s.enabled,
          enabledSince: !s.enabled ? Date.now() : null,
          lastModifiedBy: by,
        })),
      enable: (by) =>
        set({
          enabled: true,
          enabledSince: Date.now(),
          lastModifiedBy: by,
        }),
      disable: (by) =>
        set({
          enabled: false,
          enabledSince: null,
          lastModifiedBy: by,
        }),
    }),
    {
      name: 'admin-notification-state',
      storage: createJSONStorage(() => safeStorage),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.warn('[persist-admin]', error)
      },
      version: 1,
    }
  )
)

// User notification tracking
export const useUserNotificationStore = create(
  persist(
    (set) => ({
      seenPoints: {},
      lastNotifiedAt: null,
      currentCycleIndex: 0,
      patchesActive: false,
      selectedPatchSubjects: [],
      pushPermission: 'default',
      pushSubscription: null,

      markSeen: (pointId) =>
        set((s) => ({
          seenPoints: {
            ...s.seenPoints,
            [pointId]: (s.seenPoints[pointId] || 0) + 1,
          },
          lastNotifiedAt: Date.now(),
        })),

      advanceCycle: (totalPoints) =>
        set((s) => ({
          currentCycleIndex: totalPoints > 0 ? (s.currentCycleIndex + 1) % totalPoints : 0,
        })),

      resetSeenPoints: (pointIds) => {
        const reset = {}
        pointIds.forEach((id) => { reset[id] = 0 })
        set({ seenPoints: reset, currentCycleIndex: 0 })
      },

      setPatchesActive: (active) => set({ patchesActive: active }),

      setSelectedPatchSubjects: (subjects) => set({ selectedPatchSubjects: subjects }),

      setPushPermission: (perm) => set({ pushPermission: perm }),

      setPushSubscription: (sub) => set({ pushSubscription: sub }),
    }),
    {
      name: 'user-notification-state',
      storage: createJSONStorage(() => safeStorage),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.warn('[persist-user]', error)
      },
      version: 1,
    }
  )
)