const FACE_ENROLLMENT_DEFERRED_KEY = 'streakmeet_face_enrollment_deferred'

export function isFaceEnrollmentDeferred(): boolean {
  return localStorage.getItem(FACE_ENROLLMENT_DEFERRED_KEY) === '1'
}

export function deferFaceEnrollment(): void {
  localStorage.setItem(FACE_ENROLLMENT_DEFERRED_KEY, '1')
}

export function clearFaceEnrollmentDefer(): void {
  localStorage.removeItem(FACE_ENROLLMENT_DEFERRED_KEY)
}
