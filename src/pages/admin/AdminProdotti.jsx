import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useLocale } from '../../context/LocaleContext'
import { Icon } from '../../lib/icons'

export default function AdminProdotti() {
  const { user } = useAuth()
  const { activeLocaleId } = useLocale()
  const [profilo, setProfilo] = useState(null)
  const [prodotti, setProdotti] = useState([])
  const [allergeni, setAllergeni] = useState([])
  const [categorie, setCategorie] = useState([])
  const [fornitori, setFornitori] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    nome: '',
    categoria_id: '',
    fornitore_id: '',
    giorni_scadenza_default: 3,
  })
  const [allergeniSelezionati, setAllergeniSelezionati] = useState([])
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroFornitore, setFiltroFornitore] = useState('')

  const fetchProdotti = async (locale_id) => {
    const { data } = await supabase
      .from('prodotti')
      .select('*, prodotti_allergeni(allergene_id, allergeni(nome)), categorie(nome, icona), fornitori(nome)')
      .eq('locale_id', locale_id)
      .order('nome')
    setProdotti(data || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: prof } = await supabase.from('profili').select('*').eq('user_id', user.id).single()
      setProfilo(prof)
      const localeId = activeLocaleId ?? prof?.locale_id
      if (!localeId) return
      await fetchProdotti(localeId)
      const [allRes, catRes, forRes] = await Promise.all([
        supabase.from('allergeni').select('*').order('id'),
        supabase.from('categorie').select('*').eq('locale_id', localeId).order('nome'),
        supabase.from('fornitori').select('*').eq('locale_id', localeId).order('nome'),
      ])
      setAllergeni(allRes.data || [])
      setCategorie(catRes.data || [])
      setFornitori(forRes.data || [])
    }
    if (user) init()
  }, [activeLocaleId, user])

  const toggleAllergene = (id) => {
    setAllergeniSelezionati(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    )
  }

  const handleEdit = (p) => {
    setForm({
      nome: p.nome,
      categoria_id: p.categoria_id || '',
      fornitore_id: p.fornitore_id || '',
      giorni_scadenza_default: p.giorni_scadenza_default || 3,
    })
    setAllergeniSelezionati(p.prodotti_allergeni?.map(pa => pa.allergene_id) || [])
    setEditingId(p.id)
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    const payload = {
      nome: form.nome,
      categoria_id: form.categoria_id || null,
      fornitore_id: form.fornitore_id || null,
      giorni_scadenza_default: form.giorni_scadenza_default,
    }
    if (editingId) {
      await supabase.from('prodotti').update(payload).eq('id', editingId)
      await supabase.from('prodotti_allergeni').delete().eq('prodotto_id', editingId)
      if (allergeniSelezionati.length > 0) {
        await supabase.from('prodotti_allergeni').insert(
          allergeniSelezionati.map(id => ({ prodotto_id: editingId, allergene_id: id }))
        )
      }
    } else {
      const { data: prod } = await supabase.from('prodotti').insert({
        ...payload, locale_id: localeId,
      }).select().single()
      if (prod && allergeniSelezionati.length > 0) {
        await supabase.from('prodotti_allergeni').insert(
          allergeniSelezionati.map(id => ({ prodotto_id: prod.id, allergene_id: id }))
        )
      }
    }
    await fetchProdotti(localeId)
    resetForm()
  }

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questo prodotto?')) return
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    await supabase.from('prodotti').delete().eq('id', id)
    await fetchProdotti(localeId)
  }

  const resetForm = () => {
    setForm({ nome: '', categoria_id: '', fornitore_id: '', giorni_scadenza_default: 3 })
    setAllergeniSelezionati([])
    setEditingId(null)
    setShowForm(false)
  }

  const prodottiFiltrati = prodotti.filter(p => {
    if (filtroCategoria && p.categoria_id !== filtroCategoria) return false
    if (filtroFornitore && p.fornitore_id !== filtroFornitore) return false
    return true
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5"><Icon name="prodotti" className="w-7 h-7 text-emerald-600" /> Gestione Prodotti</h1>
          <p className="text-gray-500 mt-1">Ingredienti e materie prime</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm) }}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
          {showForm && !editingId ? '✕ Chiudi' : '+ Nuovo Prodotto'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">{editingId ? 'Modifica prodotto' : 'Nuovo prodotto'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Es. Petto di pollo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select value={form.categoria_id} onChange={e => setForm({ ...form, categoria_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">Nessuna categoria</option>
                  {categorie.map(c => <option key={c.id} value={c.id}>{c.icona} {c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fornitore</label>
                <select value={form.fornitore_id} onChange={e => setForm({ ...form, fornitore_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">Nessun fornitore</option>
                  {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giorni scadenza default</label>
                <input type="number" min="1" value={form.giorni_scadenza_default}
                  onChange={e => setForm({ ...form, giorni_scadenza_default: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4" />Allergeni presenti</label>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {allergeni.map((a) => (
                  <label key={a.id} className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${allergeniSelezionati.includes(a.id) ? 'bg-amber-50 border-amber-300' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="checkbox" checked={allergeniSelezionati.includes(a.id)} onChange={() => toggleAllergene(a.id)} className="rounded" />
                    <span className="text-sm text-gray-700">{a.nome}</span>
                  </label>
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

      {/* Filtri */}
      {(categorie.length > 0 || fornitori.length > 0) && (
        <div className="flex gap-3 mb-4">
          {categorie.length > 0 && (
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="">Tutte le categorie</option>
              {categorie.map(c => <option key={c.id} value={c.id}>{c.icona} {c.nome}</option>)}
            </select>
          )}
          {fornitori.length > 0 && (
            <select value={filtroFornitore} onChange={e => setFiltroFornitore(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="">Tutti i fornitori</option>
              {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          )}
          {(filtroCategoria || filtroFornitore) && (
            <button onClick={() => { setFiltroCategoria(''); setFiltroFornitore('') }}
              className="text-sm text-gray-400 hover:text-gray-600 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors">
              ✕ Reset filtri
            </button>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">Prodotti</h2>
          <span className="text-xs text-gray-400">{prodottiFiltrati.length} prodotti</span>
        </div>
        {prodottiFiltrati.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nessun prodotto trovato</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {prodottiFiltrati.map((p) => (
              <div key={p.id} className="p-4 flex items-start justify-between hover:bg-gray-50">
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">{p.categorie?.icona || '📦'}</span>
                  <div>
                    <p className="font-medium text-gray-800">{p.nome}</p>
                    <div className="flex gap-3 mt-0.5">
                      {p.categorie?.nome && <span className="text-xs text-gray-500">{p.categorie.nome}</span>}
                      {p.fornitori?.nome && <span className="text-xs text-gray-500"><Icon name="fornitori" className="w-4 h-4 inline-block align-[-3px] mr-1" />{p.fornitori.nome}</span>}
                      <span className="text-xs text-gray-400">scad. +{p.giorni_scadenza_default}gg</span>
                    </div>
                    {p.prodotti_allergeni?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {p.prodotti_allergeni.map((pa) => (
                          <span key={pa.allergene_id} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                            {pa.allergeni?.nome}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button onClick={() => handleEdit(p)} className="text-blue-500 hover:text-blue-700 text-sm px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors">Modifica</button>
                  <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-600 text-sm px-3 py-1 rounded-lg hover:bg-red-50 transition-colors">Elimina</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
