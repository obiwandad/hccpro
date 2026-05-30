import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLocale } from '../../context/LocaleContext'
import { FEATURES, isFeatureEnabled } from '../../lib/features'
import { Icon } from '../../lib/icons'

export default function AdminLocali() {
  const { reloadLocali } = useLocale()
  const [locali, setLocali] = useState([])
  const [form, setForm] = useState({ nome: '', indirizzo: '', tracciabilita_pin: '', funzionalita: {} })
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const fetchLocali = async () => {
    const { data } = await supabase.from('locali').select('*').order('nome')
    setLocali(data || [])
  }

  useEffect(() => { fetchLocali() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (editingId) {
      await supabase.from('locali').update(form).eq('id', editingId)
    } else {
      await supabase.from('locali').insert(form)
    }
    await fetchLocali()
    await reloadLocali()
    resetForm()
  }

  const handleEdit = (l) => {
    setForm({
      nome: l.nome,
      indirizzo: l.indirizzo || '',
      tracciabilita_pin: l.tracciabilita_pin || '',
      funzionalita: l.funzionalita || {},
    })
    setEditingId(l.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questo locale? Verranno eliminati tutti i dati associati.')) return
    await supabase.from('locali').delete().eq('id', id)
    await fetchLocali()
    await reloadLocali()
  }

  const resetForm = () => {
    setForm({ nome: '', indirizzo: '', tracciabilita_pin: '', funzionalita: {} })
    setEditingId(null)
    setShowForm(false)
  }

  const toggleFeature = (key) => {
    setForm((prev) => {
      const enabled = isFeatureEnabled(prev.funzionalita, key)
      return { ...prev, funzionalita: { ...prev.funzionalita, [key]: !enabled } }
    })
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Es. Ristorante Milano" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo</label>
                <input value={form.indirizzo} onChange={e => setForm({ ...form, indirizzo: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Via Roma 1, Milano" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PIN Tracciabilità
                  <span className="text-xs text-gray-400 font-normal ml-2">— 4 cifre per accedere ai QR delle etichette</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.tracciabilita_pin}
                  onChange={e => setForm({ ...form, tracciabilita_pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono tracking-widest text-lg"
                  placeholder="es. 1234" />
              </div>
            </div>

            {/* Funzionalità attive per questo locale */}
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
                        <span className="text-lg">{f.icon}</span>
                        <span className="text-sm font-medium text-gray-700">{f.label}</span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
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
              <button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-medium">
                {editingId ? 'Aggiorna' : 'Salva'}
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
                    {l.tracciabilita_pin && (
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">PIN: {l.tracciabilita_pin}</p>
                    )}
                    {disabled > 0 && (
                      <p className="text-xs text-amber-600 mt-1">{disabled} funzionalità disattivat{disabled === 1 ? 'a' : 'e'}</p>
                    )}
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
