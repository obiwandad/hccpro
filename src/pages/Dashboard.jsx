import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'

export default function Dashboard() {
  const { user } = useAuth()
  const { activeLocaleId } = useLocale()
  const [stats, setStats] = useState({
    arriviOggi: 0,
    temperatureOggi: 0,
    pulizieCompletate: 0,
    pulizieTotali: 0,
    scadenzeVicine: [],
    temperatureFuoriSoglia: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const { data: prof } = await supabase
        .from('profili')
        .select('*, locali(nome)')
        .eq('user_id', user.id)
        .single()

      const oggi = new Date().toISOString().split('T')[0]
      const tra3giorni = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]

      const localeId = activeLocaleId ?? prof?.locale_id
      if (!localeId) {
        setLoading(false)
        return
      }

      const [arrivi, temperature, pulizieLog, pulizieTask, scadenze] = await Promise.all([
        supabase.from('arrivi_merci').select('id').eq('locale_id', localeId).eq('data_arrivo', oggi),
        supabase.from('rilevazioni_temperatura').select('id').eq('locale_id', localeId).gte('data_ora', oggi),
        supabase.from('pulizie_log').select('id').eq('locale_id', localeId).gte('data_ora', oggi),
        supabase.from('task_pulizie').select('id').eq('locale_id', localeId),
        supabase.from('arrivi_merci').select('*, prodotti(nome)').eq('locale_id', localeId).lte('scadenza', tra3giorni).gte('scadenza', oggi),
      ])

      setStats({
        arriviOggi: arrivi.data?.length || 0,
        temperatureOggi: temperature.data?.length || 0,
        pulizieCompletate: pulizieLog.data?.length || 0,
        pulizieTotali: pulizieTask.data?.length || 0,
        scadenzeVicine: scadenze.data || [],
        temperatureFuoriSoglia: [],
      })
      setLoading(false)
    }
    if (user) fetchData()
  }, [activeLocaleId, user])

  const oggi = new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Caricamento...</div>

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Buongiorno! 👋</h1>
        <p className="text-gray-500 mt-1 capitalize">{oggi}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon="📦" label="Arrivi oggi" value={stats.arriviOggi} color="blue" />
        <StatCard icon="🌡️" label="Temperature" value={stats.temperatureOggi} color="orange" />
        <StatCard icon="🧹" label="Pulizie" value={`${stats.pulizieCompletate}/${stats.pulizieTotali}`} color="green" />
        <StatCard icon="⚠️" label="Scadenze vicine" value={stats.scadenzeVicine.length} color="red" />
      </div>

      {stats.scadenzeVicine.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 mb-6">
          <h2 className="font-semibold text-red-700 mb-3">⚠️ Scadenze nei prossimi 3 giorni</h2>
          <div className="space-y-2">
            {stats.scadenzeVicine.map((item) => (
              <div key={item.id} className="flex justify-between items-center bg-white rounded-xl px-4 py-2">
                <span className="text-gray-700 font-medium">{item.prodotti?.nome}</span>
                <span className="text-red-600 text-sm font-semibold">
                  Scade il {new Date(item.scadenza).toLocaleDateString('it-IT')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-700 mb-4">📋 Compliance oggi</h2>
        <div className="space-y-3">
          <ComplianceRow label="Arrivi merci registrati" done={stats.arriviOggi > 0} />
          <ComplianceRow label="Temperature rilevate" done={stats.temperatureOggi > 0} />
          <ComplianceRow label="Pulizie completate" done={stats.pulizieCompletate >= stats.pulizieTotali && stats.pulizieTotali > 0} />
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
    green: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
  }
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-xl mb-3 ${colors[color]}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-gray-500 text-sm mt-1">{label}</p>
    </div>
  )
}

function ComplianceRow({ label, done }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-gray-600">{label}</span>
      <span className={`text-sm font-semibold px-3 py-1 rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
        {done ? '✓ OK' : '✗ Mancante'}
      </span>
    </div>
  )
}
