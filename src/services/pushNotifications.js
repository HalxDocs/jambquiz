// src/services/pushNotifications.js

const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY_HERE'

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

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.warn('[Push] Permission denied by user')
      return null
    }

    // Wait for the service worker to be ready (registered by vite-plugin-pwa)
    const registration = await navigator.serviceWorker.ready

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription()
    
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      console.log('[Push] Successfully subscribed')
    } else {
      console.log('[Push] Already subscribed')
    }

    return subscription
  } catch (err) {
    console.error('[Push] Registration failed:', err)
    return null
  }
}

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
    icon: '/icon-192.png',
    badge: '/badge-72.png',
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