// Persistence for opt-in prompts.
//
// Both the iOS install hint and the notification prompt were re-shown on every
// page load: the hint was re-derived from the user agent each time and nothing
// recorded a dismissal, so tapping the × brought it straight back. Users who
// never want to install the app had no way to make it stop — the worst kind of
// nagging, since iOS push genuinely cannot work without installing.
//
// A dismissal is permanent by design. Re-asking someone to install a PWA on
// their phone every session is not persuasion, it is pressure, and they can
// always install later from their browser's own share sheet.

const PREFIX = '274lab_dismissed_'

export function isPromptDismissed(key) {
  try {
    return localStorage.getItem(PREFIX + key) === '1'
  } catch {
    return false
  }
}

export function dismissPrompt(key) {
  try {
    localStorage.setItem(PREFIX + key, '1')
  } catch { /* private mode — prompt simply reappears, no worse than before */ }
}

export function resetPromptDismissals() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k))
  } catch { /* ignore */ }
}