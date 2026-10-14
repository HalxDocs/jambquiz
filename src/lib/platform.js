// Platform helpers shared by App and Dashboard.
//
// These were duplicated: App.jsx had its own copies for the install hint and
// Dashboard had a third inline version for the notification prompt. Two
// divergent definitions of "is this iOS and not installed" is how you end up
// stacking two overlapping prompts at the bottom of the screen.

export function isIos() {
  if (typeof navigator === 'undefined') return false
  // iPadOS 13+ reports a desktop user agent; touch points give it away.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// True when launched from the Home Screen rather than a browser tab.
export function isInStandaloneMode() {
  if (typeof window === 'undefined') return false
  return window.navigator.standalone === true ||
    !!window.matchMedia?.('(display-mode: standalone)').matches
}

// iOS only permits Web Push for a site added to the Home Screen. Anywhere else
// pushManager.subscribe() fails, so the UI must not offer an Enable button.
export function needsIosInstall() {
  return isIos() && !isInStandaloneMode()
}