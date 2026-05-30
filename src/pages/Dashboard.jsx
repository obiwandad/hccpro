import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLocale } from '../context/LocaleContext'
import { Icon } from '../lib/icons'

const tileColors = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  purple: 'bg-purple-50 text-purple-600',
}

const AZIONI = [
  { feature: 'temperature', to: '/temperature', icon: '🌡️', label: 'Temperature', sub: 'Registra rilevazione', color: 'blue' },
  { feature: 'tracciabilita', to: '/tracciabilita', icon: '📦', label: 'Arrivi merci', sub: 'Nuova consegna', color: 'green' },
  { feature: 'pulizie', to: '/pulizie', icon: '🧹', label: 'Pulizie', sub: 'Segna completate', color: 'amber' },
  { feature: 'etichette', to: '/etichette', icon: '🏷️', label: 'Etichetta', sub: 'Genera e stampa', color: 'purple' },
  { feature: 'ddt', to: '/ddt', icon: '📄', label: 'DDT', sub: 'Genera e salva', color: 'blue' },
]

const formatScadenza = (s) => {
  const d = new Date(`${String(s).slice(0, 10)}T12:00:00`)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  if (diff <= 0) return 'scade oggi'
  if (diff === 1) return 'scade domani'
  return `tra ${diff} giorni`
}

export default function Dashboard() {
  const { profilo, activeLocaleId, activeLocaleName, isFeatureEnabled, loading: localeLoading } = useLocale()
  const [stats, setStats] = useState({
    arriviOggi: 0,
    temperatureOggi: 0,
    pulizieCompletate: 0,
    pulizieTotali: 0,
    scadenzeVicine: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (localeLoading) return
    const localeId = activeLocaleId
    if (!localeId) {
      setLoading(false)
      return
    }
    let cancelled = false
    const run = async () => {
      setLoading(true)
      const oggi = new Date().toISOString().split('T')[0]
      const tra3giorni = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]

      const [arrivi, temperature, pulizieLog, pulizieTask, scadenze] = await Promise.all([
        supabase.from('arrivi_merci').select('id').eq('locale_id', localeId).eq('data_arrivo', oggi),
        supabase.from('rilevazioni_temperatura').select('id').eq('locale_id', localeId).gte('data_ora', oggi),
        supabase.from('pulizie_log').select('id').eq('locale_id', localeId).gte('data_ora', oggi),
        supabase.from('task_pulizie').select('id').eq('locale_id', localeId),
        supabase.from('arrivi_merci').select('*, prodotti(nome)').eq('locale_id', localeId).lte('scadenza', tra3giorni).gte('scadenza', oggi),
      ])

      if (cancelled) return
      setStats({
        arriviOggi: arrivi.data?.length || 0,
        temperatureOggi: temperature.data?.length || 0,
        pulizieCompletate: pulizieLog.data?.length || 0,
        pulizieTotali: pulizieTask.data?.length || 0,
        scadenzeVicine: scadenze.data || [],
      })
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [activeLocaleId, localeLoading])

  const ora = new Date().getHours()
  const saluto = ora < 12 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera'
  const nome = profilo?.nome ? profilo.nome.split(' ')[0] : ''
  const dataLunga = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const azioniVisibili = AZIONI.filter((a) => isFeatureEnabled(a.feature))

  const items = []
  if (isFeatureEnabled('temperature')) items.push({ label: 'Temperature rilevate', done: stats.temperatureOggi > 0 })
  if (isFeatureEnabled('tracciabilita')) items.push({ label: 'Arrivi registrati', done: stats.arriviOggi > 0 })
  if (isFeatureEnabled('pulizie')) items.push({ label: 'Pulizie completate', done: stats.pulizieCompletate >= stats.pulizieTotali && stats.pulizieTotali > 0 })
  const doneCount = items.filter((i) => i.done).length
  const total = items.length
  const pct = total > 0 ? doneCount / total : 0
  const circ = 157
  const dashOffset = circ * (1 - pct)

  if (localeLoading || loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Caricamento...</div>
  }

  return (
    <div>
      {/* Header: saluto + stato compliance */}
      <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{saluto}{nome ? `, ${nome}` : ''}</h1>
          <p className="text-gray-500 mt-1">
            <span className="capitalize">{dataLunga}</span>
            {activeLocaleName ? <span> · {activeLocaleName}</span> : null}
          </p>
        </div>

        {total > 0 && (
          <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
            <svg width="52" height="52" viewBox="0 0 60 60" aria-label={`Compliance ${doneCount} su ${total}`}>
              <circle cx="30" cy="30" r="25" fill="none" stroke="#e5e7eb" strokeWidth="7" />
              <circle
                cx="30" cy="30" r="25" fill="none"
                stroke={doneCount >= total ? '#10b981' : '#f59e0b'}
                strokeWidth="7" strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={dashOffset}
                transform="rotate(-90 30 30)"
              />
            </svg>
            <div>
              <p className="text-lg font-bold text-gray-800">{doneCount}/{total}</p>
              <p className="text-xs text-gray-500">compliance oggi</p>
            </div>
          </div>
        )}
      </div>

      {/* Azioni rapide */}
      {azioniVisibili.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {azioniVisibili.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="flex flex-col items-start gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-emerald-200 hover:shadow transition-all"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tileColors[a.color]}`}>
                <Icon name={a.feature} className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold text-gray-800">{a.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{a.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Da fare oggi + Scadenze */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-700 mb-3">Da fare oggi</h2>
          {items.length === 0 ? (
            <p className="text-sm text-gray-400">Nessuna attività monitorata</p>
          ) : (
            items.map((it, idx) => (
              <div key={idx} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                <span className="text-gray-600">{it.label}</span>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${it.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {it.done ? 'fatto' : 'da fare'}
                </span>
              </div>
            ))
          )}
        </div>

        {stats.scadenzeVicine.length > 0 ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
            <h2 className="font-semibold text-red-700 mb-3 flex items-center gap-2"><Icon name="alert" className="w-5 h-5" /> Scadenze vicine</h2>
            <div className="space-y-2">
              {stats.scadenzeVicine.map((item) => (
                <div key={item.id} className="flex justify-between items-center bg-white rounded-xl px-4 py-2">
                  <span className="text-gray-700 font-medium">{item.prodotti?.nome}</span>
                  <span className="text-red-600 text-sm font-semibold">{formatScadenza(item.scadenza)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex items-center gap-3">
            <Icon name="check" className="w-7 h-7 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-700">Nessuna scadenza imminente</p>
              <p className="text-sm text-emerald-600 mt-0.5">Niente in scadenza nei prossimi 3 giorni</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
