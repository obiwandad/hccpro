import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminLocali() {
  const [locali, setLocali] = useState([])
  const [form, setForm] = useState({ nome: '', indirizzo: '', tracciabilita_pin: '' })
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
    resetForm()
  }

  const handleEdit = (l) => {
    setForm({ nome: l.nome, indirizzo: l.indirizzo || '', tracciabilita_pin: l.tracciabilita_pin || '' })
    setEditingId(l.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questo locale? Verranno eliminati tutti i dati associati.')) return
    await supabase.from('locali').delete().eq('id', id)
    await fetchLocali()
  }

  const resetForm = () => {
    setForm({ nome: '', indirizzo: '', tracciabilita_pin: '' })
    setEditingId(null)
    setShowForm(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🏠 Gestione Locali</h1>
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
            {locali.map((l) => (
              <div key={l.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div>
                  <p className="font-medium text-gray-800">{l.nome}</p>
                  {l.indirizzo && <p className="text-sm text-gray-500 mt-0.5">{l.indirizzo}</p>}
                  {l.tracciabilita_pin && (
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">PIN: {l.tracciabilita_pin}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(l)} className="text-blue-500 hover:text-blue-700 text-sm px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors">Modifica</button>
                  <button onClick={() => handleDelete(l.id)} className="text-red-400 hover:text-red-600 text-sm px-3 py-1 rounded-lg hover:bg-red-50 transition-colors">Elimina</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
