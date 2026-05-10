import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  if (password === adminPassword) return NextResponse.json({ ok: true })
  return NextResponse.json({ ok: false }, { status: 401 })
}
