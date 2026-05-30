import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLocale } from '../../context/LocaleContext'
import { FEATURES, isFeatureEnabled } from '../../lib/features'
import { Icon } from '../../lib/icons'
import { generaTimbroDataUrl, scaricaTimbro } from '../../lib/timbro'

const BUCKET = 'allegati-merci'

const emptyForm = { nome: '', ragione_sociale: '', indirizzo: '', piva_cf: '', tracciabilita_pin: '', funzionalita: {}, firma_path: null }

export default function AdminLocali() {
  const { reloadLocali } = useLocale()
  const [locali, setLocali] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // firma
  const [firmaPreview, setFirmaPreview] = useState(null) // signed url per anteprima
  const [firmaUploading, setFirmaUploading] = useState(false)

  const fetchLocali = async () => {
    const { data } = await supabase.from('locali').select('*').order('nome')
    setLocali(data || [])
  }

  useEffect(() => { fetchLocali() }, [])

  // Anteprima del timbro generata in tempo reale dai dati del form
  const timbroDataUrl = useMemo(() => {
    if (typeof document === 'undefined') return null
    return generaTimbroDataUrl({ nome: form.ragione_sociale || form.nome, indirizzo: form.indirizzo, pivaCf: form.piva_cf })
  }, [form.indirizzo, form.nome, form.piva_cf, form.ragione_sociale])

  // Carica l'anteprima firma quando si apre un locale che ne ha una
  const loadFirmaPreview = async (path) => {
    if (!path) { setFirmaPreview(null); return }
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600)
    setFirmaPreview(data?.signedUrl || null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        nome: form.nome,
        ragione_sociale: form.ragione_sociale || null,
        indirizzo: form.indirizzo,
        piva_cf: form.piva_cf || null,
        tracciabilita_pin: form.tracciabilita_pin || null,
        funzionalita: form.funzionalita || {},
        firma_path: form.firma_path || null,
      }
      const { error: err } = editingId
        ? await supabase.from('locali').update(payload).eq('id', editingId)
        : await supabase.from('locali').insert(payload)
      if (err) { setError(err.message || 'Errore durante il salvataggio.'); return }
      await fetchLocali()
      await reloadLocali()
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (l) => {
    setError('')
    setForm({
      nome: l.nome,
      ragione_sociale: l.ragione_sociale || '',
      indirizzo: l.indirizzo || '',
      piva_cf: l.piva_cf || '',
      tracciabilita_pin: l.tracciabilita_pin || '',
      funzionalita: l.funzionalita || {},
      firma_path: l.firma_path || null,
    })
    setEditingId(l.id)
    setShowForm(true)
    loadFirmaPreview(l.firma_path)
  }

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questo locale? Verranno eliminati tutti i dati associati.')) return
    await supabase.from('locali').delete().eq('id', id)
    await fetchLocali()
    await reloadLocali()
  }

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(false)
    setFirmaPreview(null)
    setError('')
  }

  const toggleFeature = (key) => {
    setForm((prev) => {
      const enabled = isFeatureEnabled(prev.funzionalita, key)
      return { ...prev, funzionalita: { ...prev.funzionalita, [key]: !enabled } }
    })
  }

  const handleFirmaUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('La firma deve essere un\'immagine (PNG/JPG).'); return }
    setError('')
    setFirmaUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'png'
      const path = `firme/${editingId || 'nuovo'}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: true })
      if (upErr) { setError(upErr.message || 'Errore durante il caricamento della firma.'); return }
      setForm((p) => ({ ...p, firma_path: path }))
      await loadFirmaPreview(path)
    } finally {
      setFirmaUploading(false)
    }
  }

  const rimuoviFirma = () => {
    setForm((p) => ({ ...p, firma_path: null }))
    setFirmaPreview(null)
  }

  const countDisabled = (funz) => FEATURES.filter((f) => !isFeatureEnabled(funz, f.key)).length

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5"><Icon name="locali" className="w-7 h-7 text-emerald-600" /> Gestione Locali</h1>
          <p className="text-gray-500 mt-1">Aggiungi e gestisci i tuoi locali</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm) }}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
          {showForm && !editingId ? 'Chiudi' : '+ Nuovo Locale'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">{editingId ? 'Modifica locale' : 'Nuovo locale'}</h2>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome locale *</label>
                <input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Es. Ristorante Milano" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ragione sociale</label>
                <input value={form.ragione_sociale} onChange={e => setForm({ ...form, ragione_sociale: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Es. HACCPro Srl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo</label>
                <input value={form.indirizzo} onChange={e => setForm({ ...form, indirizzo: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Via Roma 1, Milano" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">P.IVA / Cod. Fiscale</label>
                <input value={form.piva_cf} onChange={e => setForm({ ...form, piva_cf: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Es. 01234567890" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PIN Tracciabilità
                  <span className="text-xs text-gray-400 font-normal ml-2">— 4 cifre per i QR delle etichette</span>
                </label>
                <input
                  type="text" inputMode="numeric" maxLength={4}
                  value={form.tracciabilita_pin}
                  onChange={e => setForm({ ...form, tracciabilita_pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono tracking-widest text-lg"
                  placeholder="es. 1234" />
              </div>
            </div>

            {/* Timbro + Firma */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Anteprima timbro generato */}
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="font-semibold text-gray-800 mb-1">Timbro del locale</p>
                <p className="text-xs text-gray-500 mb-3">Generato automaticamente dai dati sopra. Usato nei PDF.</p>
                <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-center min-h-[120px]">
                  {timbroDataUrl ? (
                    <img src={timbroDataUrl} alt="Anteprima timbro" className="max-h-32 object-contain" />
                  ) : (
                    <span className="text-sm text-gray-400">Anteprima non disponibile</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => timbroDataUrl && scaricaTimbro(timbroDataUrl, `timbro-${((form.ragione_sociale || form.nome) || 'locale').replace(/\s+/g, '-')}.png`)}
                  className="mt-3 flex items-center gap-2 text-sm bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-xl"
                >
                  <Icon name="file" className="w-4 h-4" /> Scarica PNG
                </button>
              </div>

              {/* Upload firma */}
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="font-semibold text-gray-800 mb-1">Firma</p>
                <p className="text-xs text-gray-500 mb-3">Carica un&apos;immagine della firma (PNG con sfondo trasparente consigliato).</p>
                <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-center min-h-[120px]">
                  {firmaPreview ? (
                    <img src={firmaPreview} alt="Anteprima firma" className="max-h-32 object-contain" />
                  ) : (
                    <span className="text-sm text-gray-400">Nessuna firma caricata</span>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl cursor-pointer">
                    <Icon name="photo" className="w-4 h-4" />
                    {firmaUploading ? 'Caricamento...' : 'Carica firma'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleFirmaUpload} disabled={firmaUploading} />
                  </label>
                  {form.firma_path && (
                    <button type="button" onClick={rimuoviFirma} className="text-sm text-red-500 hover:text-red-700">Rimuovi</button>
                  )}
                </div>
              </div>
            </div>

            {/* Funzionalità attive */}
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="font-semibold text-gray-800">Funzionalità attive</p>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">
                Disattiva le sezioni che non vuoi rendere disponibili in questo locale. La Dashboard è sempre attiva.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FEATURES.map((f) => {
                  const enabled = isFeatureEnabled(form.funzionalita, f.key)
                  return (
                    <div key={f.key} className="flex items-center justify-between rounded-xl bg-white border border-gray-100 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Icon name={f.key} className="w-5 h-5 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">{f.label}</span>
                      </div>
                      <button
                        type="button" role="switch" aria-checked={enabled}
                        onClick={() => toggleFeature(f.key)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-medium disabled:opacity-60">
                {saving ? 'Salvataggio...' : editingId ? 'Aggiorna' : 'Salva'}
              </button>
              <button type="button" onClick={resetForm} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl font-medium">Annulla</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {locali.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nessun locale trovato</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {locali.map((l) => {
              const disabled = countDisabled(l.funzionalita)
              return (
                <div key={l.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-gray-800">{l.nome}</p>
                    {l.indirizzo && <p className="text-sm text-gray-500 mt-0.5">{l.indirizzo}</p>}
                    {l.piva_cf && <p className="text-xs text-gray-400 mt-0.5">P.IVA/CF: {l.piva_cf}</p>}
                    {l.tracciabilita_pin && (
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">PIN: {l.tracciabilita_pin}</p>
                    )}
                    <div className="flex gap-3 mt-1">
                      {l.firma_path && <span className="text-xs text-emerald-600">✓ firma caricata</span>}
                      {disabled > 0 && (
                        <span className="text-xs text-amber-600">{disabled} funzionalità disattivat{disabled === 1 ? 'a' : 'e'}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(l)} className="text-blue-500 hover:text-blue-700 text-sm px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors">Modifica</button>
                    <button onClick={() => handleDelete(l.id)} className="text-red-400 hover:text-red-600 text-sm px-3 py-1 rounded-lg hover:bg-red-50 transition-colors">Elimina</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
