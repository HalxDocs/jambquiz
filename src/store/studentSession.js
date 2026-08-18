// Holds the signed-in student's Firebase UID for convenience. The authoritative
// session is Firebase Auth (see onAuthStateChanged in App.jsx); this is just an
// in-memory mirror so non-React modules can read the current UID without
// importing auth directly. Not persisted (Firebase Auth persists itself).
let _studentUid = ''

// Set only during an in-progress registration. `onAuthStateChanged` in App.jsx
// uses this to avoid flashing the dashboard between createUser and the control
// hand-off to the Supporters step.
let _registering = false

export function setStudentUid(uid) {
  _studentUid = uid || ''
}

export function getStudentUid() {
  return _studentUid
}

export function clearStudentUid() {
  _studentUid = ''
}

export function setRegistering(v) {
  _registering = !!v
}

export function isRegistering() {
  return _registering
}
