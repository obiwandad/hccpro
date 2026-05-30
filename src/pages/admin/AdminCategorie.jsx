import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useLocale } from '../../context/LocaleContext'
import { Icon } from '../../lib/icons'

const ICONE = ['📦', '🥩', '🥦', '🐟', '🥛', '🧀', '🥚', '🍞', '🧴', '🫙', '🥫', '🍷', '🧂', '🫒', '🌿', '🍋', '🥐', '🍖', '🦐', '🧊']

export default function AdminCategorie() {
  const { user } = useAuth()
  const { activeLocaleId } = useLocale()
  const [profilo, setProfilo] = useState(null)
  const [categorie, setCategorie] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ nome: '', icona: '📦' })

  const fetchCategorie = async (locale_id) => {
    const { data } = await supabase.from('categorie').select('*').eq('locale_id', locale_id).order('nome')
    setCategorie(data || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: prof } = await supabase.from('profili').select('*').eq('user_id', user.id).single()
      setProfilo(prof)
      const localeId = activeLocaleId ?? prof?.locale_id
      if (!localeId) return
      await fetchCategorie(localeId)
    }
    if (user) init()
  }, [activeLocaleId, user])

  const handleEdit = (c) => {
    setForm({ nome: c.nome, icona: c.icona || '📦' })
    setEditingId(c.id)
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    if (editingId) {
      await supabase.from('categorie').update(form).eq('id', editingId)
    } else {
      await supabase.from('categorie').insert({ ...form, locale_id: localeId })
    }
    await fetchCategorie(localeId)
    resetForm()
  }

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questa categoria?')) return
    await supabase.from('categorie').delete().eq('id', id)
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    await fetchCategorie(localeId)
  }

  const resetForm = () => {
    setForm({ nome: '', icona: '📦' })
    setEditingId(null)
    setShowForm(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5"><Icon name="categorie" className="w-7 h-7 text-emerald-600" /> Categorie Prodotti</h1>
          <p className="text-gray-500 mt-1">Organizza i prodotti per categoria</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm) }}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
          {showForm && !editingId ? '✕ Chiudi' : '+ Nuova Categoria'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">{editingId ? 'Modifica categoria' : 'Nuova categoria'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Es. Carne, Verdure, Pesce..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Icona</label>
              <div className="flex flex-wrap gap-2">
                {ICONE.map((ic) => (
                  <button key={ic} type="button" onClick={() => setForm({ ...form, icona: ic })}
                    className={`w-10 h-10 text-xl rounded-xl border-2 transition-colors ${form.icona === ic ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    {ic}
                  </button>
                ))}
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
        {categorie.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Icon name="categorie" className="w-8 h-8 text-gray-300 mb-2 mx-auto" />
            <p>Nessuna categoria configurata</p>
            <p className="text-sm mt-1">Es. Carne, Verdure, Pesce, Latticini...</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {categorie.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{c.icona}</span>
                  <p className="font-medium text-gray-800">{c.nome}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(c)} className="text-blue-500 hover:text-blue-700 text-sm px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors">Modifica</button>
                  <button onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-600 text-sm px-3 py-1 rounded-lg hover:bg-red-50 transition-colors">Elimina</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
