/**
 * Admin auth via HttpOnly cookie.
 *
 * Flow:
 *  1. User enters password on /admin or /admin/review
 *  2. POST /api/auth/check verifies vs ADMIN_PASSWORD env, sets cookie
 *  3. Server components + actions read the cookie via isAdminAuthed()
 *  4. Cookie is HttpOnly so client JS can't exfiltrate it
 *
 * Cookie value = ADMIN_PASSWORD (raw). Same security as sending the password
 * on every request, just easier to consume. Vercel forces HTTPS; cookie is
 * HttpOnly + Secure + SameSite=Lax.
 */

import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin-auth'

export async function isAdminAuthed(): Promise<boolean> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(COOKIE_NAME)
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return false  // safety: never auth if env not set
  return cookie?.value === expected
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdminAuthed())) {
    throw new Error('Unauthorized')
  }
}

export { COOKIE_NAME as ADMIN_COOKIE_NAME }
