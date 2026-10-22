// Tests for the push subscription key comparison.
//
// Run: node --input-type=module < this file
//
// The comparison decides whether a student keeps receiving notifications, and
// it was wrong in two separate ways: it read the key from toJSON() (which
// Chrome does not include) and it never compared lengths. Both bugs made a
// live subscription look stale, or a stale one look current, in ways that
// only showed up as "push silently does not work".

import {
  VAPID_PUBLIC_KEY,
  isSubscriptionCurrent,
  subscriptionKeyBytes,
  urlBase64ToUint8Array,
} from '../src/lib/pushKey.js'

let pass = 0
let fail = 0
function check(name, cond) {
  if (cond) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name}`)
  }
}

// The keys this project has shipped over time. Anything but the current one
// must be detected as stale.
const OLD_KEYS = {
  original: 'BDjWG8ZcgvC2OmcHjvxRUak4DVafBt-RFjMQLqRNobFvnfKZGETpOpu6XrhLuJ5i9690jgPnO3HvAdcdD-Shruw',
  second: 'BJV0OfUDKqQg7gPD1BusnRjhhc1fhjnheW6Ghp2W9T5squ3RhMZMrNVqHiCM0M3lOeJLaq_4K_Z3WL_0PcUn_Bg',
  swapped: '2lM9ITz7-7EpeEbbVxB7U2uraNGDisgIM3yn4lnPmEM',
}

// Chrome hands back an ArrayBuffer for options.applicationServerKey.
function chromeStyle(key) {
  const bytes = urlBase64ToUint8Array(key)
  return { options: { applicationServerKey: bytes.buffer } }
}
// Firefox hands back a Uint8Array.
function firefoxStyle(key) {
  return { options: { applicationServerKey: urlBase64ToUint8Array(key) } }
}

console.log('subscription key comparison')
check('current key is accepted (Chrome ArrayBuffer)', isSubscriptionCurrent(chromeStyle(VAPID_PUBLIC_KEY)))
check('current key is accepted (Firefox Uint8Array)', isSubscriptionCurrent(firefoxStyle(VAPID_PUBLIC_KEY)))

for (const [label, key] of Object.entries(OLD_KEYS)) {
  check(`older key "${label}" is rejected (Chrome)`, !isSubscriptionCurrent(chromeStyle(key)))
  check(`older key "${label}" is rejected (Firefox)`, !isSubscriptionCurrent(firefoxStyle(key)))
}

check('the swapped key (private scalar as public) is rejected',
  !isSubscriptionCurrent(chromeStyle(OLD_KEYS.swapped)))

// A subscription with no key at all must be treated as stale so the client
// re-subscribes rather than assuming it is fine.
check('missing options is rejected', !isSubscriptionCurrent({}))
check('missing applicationServerKey is rejected',
  !isSubscriptionCurrent({ options: { userVisibleOnly: true } }))
check('undefined subscription is rejected', !isSubscriptionCurrent(undefined))

// Length mismatch must not pass. The old code compared element by element
// without checking length, so a shorter key compared equal over its own
// length.
const shortKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY).slice(0, 32)
check('truncated key is rejected',
  !isSubscriptionCurrent({ options: { applicationServerKey: shortKey.buffer } }))

// A key that matches in its first bytes but differs later must be rejected.
const almost = Uint8Array.from(urlBase64ToUint8Array(VAPID_PUBLIC_KEY))
almost[almost.length - 1] ^= 0xff
check('near-miss key is rejected',
  !isSubscriptionCurrent({ options: { applicationServerKey: almost.buffer } }))

// toJSON() must not be consulted — Chrome omits applicationServerKey there.
check('toJSON-only subscription is rejected',
  !isSubscriptionCurrent({
    toJSON: () => ({ endpoint: 'https://x', keys: { p256dh: 'a', auth: 'b' } }),
    options: {},
  }))

check('subscriptionKeyBytes returns null for a missing key',
  subscriptionKeyBytes({ options: {} }) === null)
check('subscriptionKeyBytes reads Chrome ArrayBuffer',
  subscriptionKeyBytes(chromeStyle(VAPID_PUBLIC_KEY))?.length === 65)

// The published key must be the 65-byte uncompressed P-256 point. The
// swapped key was only 32 bytes, which is why the server was answering 403.
check('current public key decodes to 65 bytes',
  urlBase64ToUint8Array(VAPID_PUBLIC_KEY).length === 65)
check('swapped key decodes to 32 bytes (the private scalar)',
  urlBase64ToUint8Array(OLD_KEYS.swapped).length === 32)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
