import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useLocale } from '../../context/LocaleContext'

export default function AdminFornitori() {
  const { user } = useAuth()
  const { activeLocaleId } = useLocale()
  const [profilo, setProfilo] = useState(null)
  const [fornitori, setFornitori] = useState([])
  const [prodottiPerFornitore, setProdottiPerFornitore] = useState({})
  const [fornitoreAperto, setFornitoreAperto] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ nome: '', telefono: '', email: '', note: '' })

  const fetchFornitori = async (locale_id) => {
    const { data } = await supabase.from('fornitori').select('*').eq('locale_id', locale_id).order('nome')
    setFornitori(data || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: prof } = await supabase.from('profili').select('*').eq('user_id', user.id).single()
      setProfilo(prof)
      const localeId = activeLocaleId ?? prof?.locale_id
      if (!localeId) return
      await fetchFornitori(localeId)
    }
    if (user) init()
  }, [activeLocaleId, user])

  const fetchProdottiFornitore = async (fornitore_id) => {
    if (prodottiPerFornitore[fornitore_id]) return
    const { data } = await supabase
      .from('prodotti')
      .select('*, categorie(nome, icona)')
      .eq('fornitore_id', fornitore_id)
      .order('nome')
    setProdottiPerFornitore(prev => ({ ...prev, [fornitore_id]: data || [] }))
  }

  const toggleFornitore = async (f) => {
    if (fornitoreAperto?.id === f.id) {
      setFornitoreAperto(null)
    } else {
      setFornitoreAperto(f)
      await fetchProdottiFornitore(f.id)
    }
  }

  const handleEdit = (f) => {
    setForm({ nome: f.nome, telefono: f.telefono || '', email: f.email || '', note: f.note || '' })
    setEditingId(f.id)
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    if (editingId) {
      await supabase.from('fornitori').update(form).eq('id', editingId)
    } else {
      await supabase.from('fornitori').insert({ ...form, locale_id: localeId })
    }
    await fetchFornitori(localeId)
    resetForm()
  }

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questo fornitore?')) return
    await supabase.from('fornitori').delete().eq('id', id)
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    await fetchFornitori(localeId)
    if (fornitoreAperto?.id === id) setFornitoreAperto(null)
  }

  const resetForm = () => {
    setForm({ nome: '', telefono: '', email: '', note: '' })
    setEditingId(null)
    setShowForm(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🚚 Gestione Fornitori</h1>
          <p className="text-gray-500 mt-1">Fornitori e prodotti associati</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm) }}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
          {showForm && !editingId ? '✕ Chiudi' : '+ Nuovo Fornitore'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">{editingId ? 'Modifica fornitore' : 'Nuovo fornitore'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Es. Macelleria Rossi" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
                <input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="+39 02 1234567" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="fornitore@esempio.it" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Note aggiuntive..." />
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

      <div className="space-y-3">
        {fornitori.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm border border-gray-100">
            <p className="text-3xl mb-2">🚚</p>
            <p>Nessun fornitore configurato</p>
            <p className="text-sm mt-1">Aggiungi i tuoi fornitori abituali</p>
          </div>
        ) : (
          fornitori.map((f) => (
            <div key={f.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 flex items-center justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => toggleFornitore(f)}>
                  <p className="font-semibold text-gray-800">{f.nome}</p>
                  <div className="flex gap-3 mt-0.5">
                    {f.telefono && <p className="text-sm text-gray-500">📞 {f.telefono}</p>}
                    {f.email && <p className="text-sm text-gray-500">✉️ {f.email}</p>}
                  </div>
                  {f.note && <p className="text-xs text-gray-400 mt-1 italic">{f.note}</p>}
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <button onClick={() => handleEdit(f)} className="text-blue-500 hover:text-blue-700 text-sm px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors">Modifica</button>
                  <button onClick={() => handleDelete(f.id)} className="text-red-400 hover:text-red-600 text-sm px-3 py-1 rounded-lg hover:bg-red-50 transition-colors">Elimina</button>
                  <span className="text-gray-400 cursor-pointer" onClick={() => toggleFornitore(f)}>
                    {fornitoreAperto?.id === f.id ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {fornitoreAperto?.id === f.id && (
                <div className="border-t border-gray-100 px-4 pb-4">
                  <p className="text-xs font-semibold text-gray-500 mt-3 mb-2 uppercase tracking-wide">
                    Prodotti associati ({prodottiPerFornitore[f.id]?.length || 0})
                  </p>
                  {prodottiPerFornitore[f.id]?.length === 0 ? (
                    <p className="text-sm text-gray-400">Nessun prodotto associato — assegnali da Gestione Prodotti</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {prodottiPerFornitore[f.id]?.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                          <span>{p.categorie?.icona || '📦'}</span>
                          <div>
                            <p className="text-sm font-medium text-gray-700">{p.nome}</p>
                            {p.categorie?.nome && <p className="text-xs text-gray-400">{p.categorie.nome}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
