import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Icon } from '../../lib/icons'

export default function AdminUtenti() {
  const [utenti, setUtenti] = useState([])
  const [locali, setLocali] = useState([])
  const [form, setForm] = useState({ nome: '', ruolo: 'operatore', locale_id: '' })
  const [newUserForm, setNewUserForm] = useState({ user_id: '' })
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const fetchUtenti = async () => {
    const { data } = await supabase.from('profili').select('*, locali(nome)').order('nome')
    setUtenti(data || [])
  }

  const fetchLocali = async () => {
    const { data } = await supabase.from('locali').select('*').order('nome')
    setLocali(data || [])
  }

  useEffect(() => {
    fetchUtenti()
    fetchLocali()
  }, [])

  const handleEdit = (u) => {
    setForm({ nome: u.nome, ruolo: u.ruolo, locale_id: u.locale_id || '' })
    setEditingId(u.id)
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (editingId) {
      await supabase.from('profili').update({
        nome: form.nome,
        ruolo: form.ruolo,
        locale_id: form.locale_id || null,
      }).eq('id', editingId)
    } else {
      await supabase.from('profili').insert({
        user_id: newUserForm.user_id,
        nome: form.nome,
        ruolo: form.ruolo,
        locale_id: form.locale_id || null,
      })
    }
    await fetchUtenti()
    resetForm()
  }

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questo utente dal sistema?')) return
    await supabase.from('profili').delete().eq('id', id)
    await fetchUtenti()
  }

  const resetForm = () => {
    setForm({ nome: '', ruolo: 'operatore', locale_id: '' })
    setNewUserForm({ user_id: '' })
    setEditingId(null)
    setShowForm(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5"><Icon name="utenti" className="w-7 h-7 text-emerald-600" /> Gestione Utenti</h1>
          <p className="text-gray-500 mt-1">Operatori e amministratori</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm) }}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
          {showForm && !editingId ? '✕ Chiudi' : '+ Nuovo Utente'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">{editingId ? 'Modifica utente' : 'Nuovo utente'}</h2>

          {!editingId && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-amber-700 font-medium">Prima crea l&apos;utente su Supabase Dashboard → Authentication → Users → Add user</p>
              <p className="text-sm text-amber-600 mt-1">Poi copia lo User ID e incollalo qui sotto.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">User ID (da Supabase) *</label>
                <input required value={newUserForm.user_id} onChange={e => setNewUserForm({ user_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Mario Rossi" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ruolo *</label>
                <select value={form.ruolo} onChange={e => setForm({ ...form, ruolo: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="operatore">Operatore</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.ruolo === 'admin' ? 'Locale predefinito' : 'Locale *'}
                </label>
                <select required={form.ruolo === 'operatore'} value={form.locale_id} onChange={e => setForm({ ...form, locale_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">{form.ruolo === 'admin' ? 'Tutti i locali' : 'Seleziona locale...'}</option>
                  {locali.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
                {form.ruolo === 'admin' && (
                  <p className="text-xs text-gray-400 mt-1">L&apos;admin vede tutti i locali: questo è solo quello mostrato all&apos;accesso.</p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-medium">
                {editingId ? 'Aggiorna' : 'Salva Profilo'}
              </button>
              <button type="button" onClick={resetForm} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl font-medium">Annulla</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {utenti.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nessun utente trovato</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {utenti.map((u) => (
              <div key={u.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-bold">
                    {u.nome?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">{u.nome}</p>
                    <p className="text-sm text-gray-500">{u.locali?.nome}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${u.ruolo === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {u.ruolo}
                  </span>
                  <button onClick={() => handleEdit(u)} className="text-blue-500 hover:text-blue-700 text-sm px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors">Modifica</button>
                  <button onClick={() => handleDelete(u.id)} className="text-red-400 hover:text-red-600 text-sm px-3 py-1 rounded-lg hover:bg-red-50 transition-colors">Elimina</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
