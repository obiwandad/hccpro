import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { Icon } from '../lib/icons'

const BUCKET = 'allegati-merci'

const TAB_TUTTI = '__tutti__'

const fileTypeKey = (ct) => {
  const s = String(ct || '').toLowerCase()
  if (s.includes('pdf')) return 'pdf'
  if (s.includes('image')) return 'image'
  return 'other'
}

const fileIconName = (ct) => {
  const k = fileTypeKey(ct)
  if (k === 'image') return 'photo'
  if (k === 'pdf') return 'note'
  return 'file'
}

const TAG_COLORS = [
  { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  { dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200' },
  { dot: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-200' },
  { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' },
  { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-200' },
  { dot: 'bg-cyan-500', bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-cyan-200' },
]

const tagColor = (tag) => {
  const s = String(tag || '')
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0
  const idx = Math.abs(h) % TAG_COLORS.length
  return TAG_COLORS[idx]
}

const makeId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const hex = () => Math.floor(Math.random() * 16).toString(16)
  const s = (n) => Array.from({ length: n }, hex).join('')
  return `${s(8)}-${s(4)}-4${s(3)}-${((8 + Math.floor(Math.random() * 4))).toString(16)}${s(3)}-${s(12)}`
}

const defaultTitleFromFileName = (name) => {
  const n = String(name || '').replaceAll('/', '_')
  const base = n.replace(/\.[a-z0-9]{1,8}$/i, '')
  return base || n || 'Documento'
}

export default function Documentazione() {
  const { user } = useAuth()
  const { activeLocaleId, activeLocaleName, profilo } = useLocale()
  const localeId = activeLocaleId ?? profilo?.locale_id ?? null

  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState([])
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [tabAttiva, setTabAttiva] = useState(TAB_TUTTI)

  const [dateFilter, setDateFilter] = useState('all') // all | today | yesterday | week | last30 | this_month | last_month | this_year | last_year | range
  const [dateFrom, setDateFrom] = useState('') // YYYY-MM-DD
  const [dateTo, setDateTo] = useState('') // YYYY-MM-DD
  const [typeFilter, setTypeFilter] = useState('all') // all | pdf | image | other
  const [sortBy, setSortBy] = useState('date_desc') // date_desc | date_asc | title_asc | title_desc

  const [showUpload, setShowUpload] = useState(false)

  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  const [uploadError, setUploadError] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [tagChips, setTagChips] = useState([])
  const [uploadQueue, setUploadQueue] = useState([])

  const [selectedDoc, setSelectedDoc] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [copyOk, setCopyOk] = useState('')

  const fmt = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return isNaN(d)
      ? ''
      : d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const fetchDocs = async (lid) => {
    setError('')
    const { data, error: e } = await supabase
      .from('documenti')
      .select('id, locale_id, titolo, file_name, content_type, storage_bucket, storage_path, tags, created_at')
      .eq('locale_id', lid)
      .order('created_at', { ascending: false })
    if (e) { setError(e.message); setDocs([]); return }
    setDocs(data || [])
  }

  useEffect(() => {
    if (!user || !localeId) { setLoading(false); return }
    fetchDocs(localeId).then(() => setLoading(false))
  }, [user, localeId])

  // Ricava tab dalle tags esistenti
  const allTags = useMemo(() => {
    const s = new Set()
    for (const d of docs) for (const t of (d.tags || [])) s.add(String(t))
    return Array.from(s).sort((a, b) => a.localeCompare(b))
  }, [docs])

  const applyFilters = useCallback((list) => {
    const qq = q.trim().toLowerCase()
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const startOfYesterday = new Date(startOfToday)
    startOfYesterday.setDate(startOfYesterday.getDate() - 1)

    const startOfWeek = new Date(startOfToday)
    startOfWeek.setDate(startOfWeek.getDate() - 7)

    const startOfLast30 = new Date(startOfToday)
    startOfLast30.setDate(startOfLast30.getDate() - 30)

    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const startOfThisYear = new Date(now.getFullYear(), 0, 1)
    const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1)

    const parseYmd = (s) => {
      const v = String(s || '').trim()
      if (!v) return null
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!m) return null
      const y = Number(m[1])
      const mm = Number(m[2]) - 1
      const d = Number(m[3])
      const dt = new Date(y, mm, d)
      if (isNaN(dt)) return null
      if (dt.getFullYear() !== y || dt.getMonth() !== mm || dt.getDate() !== d) return null
      return dt
    }
    const fromDate = parseYmd(dateFrom)
    const toDate = parseYmd(dateTo)
    const toDateExclusive = toDate ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1) : null

    const res = list.filter((d) => {
      const hay = `${d.titolo || ''} ${d.file_name || ''}`.toLowerCase()
      const okQ = !qq || hay.includes(qq)
      const okTab = tabAttiva === TAB_TUTTI || (d.tags || []).map(x => String(x).toLowerCase()).includes(tabAttiva)

      const created = d.created_at ? new Date(d.created_at) : null
      const okDate = dateFilter === 'all'
        ? true
        : dateFilter === 'today'
          ? (created && created >= startOfToday)
          : dateFilter === 'yesterday'
            ? (created && created >= startOfYesterday && created < startOfToday)
            : dateFilter === 'week'
              ? (created && created >= startOfWeek)
              : dateFilter === 'last30'
                ? (created && created >= startOfLast30)
                : dateFilter === 'this_month'
                  ? (created && created >= startOfThisMonth)
                  : dateFilter === 'last_month'
                    ? (created && created >= startOfLastMonth && created < startOfThisMonth)
                    : dateFilter === 'this_year'
                      ? (created && created >= startOfThisYear)
                      : dateFilter === 'last_year'
                        ? (created && created >= startOfLastYear && created < startOfThisYear)
                        : dateFilter === 'range'
                          ? (
                            (!fromDate && !toDateExclusive)
                              ? true
                              : (
                                !created
                                  ? false
                                  : (!fromDate || created >= fromDate) && (!toDateExclusive || created < toDateExclusive)
                              )
                          )
                          : true

      const tk = fileTypeKey(d.content_type)
      const okType = typeFilter === 'all' ? true : tk === typeFilter

      return okQ && okTab && okDate && okType
    })

    const sorted = [...res]
    sorted.sort((a, b) => {
      if (sortBy === 'title_asc') return String(a.titolo || a.file_name || '').localeCompare(String(b.titolo || b.file_name || ''))
      if (sortBy === 'title_desc') return String(b.titolo || b.file_name || '').localeCompare(String(a.titolo || a.file_name || ''))
      if (sortBy === 'date_asc') return new Date(a.created_at || 0) - new Date(b.created_at || 0)
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    })
    return sorted
  }, [dateFilter, dateFrom, dateTo, q, sortBy, tabAttiva, typeFilter])

  const filtered = useMemo(() => {
    return applyFilters(docs)
  }, [applyFilters, docs])

  const addTag = (raw) => {
    const t = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '')
    if (!t) return
    setTagChips((prev) => {
      if (prev.includes(t)) return prev
      return [...prev, t].slice(0, 30)
    })
  }

  const removeTag = (t) => {
    setTagChips((prev) => prev.filter((x) => x !== t))
  }

  const onTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      addTag(tagDraft)
      setTagDraft('')
    }
    if (e.key === 'Backspace' && !tagDraft && tagChips.length > 0) {
      removeTag(tagChips[tagChips.length - 1])
    }
  }

  const addFilesToQueue = (files) => {
    const arr = Array.from(files || []).filter(Boolean)
    if (arr.length === 0) return
    setUploadError('')
    setUploadQueue((prev) => {
      const next = [...prev]
      for (const f of arr) {
        next.unshift({
          id: makeId(),
          file: f,
          titolo: defaultTitleFromFileName(f.name),
          tags: [...tagChips],
          status: 'ready', // ready | uploading | done | error
          progress: 0,
          error: '',
          doc: null,
        })
      }
      return next
    })
  }

  const updateQueueItem = (id, patch) => {
    setUploadQueue((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  const removeQueueItem = (id) => {
    setUploadQueue((prev) => prev.filter((it) => it.id !== id))
  }

  const uploadOne = async (it) => {
    if (!localeId) throw new Error('Seleziona un locale')
    if (!user?.id) throw new Error('Utente non disponibile')
    const safeName = String(it.file?.name || 'documento').replaceAll('/', '_')
    const path = `${localeId}/documentazione/${Date.now()}_${safeName}`

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, it.file, {
      contentType: it.file?.type || undefined,
      upsert: false,
    })
    if (upErr) throw upErr

    const payload = {
      locale_id: localeId,
      titolo: String(it.titolo || '').trim() || safeName,
      file_name: safeName,
      content_type: it.file?.type || '',
      storage_bucket: BUCKET,
      storage_path: path,
      tags: Array.isArray(it.tags) ? it.tags : [],
      uploaded_by: user.id,
    }
    const { data: ins, error: insErr } = await supabase
      .from('documenti')
      .insert(payload)
      .select('id, locale_id, titolo, file_name, content_type, storage_bucket, storage_path, tags, created_at')
      .single()

    if (insErr) {
      await supabase.storage.from(BUCKET).remove([path])
      throw insErr
    }

    return ins
  }

  const uploadQueueAll = async () => {
    if (!localeId) { setUploadError('Seleziona un locale'); return }
    const pending = uploadQueue.filter((x) => x.status === 'ready')
    if (pending.length === 0) { setUploadError('Nessun file da caricare'); return }
    setUploadError('')

    for (const it of pending) {
      updateQueueItem(it.id, { status: 'uploading', error: '' })
      try {
        const doc = await uploadOne(it)
        updateQueueItem(it.id, { status: 'done', doc })
        setDocs((prev) => [doc, ...prev])
      } catch (e) {
        updateQueueItem(it.id, { status: 'error', error: e?.message || 'Errore durante il caricamento' })
      }
    }
  }

  const openDoc = async (d) => {
    setError('')
    const w = window.open('about:blank', '_blank')
    const { data, error: e } = await supabase.storage.from(d.storage_bucket || BUCKET).createSignedUrl(d.storage_path, 300)
    if (e) {
      if (w) w.close()
      setError(e.message)
      return
    }
    if (!data?.signedUrl) {
      if (w) w.close()
      setError('Impossibile aprire il documento.')
      return
    }
    if (w) {
      w.location.href = data.signedUrl
    } else {
      window.location.href = data.signedUrl
      setError('Popup bloccato dal browser: apro il documento nella stessa scheda.')
    }
  }

  const copyLink = async (d) => {
    setError('')
    setCopyOk('')
    const { data, error: e } = await supabase.storage.from(d.storage_bucket || BUCKET).createSignedUrl(d.storage_path, 300)
    if (e) { setError(e.message); return }
    if (!data?.signedUrl) { setError('Impossibile generare il link.'); return }
    try {
      await navigator.clipboard.writeText(data.signedUrl)
      setCopyOk('Link copiato.')
    } catch {
      const ok = window.prompt('Copia il link:', data.signedUrl)
      if (ok != null) setCopyOk('Link pronto da copiare.')
    }
  }

  const deleteDoc = async (d) => {
    if (!confirm(`Eliminare "${d.titolo || d.file_name}"?`)) return
    setError('')
    try {
      const { error: dbErr } = await supabase.from('documenti').delete().eq('id', d.id)
      if (dbErr) { setError(dbErr.message || 'Errore durante l\'eliminazione.'); return }
      setDocs((prev) => prev.filter((x) => x.id !== d.id))
      const { error: stErr } = await supabase.storage.from(d.storage_bucket || BUCKET).remove([d.storage_path])
      if (stErr) setError('Documento rimosso dall’elenco, ma non riesco a cancellare il file dallo storage.')
    } finally {
      await fetchDocs(localeId)
      setDrawerOpen(false)
      setSelectedDoc(null)
    }
  }

  const openDrawer = (d) => {
    setCopyOk('')
    setSelectedDoc(d)
    setDrawerOpen(true)
  }

  return (
    <div>
      {/* Header con tab */}
      <div className="flex items-center justify-between mb-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5"><Icon name="documentazione" className="w-7 h-7 text-emerald-600" /> Documentazione</h1>
          <p className="text-gray-500 text-sm mt-0.5">{activeLocaleName || 'Seleziona un locale'}</p>
        </div>
        <button
          onClick={() => setShowUpload(v => !v)}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2"
        >
          {showUpload ? '✕ Chiudi' : '↑ Carica documento'}
        </button>
      </div>

      {/* Form upload collassabile */}
      {showUpload && (
        <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Carica nuovo documento</h2>
          {uploadError && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{uploadError}</div>}
          <div
            className={`mb-4 rounded-2xl border-2 border-dashed p-5 transition-colors ${
              dropActive ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-gray-50'
            }`}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDropActive(true) }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropActive(true) }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDropActive(false) }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDropActive(false)
              if (e.dataTransfer?.files?.length) addFilesToQueue(e.dataTransfer.files)
            }}
          >
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">Trascina qui i file</p>
                <p className="text-xs text-gray-500 mt-0.5">Oppure scegli un file o scatta una foto</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium transition-colors"
                >
                  Scegli file
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors"
                >
                  Scatta foto
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addFilesToQueue(e.target.files)
                  e.target.value = ''
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addFilesToQueue(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Tag</label>
              <div className="px-3 py-2 border border-gray-300 rounded-xl focus-within:ring-2 focus-within:ring-emerald-500 bg-white">
                <div className="flex flex-wrap gap-2">
                  {tagChips.map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => removeTag(t)}
                      className={`inline-flex items-center gap-2 text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full ring-1 ${tagColor(t).bg} ${tagColor(t).text} ${tagColor(t).ring} hover:opacity-90`}
                    >
                      {String(t).toUpperCase()}
                      <span className="text-xs leading-none">×</span>
                    </button>
                  ))}
                  <input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={onTagKeyDown}
                    className="min-w-[120px] flex-1 text-sm outline-none py-1"
                    placeholder={tagChips.length ? 'Aggiungi tag…' : 'Es. TEMPERATURE, DDT, HACCP…'}
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Suggerimento</label>
              <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                Titolo precompilato dal nome file. Tocca un elemento in coda per modificarlo.
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Azioni</label>
              <button
                type="button"
                onClick={uploadQueueAll}
                disabled={!uploadQueue.some((x) => x.status === 'ready') || !localeId}
                className={`w-full px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  !uploadQueue.some((x) => x.status === 'ready') || !localeId
                    ? 'bg-gray-100 text-gray-400'
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                }`}
              >
                Carica tutti
              </button>
            </div>
          </div>

          {uploadQueue.length > 0 ? (
            <div className="rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-sm font-semibold text-gray-700">
                Coda caricamenti
              </div>
              <div className="divide-y divide-gray-50">
                {uploadQueue.map((it) => {
                  const st = it.status
                  const badge = st === 'ready'
                    ? 'bg-gray-100 text-gray-600'
                    : st === 'uploading'
                      ? 'bg-amber-100 text-amber-700'
                      : st === 'done'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700'
                  return (
                    <div key={it.id} className="px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                          <Icon name={fileIconName(it.file?.type)} className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <input
                            value={it.titolo}
                            disabled={st === 'uploading' || st === 'done'}
                            onChange={(e) => updateQueueItem(it.id, { titolo: e.target.value })}
                            className="w-full text-sm font-semibold text-gray-800 bg-transparent border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:text-gray-500"
                          />
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-400 truncate">{it.file?.name}</span>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${badge}`}>{st === 'ready' ? 'PRONTO' : st === 'uploading' ? 'CARICAMENTO' : st === 'done' ? 'CARICATO' : 'ERRORE'}</span>
                            {st === 'error' && it.error ? (
                              <span className="text-xs text-red-600">{it.error}</span>
                            ) : null}
                          </div>
                          {Array.isArray(it.tags) && it.tags.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {it.tags.slice(0, 6).map((t) => (
                                <span
                                  key={t}
                                  className={`text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full ring-1 ${tagColor(t).bg} ${tagColor(t).text} ${tagColor(t).ring}`}
                                >
                                  {String(t).toUpperCase()}
                                </span>
                              ))}
                              {it.tags.length > 6 ? (
                                <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 ring-1 ring-gray-200">
                                  +{it.tags.length - 6}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        {st === 'done' && it.doc ? (
                          <button
                            type="button"
                            onClick={() => openDoc(it.doc)}
                            className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium transition-colors"
                          >
                            Apri
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => removeQueueItem(it.id)}
                          disabled={st === 'uploading'}
                          className="px-3 py-2 rounded-xl border border-gray-200 hover:bg-red-50 hover:border-red-200 text-gray-500 hover:text-red-600 text-sm transition-colors disabled:opacity-50"
                        >
                          Rimuovi
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400">Nessun file in coda.</div>
          )}
        </div>
      )}

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {copyOk && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{copyOk}</div>}

      {/* Tab orizzontali */}
      <div className="mt-6 border-b border-gray-200">
        <div className="flex gap-0 overflow-x-auto">
          <button
            onClick={() => setTabAttiva(TAB_TUTTI)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tabAttiva === TAB_TUTTI ? 'border-emerald-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Tutti ({docs.length})
          </button>
          {allTags.map(tag => (
            <button key={tag}
              onClick={() => setTabAttiva(tag)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tabAttiva === tag ? 'border-emerald-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <span className="inline-flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${tagColor(tag).dot}`} />
                {String(tag).toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 mb-4 flex flex-col lg:flex-row lg:items-end gap-3 justify-between">
        <div className="flex-1">
          <input value={q} onChange={e => setQ(e.target.value)}
            className="w-full max-w-xl px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            placeholder="Cerca per titolo o nome file…" />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="all">Tutte le date</option>
            <option value="today">Oggi</option>
            <option value="yesterday">Ieri</option>
            <option value="week">Ultimi 7 giorni</option>
            <option value="last30">Ultimi 30 giorni</option>
            <option value="this_month">Questo mese</option>
            <option value="last_month">Mese scorso</option>
            <option value="this_year">Anno corrente</option>
            <option value="last_year">Anno scorso</option>
            <option value="range">Intervallo…</option>
          </select>
          {dateFilter === 'range' ? (
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
              <button
                type="button"
                onClick={() => { setDateFilter('all'); setDateFrom(''); setDateTo('') }}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors"
              >
                Annulla
              </button>
            </div>
          ) : null}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="all">Tutti i file</option>
            <option value="pdf">PDF</option>
            <option value="image">Foto</option>
            <option value="other">Altro</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="date_desc">Più recenti</option>
            <option value="date_asc">Meno recenti</option>
            <option value="title_asc">Titolo A→Z</option>
            <option value="title_desc">Titolo Z→A</option>
          </select>
        </div>
      </div>

      {/* Lista documenti */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Caricamento…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <Icon name="file" className="w-8 h-8 text-gray-300 mb-2 mx-auto" />
            <p className="font-medium">Nessun documento trovato</p>
            <p className="text-sm mt-1">Carica il primo documento con il pulsante in alto</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(d => (
              <button
                type="button"
                key={d.id}
                onClick={() => openDrawer(d)}
                className="w-full text-left flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                  <Icon name={fileIconName(d.content_type)} className="w-5 h-5 text-white" />
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{d.titolo || d.file_name}</p>
                  <div className="mt-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {(d.tags || []).length > 0 ? (
                        <span
                          onClick={(e) => { e.stopPropagation(); setTabAttiva(String(d.tags?.[0]).toLowerCase()) }}
                          className={`text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full cursor-pointer ring-1 ${tagColor(d.tags?.[0]).bg} ${tagColor(d.tags?.[0]).text} ${tagColor(d.tags?.[0]).ring} hover:opacity-90`}
                        >
                          {String(d.tags?.[0]).toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 ring-1 ring-gray-200">
                          SENZA TAG
                        </span>
                      )}
                      {(d.tags || []).length > 1 ? (
                        <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 ring-1 ring-gray-200">
                          +{(d.tags || []).length - 1}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400 truncate">{d.file_name}</span>
                      <span className="text-xs text-gray-400">{fmt(d.created_at)}</span>
                    </div>
                  </div>
                </div>
                {/* Azioni */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openDoc(d) }}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
                  >
                    Apri
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteDoc(d) }}
                    className="px-4 py-2 rounded-xl border border-gray-200 hover:bg-red-50 hover:border-red-200 text-gray-600 hover:text-red-600 text-sm font-medium transition-colors"
                  >
                    Elimina
                  </button>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {drawerOpen && selectedDoc ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setDrawerOpen(false); setSelectedDoc(null); setCopyOk('') }}
          />
          <div className="absolute inset-x-0 bottom-0 lg:inset-y-0 lg:right-0 lg:left-auto w-full lg:w-[460px] bg-white rounded-t-3xl lg:rounded-none lg:rounded-l-3xl shadow-2xl border border-gray-100 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Documento</p>
                <h3 className="text-lg font-bold text-gray-900 truncate">{selectedDoc.titolo || selectedDoc.file_name}</h3>
                <p className="text-sm text-gray-500 mt-1">{selectedDoc.file_name}</p>
                <p className="text-sm text-gray-500">{fmt(selectedDoc.created_at)}</p>
              </div>
              <button
                type="button"
                onClick={() => { setDrawerOpen(false); setSelectedDoc(null); setCopyOk('') }}
                className="px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors"
              >
                Chiudi
              </button>
            </div>

            {(selectedDoc.tags || []).length ? (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tag</p>
                <div className="flex flex-wrap gap-2">
                  {(selectedDoc.tags || []).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setTabAttiva(String(t).toLowerCase()); setDrawerOpen(false); setSelectedDoc(null) }}
                      className={`text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full cursor-pointer ring-1 ${tagColor(t).bg} ${tagColor(t).text} ${tagColor(t).ring} hover:opacity-90`}
                    >
                      {String(t).toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openDoc(selectedDoc)}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
              >
                Apri
              </button>
              <button
                type="button"
                onClick={() => copyLink(selectedDoc)}
                className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium transition-colors"
              >
                Copia link
              </button>
              <button
                type="button"
                onClick={() => deleteDoc(selectedDoc)}
                className="px-4 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium transition-colors sm:col-span-2"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
