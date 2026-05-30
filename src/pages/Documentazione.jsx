import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { Icon } from '../lib/icons'

const BUCKET = 'allegati-merci'

const parseTags = (raw) => {
  const tokens = String(raw || '').split(/[,\n]/g).flatMap(x => x.split(' ')).map(x => x.trim().toLowerCase()).filter(Boolean)
  return [...new Set(tokens)].slice(0, 30)
}

const TAB_TUTTI = '__tutti__'

const FILE_ICON = (ct) => {
  if (!ct) return '📄'
  if (ct.includes('pdf')) return '📕'
  if (ct.includes('image')) return '🖼️'
  if (ct.includes('word') || ct.includes('document')) return '📝'
  if (ct.includes('sheet') || ct.includes('excel')) return '📊'
  return '📄'
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

export default function Documentazione() {
  const { user } = useAuth()
  const { activeLocaleId, activeLocaleName, profilo } = useLocale()
  const localeId = activeLocaleId ?? profilo?.locale_id ?? null

  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState([])
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [tabAttiva, setTabAttiva] = useState(TAB_TUTTI)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [file, setFile] = useState(null)
  const [titolo, setTitolo] = useState('')
  const [tagsText, setTagsText] = useState('')

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

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return docs.filter(d => {
      const hay = `${d.titolo || ''} ${d.file_name || ''}`.toLowerCase()
      const okQ = !qq || hay.includes(qq)
      const okTab = tabAttiva === TAB_TUTTI || (d.tags || []).map(x => String(x).toLowerCase()).includes(tabAttiva)
      return okQ && okTab
    })
  }, [docs, q, tabAttiva])

  const handleUpload = async () => {
    setUploadError('')
    if (!localeId) { setUploadError('Seleziona un locale'); return }
    if (!file) { setUploadError('Seleziona un file'); return }
    setUploading(true)
    try {
      const safeName = file.name.replaceAll('/', '_')
      const path = `${localeId}/documentazione/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false })
      if (upErr) { setUploadError(upErr.message); return }
      const { error: insErr } = await supabase.from('documenti').insert({
        locale_id: localeId,
        titolo: (titolo || '').trim() || safeName,
        file_name: safeName,
        content_type: file.type || '',
        storage_bucket: BUCKET,
        storage_path: path,
        tags: parseTags(tagsText),
        uploaded_by: user?.id || null,
      })
      if (insErr) { setUploadError(insErr.message); return }
      setFile(null); setTitolo(''); setTagsText(''); setShowUpload(false)
      await fetchDocs(localeId)
    } finally { setUploading(false) }
  }

  const openDoc = async (d) => {
    const { data, error: e } = await supabase.storage.from(d.storage_bucket || BUCKET).createSignedUrl(d.storage_path, 300)
    if (e) { setError(e.message); return }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const deleteDoc = async (d) => {
    if (!confirm(`Eliminare "${d.titolo || d.file_name}"?`)) return
    setError('')
    await supabase.storage.from(d.storage_bucket || BUCKET).remove([d.storage_path])
    await supabase.from('documenti').delete().eq('id', d.id)
    await fetchDocs(localeId)
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">File</label>
              <input type="file" onChange={e => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Titolo</label>
              <input value={titolo} onChange={e => setTitolo(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                placeholder="Es. Procedura ricezione merci" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Categoria (tag)</label>
              <input value={tagsText} onChange={e => setTagsText(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                placeholder="Es. haccp, allergeni, pulizie" />
            </div>
          </div>
          <button onClick={handleUpload} disabled={uploading}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium ${uploading ? 'bg-gray-100 text-gray-400' : 'bg-emerald-500 hover:bg-emerald-600 text-white'}`}>
            {uploading ? 'Caricamento…' : 'Carica'}
          </button>
        </div>
      )}

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

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

      {/* Barra ricerca */}
      <div className="mt-4 mb-4">
        <input value={q} onChange={e => setQ(e.target.value)}
          className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          placeholder="Cerca per titolo o nome file…" />
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
              <div key={d.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                {/* Icona tipo file */}
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                  {FILE_ICON(d.content_type)}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{d.titolo || d.file_name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-400">{d.file_name}</span>
                    <span className="text-xs text-gray-400">{fmt(d.created_at)}</span>
                    {(d.tags || []).slice(0, 3).map(t => (
                      <span key={t} onClick={() => setTabAttiva(String(t).toLowerCase())}
                        className={`text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full cursor-pointer ring-1 ${tagColor(t).bg} ${tagColor(t).text} ${tagColor(t).ring} hover:opacity-90`}
                      >
                        {String(t).toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Azioni */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => openDoc(d)}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors">
                    Apri
                  </button>
                  <button onClick={() => deleteDoc(d)}
                    className="px-3 py-2 rounded-xl border border-gray-200 hover:bg-red-50 hover:border-red-200 text-gray-400 hover:text-red-500 text-sm transition-colors">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
