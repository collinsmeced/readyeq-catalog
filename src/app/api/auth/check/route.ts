import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE_NAME } from '@/lib/auth-cookie'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  }
  if (password !== adminPassword) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  // Set HttpOnly cookie so future requests (server components, server actions)
  // are authenticated without the client re-sending the password each time.
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE_NAME, adminPassword, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,  // 7 days
  })
  return res
}
