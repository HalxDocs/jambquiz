// src/services/pushNotifications.js

const VAPID_PUBLIC_KEY = 'BJV0OfUDKqQg7gPD1BusnRjhhc1fhjnheW6Ghp2W9T5squ3RhMZMrNVqHiCM0M3lOeJLaq_4K_Z3WL_0PcUn_Bg'
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

/**
 * Register for push notifications
 * The service worker is already registered by vite-plugin-pwa,
 * so we just need to subscribe to push.
 */
export async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] Not supported in this browser')
    return null
  }
  if (typeof Notification === 'undefined' || !('Notification' in window)) {
    console.warn('[Push] Notification not supported in this browser')
    return null
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.warn('[Push] Permission denied by user')
      return null
    }

    const registration = await navigator.serviceWorker.ready

    // Reuse existing subscription if VAPID key matches
    const existing = await registration.pushManager.getSubscription()
    if (existing) {
      const existingKey = existing.toJSON().applicationServerKey
      const currentKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      const same = existingKey && currentKey &&
        existingKey.reduce((a, b, i) => a && b === currentKey[i], true)
      if (same) return existing
      await existing.unsubscribe()
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
    console.log('[Push] Successfully subscribed')

    return subscription
  } catch {
    console.error('[Push] Registration failed')
    return null
  }
}

/**
 * Save push subscription to the Go backend (sole delivery path now).
 */
export async function savePushSubscriptionToFirestore(studentId, subscription) {
  if (!studentId || !subscription) return
  if (!API_BASE) return
  try {
    await fetch(`${API_BASE}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId,
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys,
      }),
    })
    console.log('[Push] Subscription saved')
  } catch {
    console.error('[Push] Failed to save subscription')
  }
}

/**
 * Notification cycle state is local-only now (server tracks its own).
 */
export async function saveNotificationStateToFirestore() {}

/**
 * Admin notification master switch is server-side now (no-op client-side).
 */
export async function saveAdminNotificationStateToFirestore() {}

/**
 * Trigger a local push notification
 * Works when app is in background or when service worker push fails
 */
export function sendLocalNotification(point) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return
  }

  const title = point.isQuestion
    ? `📝 Quick Question — ${point.subject}`
    : `📚 Key Point — ${point.subject}`

  const notification = new Notification(title, {
    body: point.point,
    icon: '/pwa-192x192.png',
    tag: `keypoint-${point.id}`,
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
  })

  notification.onclick = () => {
    window.focus()
    notification.close()
  }

  // Auto-close after 20 seconds
  setTimeout(() => notification.close(), 20000)
}

// Helper: convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}