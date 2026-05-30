import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { Icon } from '../lib/icons'

export default function Pulizie() {
  const { user } = useAuth()
  const { activeLocaleId } = useLocale()
  const [profilo, setProfilo] = useState(null)
  const [tasks, setTasks] = useState([])
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = async (locale_id) => {
    const oggi = new Date().toISOString().split('T')[0]
    const [t, l] = await Promise.all([
      supabase.from('task_pulizie').select('*').eq('locale_id', locale_id).order('frequenza'),
      supabase.from('pulizie_log').select('*, profili(nome)').eq('locale_id', locale_id).gte('data_ora', oggi),
    ])
    setTasks(t.data || [])
    setLog(l.data || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: prof } = await supabase.from('profili').select('*').eq('user_id', user.id).single()
      setProfilo(prof)
      const localeId = activeLocaleId ?? prof?.locale_id
      if (!localeId) {
        setLoading(false)
        return
      }
      await fetchData(localeId)
      setLoading(false)
    }
    if (user) init()
  }, [activeLocaleId, user])

  const isCompletato = (task_id) => log.some(l => l.task_id === task_id)

  const toggleTask = async (task) => {
    if (isCompletato(task.id)) return
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    const { error } = await supabase.from('pulizie_log').insert({
      task_id: task.id,
      completato_da: profilo.id,
      locale_id: localeId,
    })
    if (!error) await fetchData(localeId)
  }

  const completati = tasks.filter(t => isCompletato(t.id)).length
  const percentuale = tasks.length > 0 ? Math.round((completati / tasks.length) * 100) : 0

  const taskPerFrequenza = {
    giornaliera: tasks.filter(t => t.frequenza === 'giornaliera'),
    settimanale: tasks.filter(t => t.frequenza === 'settimanale'),
    mensile: tasks.filter(t => t.frequenza === 'mensile'),
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Caricamento...</div>

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5"><Icon name="pulizie" className="w-7 h-7 text-emerald-600" /> Pulizie</h1>
        <p className="text-gray-500 mt-1">Checklist pulizie del giorno</p>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold text-gray-700">Progresso oggi</span>
          <span className="text-emerald-600 font-bold">{completati}/{tasks.length}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div className="bg-emerald-500 h-3 rounded-full transition-all duration-500" style={{ width: `${percentuale}%` }} />
        </div>
        <p className="text-sm text-gray-500 mt-2">{percentuale}% completato</p>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm border border-gray-100">
          Nessun task configurato. Aggiungili dal pannello Admin.
        </div>
      ) : (
        Object.entries(taskPerFrequenza).map(([freq, list]) => list.length > 0 && (
          <div key={freq} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-600 capitalize text-sm">{freq}</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {list.map((task) => {
                const done = isCompletato(task.id)
                const logEntry = log.find(l => l.task_id === task.id)
                return (
                  <div key={task.id} onClick={() => toggleTask(task)}
                    className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${done ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`}>
                        {done && <Icon name="checkmark" className="w-4 h-4 text-white" />}
                      </div>
                      <div>
                        <p className={`font-medium ${done ? 'text-emerald-700 line-through' : 'text-gray-800'}`}>{task.nome}</p>
                        {done && logEntry && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Completato da {logEntry.profili?.nome} alle {new Date(logEntry.data_ora).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    </div>
                    {done && <Icon name="check" className="w-5 h-5 text-emerald-500" />}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
