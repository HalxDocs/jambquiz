// src/services/pushNotifications.js
import { db, doc, setDoc, getDoc, collection, addDoc, getDocs, updateDoc } from '../firebase'

const VAPID_PUBLIC_KEY = 'BDjWG8ZcgvC2OmcHjvxRUak4DVafBt-RFjMQLqRNobFvnfKZGETpOpu6XrhLuJ5i9690jgPnO3HvAdcdD-Shruw'

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

    const registration = await navigator.serviceWorker.ready
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
 * Save push subscription to Firestore for server-side push delivery
 */
export async function savePushSubscriptionToFirestore(studentId, subscription) {
  if (!studentId || !subscription) return
  try {
    await setDoc(doc(db, 'push_subscriptions', studentId), {
      endpoint: subscription.endpoint,
      keys: subscription.toJSON().keys,
      updatedAt: new Date().toISOString(),
      studentId,
    })
    console.log('[Push] Subscription saved to Firestore')
  } catch (err) {
    console.error('[Push] Failed to save subscription to Firestore:', err)
  }
}

/**
 * Save notification cycle state to Firestore for server-side push
 */
export async function saveNotificationStateToFirestore(studentId, state) {
  if (!studentId) return
  try {
    await setDoc(doc(db, 'notification_state', studentId), {
      ...state,
      updatedAt: new Date().toISOString(),
      studentId,
    })
  } catch (err) {
    console.error('[Push] Failed to save notification state:', err)
  }
}

/**
 * Save admin notification master switch to Firestore
 */
export async function saveAdminNotificationStateToFirestore(enabled) {
  try {
    await setDoc(doc(db, 'admin_settings', 'notifications'), {
      enabled,
      updatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[Push] Failed to save admin state:', err)
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