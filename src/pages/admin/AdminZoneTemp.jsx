import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useLocale } from '../../context/LocaleContext'
import { Icon } from '../../lib/icons'

const emptyForm = { nome: '', soglia_min: '0', soglia_max: '4' }

export default function AdminZoneTemp() {
  const { user } = useAuth()
  const { activeLocaleId } = useLocale()
  const [profilo, setProfilo] = useState(null)
  const [zone, setZone] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchZone = async (locale_id) => {
    const { data } = await supabase.from('zone_temperatura').select('*').eq('locale_id', locale_id).order('nome')
    setZone(data || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: prof } = await supabase.from('profili').select('*').eq('user_id', user.id).single()
      setProfilo(prof)
      const localeId = activeLocaleId ?? prof?.locale_id
      if (!localeId) return
      await fetchZone(localeId)
    }
    if (user) init()
  }, [activeLocaleId, user])

  const handleEdit = (z) => {
    setFormError('')
    setForm({
      nome: z.nome,
      soglia_min: z.soglia_min != null ? String(z.soglia_min) : '',
      soglia_max: z.soglia_max != null ? String(z.soglia_max) : '',
    })
    setEditingId(z.id)
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')

    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) {
      setFormError('Nessun locale selezionato.')
      return
    }

    const nome = form.nome.trim()
    if (!nome) {
      setFormError('Inserisci il nome della zona.')
      return
    }

    const min = Number(String(form.soglia_min).replace(',', '.'))
    const max = Number(String(form.soglia_max).replace(',', '.'))
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      setFormError('Le soglie devono essere numeri validi.')
      return
    }
    if (min >= max) {
      setFormError('La soglia minima deve essere inferiore alla massima.')
      return
    }

    const payload = { nome, soglia_min: min, soglia_max: max }

    setSaving(true)
    try {
      const { error } = editingId
        ? await supabase.from('zone_temperatura').update(payload).eq('id', editingId)
        : await supabase.from('zone_temperatura').insert({ ...payload, locale_id: localeId })

      if (error) {
        setFormError(error.message || 'Errore durante il salvataggio.')
        return
      }
      await fetchZone(localeId)
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questa zona?')) return
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    const { error } = await supabase.from('zone_temperatura').delete().eq('id', id)
    if (error) {
      setFormError(error.message || 'Errore durante l\'eliminazione.')
      return
    }
    await fetchZone(localeId)
  }

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(false)
    setFormError('')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5"><Icon name="zone-temperatura" className="w-7 h-7 text-emerald-600" /> Zone Temperatura</h1>
          <p className="text-gray-500 mt-1">Configura frigoriferi, celle e banchi</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm) }}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
          {showForm && !editingId ? '✕ Chiudi' : '+ Nuova Zona'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">{editingId ? 'Modifica zona' : 'Nuova zona'}</h2>

          {formError ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome zona *</label>
                <input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Es. Frigo 1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Soglia min (°C) *</label>
                <input type="number" step="0.5" inputMode="decimal" required value={form.soglia_min}
                  onChange={e => setForm({ ...form, soglia_min: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Soglia max (°C) *</label>
                <input type="number" step="0.5" inputMode="decimal" required value={form.soglia_max}
                  onChange={e => setForm({ ...form, soglia_max: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
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
        {zone.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nessuna zona configurata</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {zone.map((z) => (
              <div key={z.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div>
                  <p className="font-medium text-gray-800">{z.nome}</p>
                  <p className="text-sm text-gray-500 mt-0.5">Soglie: {z.soglia_min}°C — {z.soglia_max}°C</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(z)} className="text-blue-500 hover:text-blue-700 text-sm px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors">Modifica</button>
                  <button onClick={() => handleDelete(z.id)} className="text-red-400 hover:text-red-600 text-sm px-3 py-1 rounded-lg hover:bg-red-50 transition-colors">Elimina</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
