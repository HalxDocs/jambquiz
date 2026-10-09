// Holds the signed-in student's ID for convenience. The authoritative
// session is the Go JWT (see restoreSession in session.js); this is just an
// in-memory mirror so non-React modules can read the current ID.
let _studentUid = ''

// Set only during an in-progress registration. App.jsx uses this to avoid
// flashing the dashboard before the Supporters hand-off.
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
