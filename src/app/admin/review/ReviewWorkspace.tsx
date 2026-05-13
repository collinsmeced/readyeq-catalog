'use client'

import { useCallback, useEffect, useMemo, useState, useTransition, useRef } from 'react'
import Image from 'next/image'
import {
  approveProduct, rejectProduct, flagProduct, saveEdits,
  reenrichProduct, findProduct, loadProduct,
  type EditableFields,
} from './actions'

// ─── Types ─────────────────────────────────────────────────────────────
export interface QueueItem {
  id: string
  make: string
  part_number: string
  series: string | null
  display_name: string | null
  short_description: string | null
  description: string | null
  specs: Record<string, string>
  features: string[]
  category: string
  list_price_cents: number
  availability: string
  condition: string
  image_url: string | null
  source_url: string | null
  source_snapshot: string | null
  review_status: string
  is_active: boolean
  enrichment_log: any[]
  human_edited_fields: string[]
  enriched_at: string | null
  updated_at: string
}

interface Props {
  queue: QueueItem[]
  totals: Record<string, number>
}

// ─── Component ─────────────────────────────────────────────────────────
export default function ReviewWorkspace({ queue: initialQueue, totals: initialTotals }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue)
  const [totals, setTotals] = useState<Record<string, number>>(initialTotals)
  const [selectedId, setSelectedId] = useState<string | null>(initialQueue[0]?.id ?? null)
  const [edits, setEdits] = useState<EditableFields>({})
  const [flash, setFlash] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Awaited<ReturnType<typeof findProduct>>>([])
  const [showSearch, setShowSearch] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const selected = useMemo(
    () => queue.find(p => p.id === selectedId) ?? null,
    [queue, selectedId],
  )

  const selectedIndex = useMemo(
    () => queue.findIndex(p => p.id === selectedId),
    [queue, selectedId],
  )

  const hasEdits = Object.keys(edits).length > 0

  // ─── Navigation ─────────────────────────────────────────────────────
  const goTo = useCallback((newId: string | null) => {
    if (hasEdits) {
      const ok = confirm('You have unsaved edits. Discard them?')
      if (!ok) return
    }
    setEdits({})
    setSelectedId(newId)
  }, [hasEdits])

  const goNext = useCallback(() => {
    if (queue.length === 0) return
    const i = queue.findIndex(p => p.id === selectedId)
    const next = queue[(i + 1) % queue.length]
    goTo(next?.id ?? null)
  }, [queue, selectedId, goTo])

  const goPrev = useCallback(() => {
    if (queue.length === 0) return
    const i = queue.findIndex(p => p.id === selectedId)
    const prev = queue[(i - 1 + queue.length) % queue.length]
    goTo(prev?.id ?? null)
  }, [queue, selectedId, goTo])

  // After approve/reject/flag/etc: remove from queue and advance
  const removeAndAdvance = useCallback((id: string, statusDelta: { from?: string; to: string }) => {
    setQueue(q => {
      const newQ = q.filter(p => p.id !== id)
      // Move selection to the next item that would have come after (or stay at index)
      if (selectedId === id) {
        const oldIdx = q.findIndex(p => p.id === id)
        const next = newQ[oldIdx] ?? newQ[oldIdx - 1] ?? null
        setSelectedId(next?.id ?? null)
      }
      return newQ
    })
    setTotals(t => {
      const newT = { ...t }
      if (statusDelta.from) newT[statusDelta.from] = Math.max(0, (newT[statusDelta.from] ?? 0) - 1)
      newT[statusDelta.to] = (newT[statusDelta.to] ?? 0) + 1
      return newT
    })
    setEdits({})
  }, [selectedId])

  // ─── Actions ────────────────────────────────────────────────────────
  const doApprove = useCallback(() => {
    if (!selected || pending) return

    // If there are unsaved edits, save them first then approve
    const saveAndApprove = async () => {
      if (hasEdits) {
        const r = await saveEdits(selected.id, edits)
        if (!r.ok) { setFlash({ kind: 'error', text: r.error || 'save failed' }); return }
      }
      const r = await approveProduct(selected.id)
      if (!r.ok) { setFlash({ kind: 'error', text: r.error || 'approve failed' }); return }
      setFlash({ kind: 'success', text: `Approved ${selected.make} ${selected.part_number}` })
      removeAndAdvance(selected.id, { from: selected.review_status, to: 'approved' })
    }
    startTransition(() => { saveAndApprove() })
  }, [selected, pending, hasEdits, edits, removeAndAdvance])

  const doReject = useCallback(() => {
    if (!selected || pending) return
    const yes = confirm(`Reject ${selected.make} ${selected.part_number}? This hides it from the live catalog.`)
    if (!yes) return
    startTransition(async () => {
      const r = await rejectProduct(selected.id)
      if (!r.ok) { setFlash({ kind: 'error', text: r.error || 'reject failed' }); return }
      setFlash({ kind: 'info', text: `Rejected ${selected.make} ${selected.part_number}` })
      removeAndAdvance(selected.id, { from: selected.review_status, to: 'rejected' })
    })
  }, [selected, pending, removeAndAdvance])

  const doFlag = useCallback(() => {
    if (!selected || pending) return
    startTransition(async () => {
      const r = await flagProduct(selected.id)
      if (!r.ok) { setFlash({ kind: 'error', text: r.error || 'flag failed' }); return }
      setFlash({ kind: 'info', text: `Flagged ${selected.make} ${selected.part_number}` })
      removeAndAdvance(selected.id, { from: selected.review_status, to: 'flagged' })
    })
  }, [selected, pending, removeAndAdvance])

  const doSave = useCallback(() => {
    if (!selected || pending || !hasEdits) return
    startTransition(async () => {
      const r = await saveEdits(selected.id, edits)
      if (!r.ok) { setFlash({ kind: 'error', text: r.error || 'save failed' }); return }
      // Optimistically merge edits into the in-memory queue item
      setQueue(q => q.map(p => p.id === selected.id
        ? { ...p, ...edits, human_edited_fields: Array.from(new Set([...p.human_edited_fields, ...Object.keys(edits)])) } as QueueItem
        : p,
      ))
      setEdits({})
      setFlash({ kind: 'success', text: 'Saved' })
    })
  }, [selected, pending, hasEdits, edits])

  const doReenrich = useCallback(() => {
    if (!selected || pending) return
    const yes = confirm(`Re-run Claude enrichment on ${selected.make} ${selected.part_number}? Takes ~30–90 seconds. Will overwrite non-human-edited fields with fresh data.`)
    if (!yes) return
    setFlash({ kind: 'info', text: `Re-enriching ${selected.make} ${selected.part_number} (~30–90s)…` })
    startTransition(async () => {
      const r = await reenrichProduct(selected.id)
      if (!r.ok) { setFlash({ kind: 'error', text: r.error || 'reenrich failed' }); return }
      // Reload the product
      const fresh = await loadProduct(selected.id)
      if (fresh) {
        if (fresh.review_status === 'approved') {
          // Auto-approved on this pass! Remove from queue.
          setFlash({ kind: 'success', text: `Re-enriched and auto-approved (${r.result?.confidence}, gate passed)` })
          removeAndAdvance(selected.id, { from: selected.review_status, to: 'approved' })
        } else if (fresh.review_status === 'flagged') {
          setFlash({ kind: 'info', text: 'Re-enriched: marked discontinued, moved to flagged' })
          removeAndAdvance(selected.id, { from: selected.review_status, to: 'flagged' })
        } else {
          setQueue(q => q.map(p => p.id === selected.id ? fresh : p))
          setFlash({ kind: 'info', text: `Re-enriched: confidence ${r.result?.confidence}, ${r.result?.passesGate ? 'gate passed' : 'gate failed — still for review'}` })
        }
      }
    })
  }, [selected, pending, removeAndAdvance])

  // ─── Find any product (escape hatch) ────────────────────────────────
  useEffect(() => {
    if (search.trim().length < 2) { setSearchResults([]); return }
    let cancelled = false
    const handle = setTimeout(async () => {
      const r = await findProduct(search)
      if (!cancelled) setSearchResults(r)
    }, 200)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [search])

  const openFromSearch = useCallback(async (id: string) => {
    setShowSearch(false)
    setSearch('')
    setSearchResults([])
    const fresh = await loadProduct(id)
    if (fresh) {
      // If it's already in the queue, just select it. Otherwise add to queue.
      if (queue.some(p => p.id === id)) {
        setSelectedId(id)
      } else {
        setQueue(q => [fresh, ...q])
        setSelectedId(id)
      }
      setFlash({ kind: 'info', text: `Loaded ${fresh.make} ${fresh.part_number}` })
    }
  }, [queue])

  // ─── Keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    function isEditableTarget(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === 's') {
          e.preventDefault()
          doSave()
        }
        return
      }
      if (showSearch && e.key === 'Escape') {
        e.preventDefault()
        setShowSearch(false)
        setSearch('')
        return
      }
      if (e.key === '/') {
        if (isEditableTarget(e)) return
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => searchRef.current?.focus(), 50)
        return
      }
      if (isEditableTarget(e)) return  // don't intercept letter keys while typing in a field
      const key = e.key.toLowerCase()
      if (key === 'j') { e.preventDefault(); goNext() }
      else if (key === 'k') { e.preventDefault(); goPrev() }
      else if (key === 'a') { e.preventDefault(); doApprove() }
      else if (key === 'r') { e.preventDefault(); doReject() }
      else if (key === 'f') { e.preventDefault(); doFlag() }
      else if (key === 'e') {
        e.preventDefault()
        const el = document.querySelector<HTMLInputElement>('[data-edit-focus]')
        el?.focus()
        el?.select?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, doApprove, doReject, doFlag, doSave, showSearch])

  // ─── Flash auto-dismiss ─────────────────────────────────────────────
  useEffect(() => {
    if (!flash) return
    const handle = setTimeout(() => setFlash(null), 2500)
    return () => clearTimeout(handle)
  }, [flash])

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar
        queueLen={queue.length}
        totals={totals}
        onSearchOpen={() => setShowSearch(true)}
      />

      {flash && (
        <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-md ${
          flash.kind === 'success' ? 'bg-green-100 text-green-900 border border-green-200'
          : flash.kind === 'error' ? 'bg-red-100 text-red-900 border border-red-200'
          : 'bg-blue-50 text-blue-900 border border-blue-200'
        }`}>
          {flash.text}
        </div>
      )}

      <div className="max-w-[1500px] mx-auto px-4 py-6">
        <div className="grid grid-cols-[280px_1fr] gap-6">
          <QueueSidebar
            queue={queue}
            selectedId={selectedId}
            onSelect={goTo}
          />
          <main>
            {selected ? (
              <ProductDetail
                key={selected.id}  // remount on product change to reset edit state
                product={selected}
                edits={edits}
                onEdit={setEdits}
                index={selectedIndex}
                total={queue.length}
                onPrev={goPrev}
                onNext={goNext}
                onApprove={doApprove}
                onReject={doReject}
                onFlag={doFlag}
                onSave={doSave}
                onReenrich={doReenrich}
                pending={pending}
                hasEdits={hasEdits}
              />
            ) : (
              <EmptyState />
            )}
          </main>
        </div>
      </div>

      {showSearch && (
        <SearchOverlay
          search={search}
          onSearch={setSearch}
          results={searchResults}
          onSelect={openFromSearch}
          onClose={() => { setShowSearch(false); setSearch('') }}
          inputRef={searchRef}
        />
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────

function TopBar({ queueLen, totals, onSearchOpen }: { queueLen: number; totals: Record<string, number>; onSearchOpen: () => void }) {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-[1500px] mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#0072bc] flex items-center justify-center rounded-sm">
              <span className="text-white font-black text-sm">R</span>
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">Review Queue</div>
              <div className="text-xs text-gray-500 leading-tight">Ready Equipment</div>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-4 text-sm">
            <Tally count={queueLen} label="in queue" color="text-gray-900" />
            <Dot />
            <Tally count={totals.approved ?? 0} label="approved" color="text-green-700" />
            <Dot />
            <Tally count={totals.flagged ?? 0} label="flagged" color="text-amber-700" />
            <Dot />
            <Tally count={totals.rejected ?? 0} label="rejected" color="text-gray-500" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onSearchOpen}
            className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1.5 border border-gray-200 rounded-md px-2.5 py-1 hover:bg-gray-50"
            title="Find any product (/)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            Find product
            <kbd className="text-[10px] bg-gray-100 px-1 py-0.5 rounded font-mono">/</kbd>
          </button>
          <a href="/" className="text-xs text-gray-500 hover:text-[#0072bc]">View catalog →</a>
        </div>
      </div>
    </header>
  )
}

function Tally({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <span className={`${color}`}>
      <span className="font-bold tabular-nums">{count}</span>
      <span className="text-gray-500 ml-1">{label}</span>
    </span>
  )
}

function Dot() {
  return <span className="text-gray-300">·</span>
}

function QueueSidebar({ queue, selectedId, onSelect }: { queue: QueueItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <aside className="bg-white border border-gray-200 rounded-xl overflow-hidden sticky top-[68px] self-start max-h-[calc(100vh-90px)] flex flex-col">
      <div className="px-3 py-2 border-b border-gray-200 text-xs font-semibold text-gray-700 bg-gray-50 flex items-center justify-between">
        <span>Queue</span>
        <span className="text-gray-500">{queue.length} items</span>
      </div>
      <div className="overflow-y-auto flex-1">
        {queue.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-gray-400">Queue is empty 🎉</div>
        ) : (
          queue.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`block w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                p.id === selectedId ? 'bg-blue-50 border-l-4 border-l-[#0072bc] pl-2' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[#0072bc] truncate">{p.make}</div>
                  <div className="text-xs font-medium text-gray-900 truncate">{p.display_name || p.part_number}</div>
                  <div className="text-[11px] text-gray-500 truncate">{p.part_number} · {p.category}</div>
                </div>
                {p.review_status === 'flagged' && (
                  <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full font-medium shrink-0">flagged</span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  )
}

function EmptyState() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-20 text-center">
      <div className="text-5xl mb-3">🎉</div>
      <h2 className="text-lg font-bold text-gray-900 mb-2">Queue is clear</h2>
      <p className="text-sm text-gray-500 mb-4">Nothing left to review. New products will appear here after the next import.</p>
      <a href="/" className="btn-primary inline-flex">View the live catalog</a>
    </div>
  )
}

// ─── Product detail ─────────────────────────────────────────────────────
function ProductDetail({
  product, edits, onEdit, index, total,
  onPrev, onNext, onApprove, onReject, onFlag, onSave, onReenrich,
  pending, hasEdits,
}: {
  product: QueueItem
  edits: EditableFields
  onEdit: (e: EditableFields) => void
  index: number; total: number
  onPrev: () => void; onNext: () => void
  onApprove: () => void; onReject: () => void; onFlag: () => void
  onSave: () => void; onReenrich: () => void
  pending: boolean; hasEdits: boolean
}) {
  const effective = (k: keyof EditableFields): any => (edits as any)[k] !== undefined ? (edits as any)[k] : (product as any)[k]
  const set = (k: keyof EditableFields, v: any) => onEdit({ ...edits, [k]: v })

  // Latest enrichment attempt for context
  const lastAttempt = useMemo(() => {
    const attempts = (product.enrichment_log || []).filter((e: any) => e?.prompt_version && !e?.kind)
    return attempts[attempts.length - 1] as any
  }, [product.enrichment_log])

  const initialSnapshot = useMemo(() => {
    return (product.enrichment_log || []).find((e: any) => e?.kind === 'initial-snapshot') as any
  }, [product.enrichment_log])

  const protectedFields = new Set(product.human_edited_fields)

  return (
    <article className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header: image + title + meta */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex gap-6">
          <div className="shrink-0 w-44 h-44 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden relative">
            {(effective('image_url') as string) ? (
              <Image
                src={effective('image_url') as string}
                alt={(effective('display_name') as string) || `${product.make} ${product.part_number}`}
                fill
                unoptimized
                className="object-contain p-3"
                sizes="176px"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-xs">no image</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#0072bc]">{product.make}</div>
                <h1 className="text-xl font-black text-gray-900 leading-tight mt-0.5 truncate">{effective('display_name') || `${product.make} ${product.part_number}`}</h1>
                <div className="text-xs text-gray-500 mt-1">
                  <span className="font-mono">{product.part_number}</span>
                  {effective('series') && <> · series: <span className="font-medium text-gray-700">{effective('series')}</span></>}
                  {' · '}{product.category}
                  {' · '}{product.list_price_cents > 0 ? `$${(product.list_price_cents/100).toFixed(0)}` : 'no price'}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={product.review_status} />
                {lastAttempt && <ConfidenceBadge confidence={lastAttempt.confidence} passes_gate={lastAttempt.passes_gate} />}
              </div>
            </div>

            {/* Source URL — the key verification link */}
            <div className="mt-3 flex items-center gap-2">
              {effective('source_url') ? (
                <a
                  href={effective('source_url') as string}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[#0072bc] hover:underline inline-flex items-center gap-1 truncate max-w-md"
                  title={effective('source_url') as string}
                >
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  <span className="truncate">{effective('source_url')}</span>
                </a>
              ) : (
                <span className="text-xs text-gray-400 italic">no source URL — re-enrich or paste one</span>
              )}
            </div>

            {/* Reviewer notes from last enrichment attempt */}
            {lastAttempt?.confidence_notes && (
              <details className="mt-2 text-xs text-gray-600">
                <summary className="cursor-pointer hover:text-gray-900">Claude's notes</summary>
                <p className="mt-1 text-gray-500 leading-relaxed bg-gray-50 rounded p-2 border border-gray-100 whitespace-pre-wrap">
                  {lastAttempt.confidence_notes}
                </p>
              </details>
            )}
          </div>
        </div>
      </div>

      {/* Editable content */}
      <div className="p-6 space-y-5">
        <EditableLine
          label="Display name"
          value={effective('display_name') ?? ''}
          onChange={v => set('display_name', v)}
          protected={protectedFields.has('display_name')}
          dataEditFocus
          previous={initialSnapshot?.content?.display_name}
        />
        <EditableLine
          label="Series"
          value={effective('series') ?? ''}
          placeholder="(empty)"
          onChange={v => set('series', v || null)}
          protected={protectedFields.has('series')}
        />
        <EditableArea
          label="Short description"
          rows={2}
          value={effective('short_description') ?? ''}
          onChange={v => set('short_description', v)}
          protected={protectedFields.has('short_description')}
          previous={initialSnapshot?.content?.short_description}
        />
        <EditableArea
          label="Description"
          rows={5}
          value={effective('description') ?? ''}
          onChange={v => set('description', v)}
          protected={protectedFields.has('description')}
          previous={initialSnapshot?.content?.description}
        />

        <SpecsEditor
          value={(effective('specs') as Record<string, string>) ?? {}}
          onChange={v => set('specs', v)}
          protected={protectedFields.has('specs')}
        />

        <FeaturesEditor
          value={(effective('features') as string[]) ?? []}
          onChange={v => set('features', v)}
          protected={protectedFields.has('features')}
        />

        <EditableLine
          label="Image URL"
          value={effective('image_url') ?? ''}
          placeholder="https://..."
          onChange={v => set('image_url', v || null)}
          protected={protectedFields.has('image_url')}
          mono
        />
      </div>

      {/* Action bar */}
      <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs text-gray-500 tabular-nums">
            {total > 0 ? <>Reviewing {index + 1} of {total}</> : 'Queue empty'}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onPrev}
              disabled={pending || total <= 1}
              className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1.5 rounded disabled:opacity-40"
              title="Previous (K)"
            >← Prev</button>
            <button
              onClick={onReject}
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40"
              title="Reject — hide from catalog (R)"
            >Reject</button>
            <button
              onClick={onFlag}
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-40"
              title="Flag for later (F)"
            >Flag</button>
            <button
              onClick={onReenrich}
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              title="Re-run Claude enrichment"
            >↻ Re-enrich</button>
            {hasEdits && (
              <button
                onClick={onSave}
                disabled={pending}
                className="text-xs px-3 py-1.5 rounded border border-[#0072bc] text-[#0072bc] hover:bg-blue-50 font-semibold disabled:opacity-40"
                title="Save edits (⌘S)"
              >Save edits</button>
            )}
            <button
              onClick={onApprove}
              disabled={pending}
              className="text-xs px-4 py-1.5 rounded bg-[#0072bc] text-white hover:bg-[#005b95] font-semibold disabled:opacity-40 inline-flex items-center gap-1"
              title="Approve (A)"
            >
              <span className="text-base leading-none">✓</span> Approve
            </button>
            <button
              onClick={onNext}
              disabled={pending || total <= 1}
              className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1.5 rounded disabled:opacity-40"
              title="Next (J)"
            >Next →</button>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-gray-400 text-right">
          <kbd className="font-mono">J</kbd>/<kbd className="font-mono">K</kbd> next/prev · <kbd className="font-mono">A</kbd> approve · <kbd className="font-mono">F</kbd> flag · <kbd className="font-mono">R</kbd> reject · <kbd className="font-mono">⌘S</kbd> save · <kbd className="font-mono">/</kbd> find
        </div>
      </div>
    </article>
  )
}

// ─── Editable fields ────────────────────────────────────────────────────
function FieldHeader({ label, protectedFlag }: { label: string; protectedFlag?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</label>
      {protectedFlag && <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">human-edited (protected)</span>}
    </div>
  )
}

function EditableLine(props: {
  label: string
  value: string
  placeholder?: string
  onChange: (v: string) => void
  protected?: boolean
  dataEditFocus?: boolean
  mono?: boolean
  previous?: string | null
}) {
  const { label, value, placeholder, onChange, protected: protectedFlag, dataEditFocus, mono, previous } = props
  const hasPrevious = previous != null && previous !== value
  return (
    <div>
      <FieldHeader label={label} protectedFlag={protectedFlag} />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        data-edit-focus={dataEditFocus ? '' : undefined}
        className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0072bc] focus:border-transparent ${mono ? 'font-mono text-xs' : ''}`}
      />
      {hasPrevious && (
        <div className="mt-1 text-[11px] text-gray-400">
          <span className="text-gray-500">was:</span> <span className="line-through">{previous}</span>
        </div>
      )}
    </div>
  )
}

function EditableArea(props: {
  label: string
  value: string
  rows?: number
  placeholder?: string
  onChange: (v: string) => void
  protected?: boolean
  previous?: string | null
}) {
  const { label, value, rows = 3, placeholder, onChange, protected: protectedFlag, previous } = props
  const hasPrevious = previous != null && previous !== value
  return (
    <div>
      <FieldHeader label={label} protectedFlag={protectedFlag} />
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0072bc] focus:border-transparent leading-relaxed"
      />
      {hasPrevious && (
        <details className="mt-1 text-[11px]">
          <summary className="text-gray-500 cursor-pointer hover:text-gray-700">show previous</summary>
          <div className="mt-1 text-gray-500 bg-gray-50 rounded p-2 border border-gray-100">{previous}</div>
        </details>
      )}
    </div>
  )
}

function SpecsEditor({ value, onChange, protected: protectedFlag }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void; protected?: boolean }) {
  const entries = Object.entries(value)
  const updateKey = (oldKey: string, newKey: string) => {
    if (newKey === oldKey) return
    const next: Record<string, string> = {}
    for (const [k, v] of Object.entries(value)) next[k === oldKey ? newKey : k] = v
    onChange(next)
  }
  const updateValue = (key: string, newValue: string) => onChange({ ...value, [key]: newValue })
  const remove = (key: string) => {
    const { [key]: _, ...rest } = value
    onChange(rest)
  }
  const add = () => {
    let i = 1
    while (`Spec ${i}` in value) i++
    onChange({ ...value, [`Spec ${i}`]: '' })
  }
  return (
    <div>
      <FieldHeader label={`Specs (${entries.length})`} protectedFlag={protectedFlag} />
      <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
        {entries.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-gray-400">no specs</div>
        ) : entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 group">
            <input
              type="text"
              defaultValue={k}
              onBlur={e => updateKey(k, e.target.value)}
              className="text-xs font-medium text-gray-700 bg-transparent border-0 px-2 py-1 w-2/5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0072bc] rounded"
            />
            <input
              type="text"
              value={v}
              onChange={e => updateValue(k, e.target.value)}
              className="text-xs text-gray-600 bg-transparent border-0 px-2 py-1 flex-1 focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0072bc] rounded"
            />
            <button onClick={() => remove(k)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-xs px-1" title="Remove">×</button>
          </div>
        ))}
      </div>
      <button onClick={add} className="mt-1.5 text-[11px] text-[#0072bc] hover:underline">+ Add spec</button>
    </div>
  )
}

function FeaturesEditor({ value, onChange, protected: protectedFlag }: { value: string[]; onChange: (v: string[]) => void; protected?: boolean }) {
  const update = (i: number, newValue: string) => onChange(value.map((v, j) => j === i ? newValue : v))
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i))
  const add = () => onChange([...value, ''])
  return (
    <div>
      <FieldHeader label={`Features (${value.length})`} protectedFlag={protectedFlag} />
      <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
        {value.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-gray-400">no features</div>
        ) : value.map((f, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 group">
            <span className="text-gray-300 text-xs">•</span>
            <input
              type="text"
              value={f}
              onChange={e => update(i, e.target.value)}
              className="text-xs text-gray-700 bg-transparent border-0 px-2 py-1 flex-1 focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0072bc] rounded"
            />
            <button onClick={() => remove(i)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-xs px-1" title="Remove">×</button>
          </div>
        ))}
      </div>
      <button onClick={add} className="mt-1.5 text-[11px] text-[#0072bc] hover:underline">+ Add feature</button>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    unreviewed: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Unreviewed' },
    enriched:   { bg: 'bg-blue-50',  text: 'text-blue-700', label: 'For review' },
    approved:   { bg: 'bg-green-100', text: 'text-green-800', label: 'Approved' },
    flagged:    { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Flagged' },
    rejected:   { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Rejected' },
  }
  const s = map[status] || map.unreviewed
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text}`}>{s.label}</span>
}

function ConfidenceBadge({ confidence, passes_gate }: { confidence: string | null; passes_gate?: boolean }) {
  if (!confidence) return null
  const map: Record<string, { bg: string; text: string }> = {
    high:   { bg: 'bg-emerald-100', text: 'text-emerald-800' },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    low:    { bg: 'bg-gray-100', text: 'text-gray-600' },
  }
  const s = map[confidence] || map.low
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text}`} title={passes_gate ? 'passes auto-approval gate' : 'gate not satisfied'}>
      {confidence}{passes_gate ? ' ✓' : ''}
    </span>
  )
}

function SearchOverlay({
  search, onSearch, results, onSelect, onClose, inputRef,
}: {
  search: string
  onSearch: (s: string) => void
  results: { id: string; make: string; part_number: string; display_name: string | null; review_status: string }[]
  onSelect: (id: string) => void
  onClose: () => void
  inputRef: React.MutableRefObject<HTMLInputElement | null>
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-start justify-center pt-24" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input
            ref={inputRef}
            autoFocus
            type="text"
            placeholder="Find any product by make, part #, series, or name…"
            value={search}
            onChange={e => onSearch(e.target.value)}
            className="flex-1 text-sm bg-transparent border-0 focus:outline-none"
          />
          <kbd className="text-[10px] text-gray-400 font-mono">Esc</kbd>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-gray-400">
              {search.length < 2 ? 'Type at least 2 characters' : 'No matches'}
            </div>
          ) : results.map(r => (
            <button
              key={r.id}
              onClick={() => onSelect(r.id)}
              className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-gray-900 truncate">{r.display_name || `${r.make} ${r.part_number}`}</div>
                <div className="text-[11px] text-gray-500 truncate">{r.make} · {r.part_number}</div>
              </div>
              <StatusBadge status={r.review_status} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
