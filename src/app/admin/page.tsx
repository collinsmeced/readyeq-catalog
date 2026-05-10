'use client'

import { useState, useRef } from 'react'

interface ImportResult {
  created: number
  updated: number
  skipped: number
  total: number
  errors: string[]
}

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState('')

  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    fetch('/api/auth/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) setAuthed(true)
        else setAuthError('Incorrect password')
      })
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return

    setImporting(true)
    setResult(null)
    setImportError('')

    const form = new FormData()
    form.append('file', file)
    form.append('password', password)

    try {
      const res = await fetch('/api/import', { method: 'POST', body: form })
      const data = await res.json()
      if (res.ok) {
        setResult(data)
        setFile(null)
        if (fileRef.current) fileRef.current.value = ''
      } else {
        setImportError(data.error || 'Import failed')
      }
    } catch (err) {
      setImportError('Network error')
    } finally {
      setImporting(false)
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white border border-gray-200 rounded-xl p-8 w-full max-w-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-[#0072bc] flex items-center justify-center rounded-sm">
              <span className="text-white font-black text-base">R</span>
            </div>
            <div>
              <div className="font-bold text-sm">Admin Panel</div>
              <div className="text-xs text-gray-500">Ready Equipment Catalog</div>
            </div>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0072bc]"
                placeholder="Enter admin password"
                required
              />
            </div>
            {authError && <p className="text-xs text-red-500">{authError}</p>}
            <button type="submit" className="btn-primary w-full justify-center">Sign In</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Admin — Catalog Import</h1>
          <p className="text-sm text-gray-500 mt-1">Upload your Flyntlok export to refresh inventory and add new products.</p>
        </div>
        <a href="/" className="text-sm text-[#0072bc] hover:underline">View Catalog →</a>
      </div>

      {/* Import card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">Import Inventory Export</h2>

        <form onSubmit={handleImport} className="space-y-4">
          <div
            className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center hover:border-[#0072bc] transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <div>
                <p className="font-semibold text-gray-900 text-sm">{file.name}</p>
                <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(0)} KB — click to change</p>
              </div>
            ) : (
              <div>
                <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm font-semibold text-gray-700">Drop your Flyntlok export here</p>
                <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, or .csv</p>
              </div>
            )}
          </div>

          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
            <p><strong>What this does:</strong></p>
            <p>• Deduplicates by Make + Model — one product row per unique combo</p>
            <p>• Updates In Stock / On Order counts from the new export</p>
            <p>• New models are added automatically</p>
            <p>• AI descriptions and photos are NOT overwritten</p>
          </div>

          {importError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {importError}
            </div>
          )}

          <button
            type="submit"
            disabled={!file || importing}
            className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? 'Importing...' : 'Run Import'}
          </button>
        </form>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <h3 className="font-bold text-green-900 mb-3">Import Complete</h3>
          <div className="grid grid-cols-4 gap-4 text-center">
            {[
              { label: 'Total Rows', value: result.total },
              { label: 'Created', value: result.created },
              { label: 'Updated', value: result.updated },
              { label: 'Skipped', value: result.skipped },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-lg p-3 border border-green-100">
                <div className="text-2xl font-black text-gray-900">{value}</div>
                <div className="text-xs text-gray-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
          {result.errors.length > 0 && (
            <div className="mt-4 text-xs text-red-600 space-y-1">
              {result.errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
