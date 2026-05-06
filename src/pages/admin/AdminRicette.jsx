import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useLocale } from '../../context/LocaleContext'

export default function AdminRicette() {
  const { user } = useAuth()
  const { activeLocaleId } = useLocale()
  const [profilo, setProfilo] = useState(null)
  const [ricette, setRicette] = useState([])
  const [prodotti, setProdotti] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [ricettaAperta, setRicettaAperta] = useState(null)
  const [form, setForm] = useState({ nome: '', descrizione: '', giorni_scadenza_sottovuoto: 7, peso_porzione_g: '' })
  const [ingredientiForm, setIngredientiForm] = useState([{ prodotto_id: '', quantita: '', unita: 'g' }])

  const fetchRicette = async (locale_id) => {
    const { data } = await supabase
      .from('ricette')
      .select('*, ricette_ingredienti(*, prodotti(nome))')
      .eq('locale_id', locale_id)
      .order('nome')
    setRicette(data || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: prof } = await supabase.from('profili').select('*').eq('user_id', user.id).single()
      setProfilo(prof)
      const localeId = activeLocaleId ?? prof?.locale_id
      if (!localeId) return
      await fetchRicette(localeId)
      const { data: prods } = await supabase.from('prodotti').select('*').eq('locale_id', localeId).order('nome')
      setProdotti(prods || [])
    }
    if (user) init()
  }, [activeLocaleId, user])

  const handleEdit = (r) => {
    setForm({
      nome: r.nome,
      descrizione: r.descrizione || '',
      giorni_scadenza_sottovuoto: r.giorni_scadenza_sottovuoto,
      peso_porzione_g: r.peso_porzione_g || '',
    })
    setIngredientiForm(
      r.ricette_ingredienti?.length > 0
        ? r.ricette_ingredienti.map(i => ({ prodotto_id: i.prodotto_id, quantita: i.quantita, unita: i.unita }))
        : [{ prodotto_id: '', quantita: '', unita: 'g' }]
    )
    setEditingId(r.id)
    setShowForm(true)
  }

  const addIngrediente = () => setIngredientiForm([...ingredientiForm, { prodotto_id: '', quantita: '', unita: 'g' }])
  const removeIngrediente = (i) => setIngredientiForm(ingredientiForm.filter((_, idx) => idx !== i))
  const updateIngrediente = (i, field, value) => {
    const updated = [...ingredientiForm]
    updated[i][field] = value
    setIngredientiForm(updated)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    const payload = {
      nome: form.nome,
      descrizione: form.descrizione,
      giorni_scadenza_sottovuoto: form.giorni_scadenza_sottovuoto,
      peso_porzione_g: form.peso_porzione_g || null,
    }
    const validi = ingredientiForm.filter(i => i.prodotto_id && i.quantita)

    if (editingId) {
      await supabase.from('ricette').update(payload).eq('id', editingId)
      await supabase.from('ricette_ingredienti').delete().eq('ricetta_id', editingId)
      if (validi.length > 0) {
        await supabase.from('ricette_ingredienti').insert(
          validi.map(i => ({ ricetta_id: editingId, prodotto_id: i.prodotto_id, quantita: parseFloat(i.quantita), unita: i.unita }))
        )
      }
    } else {
      const { data: ricetta } = await supabase.from('ricette').insert({
        ...payload, locale_id: localeId,
      }).select().single()
      if (ricetta && validi.length > 0) {
        await supabase.from('ricette_ingredienti').insert(
          validi.map(i => ({ ricetta_id: ricetta.id, prodotto_id: i.prodotto_id, quantita: parseFloat(i.quantita), unita: i.unita }))
        )
      }
    }
    await fetchRicette(localeId)
    resetForm()
  }

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questa ricetta?')) return
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    await supabase.from('ricette').delete().eq('id', id)
    await fetchRicette(localeId)
    if (ricettaAperta?.id === id) setRicettaAperta(null)
  }

  const resetForm = () => {
    setForm({ nome: '', descrizione: '', giorni_scadenza_sottovuoto: 7, peso_porzione_g: '' })
    setIngredientiForm([{ prodotto_id: '', quantita: '', unita: 'g' }])
    setEditingId(null)
    setShowForm(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🍽️ Gestione Ricette</h1>
          <p className="text-gray-500 mt-1">Piatti e composizioni per le etichette</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm) }}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
          {showForm && !editingId ? '✕ Chiudi' : '+ Nuova Ricetta'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">{editingId ? 'Modifica ricetta' : 'Nuova ricetta'}</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome ricetta *</label>
                <input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Es. Lasagna Verdure" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
                <input value={form.descrizione} onChange={e => setForm({ ...form, descrizione: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Descrizione breve..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giorni scadenza sottovuoto *</label>
                <input type="number" min="1" required value={form.giorni_scadenza_sottovuoto} onChange={e => setForm({ ...form, giorni_scadenza_sottovuoto: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Peso porzione (g)</label>
                <input type="number" min="1" value={form.peso_porzione_g} onChange={e => setForm({ ...form, peso_porzione_g: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Es. 250" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-700">Ingredienti</label>
                <button type="button" onClick={addIngrediente} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">+ Aggiungi</button>
              </div>
              <div className="space-y-2">
                {ingredientiForm.map((ing, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <select value={ing.prodotto_id} onChange={e => updateIngrediente(i, 'prodotto_id', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                        <option value="">Prodotto...</option>
                        {prodotti.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <input type="number" min="0" step="0.1" placeholder="Qtà" value={ing.quantita} onChange={e => updateIngrediente(i, 'quantita', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div className="col-span-3">
                      <select value={ing.unita} onChange={e => updateIngrediente(i, 'unita', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="l">l</option>
                        <option value="pz">pz</option>
                      </select>
                    </div>
                    <div className="col-span-1 text-center">
                      {ingredientiForm.length > 1 && (
                        <button type="button" onClick={() => removeIngrediente(i)} className="text-red-400 hover:text-red-600 text-xl font-bold leading-none">×</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-medium">
                {editingId ? 'Aggiorna Ricetta' : 'Salva Ricetta'}
              </button>
              <button type="button" onClick={resetForm} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl font-medium">Annulla</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {ricette.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm border border-gray-100">Nessuna ricetta trovata</div>
        ) : (
          ricette.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 flex items-center justify-between">
                <div className="cursor-pointer flex-1" onClick={() => setRicettaAperta(ricettaAperta?.id === r.id ? null : r)}>
                  <p className="font-medium text-gray-800">{r.nome}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Scadenza: {r.giorni_scadenza_sottovuoto} giorni
                    {r.peso_porzione_g && ` · ${r.peso_porzione_g}g/porzione`}
                    {r.ricette_ingredienti?.length > 0 && ` · ${r.ricette_ingredienti.length} ingredienti`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleEdit(r)} className="text-blue-500 hover:text-blue-700 text-sm px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors">Modifica</button>
                  <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-600 text-sm px-3 py-1 rounded-lg hover:bg-red-50 transition-colors">Elimina</button>
                  <span className="text-gray-400 cursor-pointer" onClick={() => setRicettaAperta(ricettaAperta?.id === r.id ? null : r)}>
                    {ricettaAperta?.id === r.id ? '▲' : '▼'}
                  </span>
                </div>
              </div>
              {ricettaAperta?.id === r.id && r.ricette_ingredienti?.length > 0 && (
                <div className="px-4 pb-4 border-t border-gray-50">
                  <p className="text-xs font-semibold text-gray-500 mt-3 mb-2">INGREDIENTI:</p>
                  <div className="space-y-1">
                    {r.ricette_ingredienti.map((i) => (
                      <div key={i.id} className="flex items-center gap-2 text-sm">
                        <span className="w-2 h-2 bg-emerald-400 rounded-full flex-shrink-0" />
                        <span className="text-gray-700">{i.prodotti?.nome}</span>
                        <span className="text-gray-400">{i.quantita} {i.unita}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
