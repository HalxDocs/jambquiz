// Push subscription key helpers.
//
// A push subscription is bound to the applicationServerKey it was created
// with. When the server signs a push with a different VAPID key, the push
// service refuses it — FCM answers 403 "Unauthorized push subscription" — so
// rotating the VAPID key silently kills every existing subscription until
// the browser re-subscribes with the new key.
//
// This lives apart from the notification service so it can be tested without
// a browser: the comparison is the part that decides whether a student keeps
// receiving notifications, and it was previously wrong in two separate ways.

// The VAPID public key the browser must subscribe with. The server holds the
// matching private key; the pair is also published by GET /api/push/vapid-key.
export const VAPID_PUBLIC_KEY = 'BJqD_ezLHEOxBYdQk3j2hNXfw1ENHoSJKYvSKqez-pYgWqiqS0DQQDbxP_1YmWqNgghItgbDjBhKrylOTselddw'

// Helper: convert VAPID key to Uint8Array
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = globalThis.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// The key a subscription was registered with, as bytes.
//
// It must be read from subscription.options. Reading it from toJSON() returns
// undefined on Chrome — PushSubscriptionJSON only carries endpoint,
// expirationTime and keys — so a comparison built on toJSON() compared
// against nothing and always looked stale.
//
// Chrome hands back an ArrayBuffer, Firefox a Uint8Array, and some browsers
// omit the field entirely.
export function subscriptionKeyBytes(subscription) {
  const raw = subscription?.options?.applicationServerKey
  if (!raw) return null
  if (raw instanceof Uint8Array) return raw
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw)
  if (ArrayBuffer.isView(raw)) {
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
  }
  return null
}

// True when the subscription was registered with the VAPID key we publish now.
export function isSubscriptionCurrent(subscription, publicKey = VAPID_PUBLIC_KEY) {
  const bytes = subscriptionKeyBytes(subscription)
  if (!bytes) return false
  const current = urlBase64ToUint8Array(publicKey)
  if (bytes.length !== current.length) return false
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== current[i]) return false
  }
  return true
}
