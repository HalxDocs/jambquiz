// src/services/pushNotifications.js

import {
  VAPID_PUBLIC_KEY,
  isSubscriptionCurrent,
  urlBase64ToUint8Array,
} from '../lib/pushKey'

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

/**
 * Get a subscription that is bound to the current VAPID key, creating one if
 * needed. A subscription left over from an older key is unsubscribed first:
 * Chrome keeps the old endpoint alive when you subscribe again, so without
 * the explicit unsubscribe the stale row stays and keeps 403ing.
 */
export async function subscribeWithCurrentKey(registration) {
  const current = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  const existing = await registration.pushManager.getSubscription()
  if (existing && isSubscriptionCurrent(existing)) return existing
  if (existing) {
    try {
      await existing.unsubscribe()
      console.log('[Push] Re-subscribing: stored subscription used an older VAPID key')
    } catch {
      // A failed unsubscribe is not fatal — subscribing again still yields a
      // subscription bound to the current key.
    }
  }
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: current,
  })
}

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
    const subscription = await subscribeWithCurrentKey(registration)
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
