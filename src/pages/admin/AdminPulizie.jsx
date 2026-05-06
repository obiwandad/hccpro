import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useLocale } from '../../context/LocaleContext'

export default function AdminPulizie() {
  const { user } = useAuth()
  const { activeLocaleId } = useLocale()
  const [profilo, setProfilo] = useState(null)
  const [tasks, setTasks] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ nome: '', frequenza: 'giornaliera' })

  const fetchTasks = async (locale_id) => {
    const { data } = await supabase.from('task_pulizie').select('*').eq('locale_id', locale_id).order('frequenza')
    setTasks(data || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: prof } = await supabase.from('profili').select('*').eq('user_id', user.id).single()
      setProfilo(prof)
      const localeId = activeLocaleId ?? prof?.locale_id
      if (!localeId) return
      await fetchTasks(localeId)
    }
    if (user) init()
  }, [activeLocaleId, user])

  const handleEdit = (t) => {
    setForm({ nome: t.nome, frequenza: t.frequenza })
    setEditingId(t.id)
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    if (editingId) {
      await supabase.from('task_pulizie').update(form).eq('id', editingId)
    } else {
      await supabase.from('task_pulizie').insert({ ...form, locale_id: localeId })
    }
    await fetchTasks(localeId)
    resetForm()
  }

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questo task?')) return
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    await supabase.from('task_pulizie').delete().eq('id', id)
    await fetchTasks(localeId)
  }

  const resetForm = () => {
    setForm({ nome: '', frequenza: 'giornaliera' })
    setEditingId(null)
    setShowForm(false)
  }

  const freqColor = {
    giornaliera: 'bg-blue-100 text-blue-700',
    settimanale: 'bg-purple-100 text-purple-700',
    mensile: 'bg-orange-100 text-orange-700',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🧹 Task Pulizie</h1>
          <p className="text-gray-500 mt-1">Configura la checklist pulizie</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm) }}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
          {showForm && !editingId ? '✕ Chiudi' : '+ Nuovo Task'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">{editingId ? 'Modifica task' : 'Nuovo task'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome task *</label>
                <input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Es. Pulizia frigorifero" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frequenza *</label>
                <select value={form.frequenza} onChange={e => setForm({ ...form, frequenza: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="giornaliera">Giornaliera</option>
                  <option value="settimanale">Settimanale</option>
                  <option value="mensile">Mensile</option>
                </select>
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
        {tasks.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nessun task configurato</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {tasks.map((t) => (
              <div key={t.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${freqColor[t.frequenza]}`}>{t.frequenza}</span>
                  <p className="font-medium text-gray-800">{t.nome}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(t)} className="text-blue-500 hover:text-blue-700 text-sm px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors">Modifica</button>
                  <button onClick={() => handleDelete(t.id)} className="text-red-400 hover:text-red-600 text-sm px-3 py-1 rounded-lg hover:bg-red-50 transition-colors">Elimina</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
