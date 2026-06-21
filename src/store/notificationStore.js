// src/store/notificationStore.js
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
    { name: 'admin-notification-state' }
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
      // Don't access localStorage during SSR
      storage: typeof window !== 'undefined' ? undefined : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    }
  )
)