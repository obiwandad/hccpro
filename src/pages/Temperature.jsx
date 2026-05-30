import { useEffect, useMemo, useState } from 'react'
import { supabase, uploadToDocumentazione } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { Icon } from '../lib/icons'
import { buildTemperaturePDF, exportTemperaturePDF } from '../lib/temperaturePdf'
import { generaTimbroDataUrl } from '../lib/timbro'

const weekdays = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM']

const dayKeyFromDate = (d) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const monthStartDate = (d) => new Date(d.getFullYear(), d.getMonth(), 1)

const addMonths = (d, delta) => new Date(d.getFullYear(), d.getMonth() + delta, 1)

const startOfCalendarGrid = (monthStart) => {
  const day = monthStart.getDay()
  const mondayIndex = (day + 6) % 7
  const start = new Date(monthStart)
  start.setDate(start.getDate() - mondayIndex)
  return start
}

const formatLongDateIt = (dayKey) => {
  const d = new Date(`${dayKey}T12:00:00`)
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// Scarica un'immagine da URL e la converte in data URL (per inserirla nel PDF)
const urlToDataUrl = async (url) => {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

const normalizeConformeNote = (note) => {
  const n = note ?? ''
  const isConforme = n.startsWith('[CONFORME]')
  return { isConforme, note: isConforme ? n.replace(/^\[CONFORME\]\s?/, '') : n }
}

export default function Temperature() {
  const { user } = useAuth()
  const { activeLocaleId, activeLocaleName } = useLocale()
  const [profilo, setProfilo] = useState(null)
  const [zone, setZone] = useState([])
  const [loading, setLoading] = useState(true)
  const [monthCursor, setMonthCursor] = useState(() => monthStartDate(new Date()))
  const [monthDataByDay, setMonthDataByDay] = useState({})
  const [monthLoading, setMonthLoading] = useState(false)
  const [activeCellDay, setActiveCellDay] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [dayForm, setDayForm] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [docInfo, setDocInfo] = useState('')
  const [saving, setSaving] = useState(false)

  // Storico / registro
  const now = new Date()
  const [storicoMese, setStoricoMese] = useState(now.getMonth())
  const [storicoAnno, setStoricoAnno] = useState(now.getFullYear())
  const [storicoZona, setStoricoZona] = useState('')
  const [storico, setStorico] = useState([])
  const [storicoLoading, setStoricoLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [sendingDoc, setSendingDoc] = useState(false)

  const fetchMonth = async (localeId, monthStart) => {
    if (!localeId) return
    setMonthLoading(true)
    try {
      // Range sul campo data (giorno locale), senza conversione UTC che slitterebbe ai bordi mese
      const start = dayKeyFromDate(new Date(monthStart.getFullYear(), monthStart.getMonth(), 1))
      const end = dayKeyFromDate(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))

      const { data, error } = await supabase
        .from('rilevazioni_temperatura')
        .select('id, zona_id, temperatura, note, data_ora')
        .eq('locale_id', localeId)
        .gte('data_ora', `${start}T00:00:00`)
        .lt('data_ora', `${end}T00:00:00`)
        .order('data_ora', { ascending: false })

      if (error) {
        setLoadError(error.message || 'Errore nel caricamento del calendario.')
        return
      }

      // I record arrivano dal più recente: tengo solo il primo per (giorno, zona),
      // così eventuali duplicati non si sovrascrivono col più vecchio.
      const map = {}
      for (const r of data || []) {
        const dayKey = String(r.data_ora).slice(0, 10)
        if (!map[dayKey]) map[dayKey] = {}
        if (!map[dayKey][r.zona_id]) map[dayKey][r.zona_id] = r
      }
      setMonthDataByDay(map)
    } finally {
      setMonthLoading(false)
    }
  }

  const fetchStorico = async (localeId, mese, anno, zonaId) => {
    if (!localeId) return
    setStoricoLoading(true)
    try {
      const startKey = dayKeyFromDate(new Date(anno, mese, 1))
      const endKey = dayKeyFromDate(new Date(anno, mese + 1, 1))

      let query = supabase
        .from('rilevazioni_temperatura')
        .select('id, zona_id, temperatura, note, data_ora, zone_temperatura(nome, soglia_min, soglia_max), profili(nome)')
        .eq('locale_id', localeId)
        .gte('data_ora', `${startKey}T00:00:00`)
        .lt('data_ora', `${endKey}T00:00:00`)
        .order('data_ora', { ascending: false })

      if (zonaId) query = query.eq('zona_id', zonaId)

      const { data, error } = await query
      if (error) {
        setLoadError(error.message || 'Errore nel caricamento dello storico.')
        return
      }
      setStorico(data || [])
    } finally {
      setStoricoLoading(false)
    }
  }

  useEffect(() => {
    const init = async () => {
      setLoadError('')
      const { data: prof } = await supabase.from('profili').select('*').eq('user_id', user.id).single()
      setProfilo(prof)
      const localeId = activeLocaleId ?? prof?.locale_id
      if (!localeId) {
        setLoading(false)
        return
      }
      const { data: z } = await supabase.from('zone_temperatura').select('*').eq('locale_id', localeId).order('nome')
      setZone(z || [])
      await Promise.all([fetchMonth(localeId, monthCursor)])
      setLoading(false)
    }
    if (user) init()
  }, [activeLocaleId, monthCursor, user])

  // Ricarica lo storico quando cambiano i filtri (mese/anno/zona) o il locale
  useEffect(() => {
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    fetchStorico(localeId, storicoMese, storicoAnno, storicoZona)
  }, [activeLocaleId, profilo?.locale_id, storicoMese, storicoAnno, storicoZona])

  const calendarDays = useMemo(() => {
    const start = startOfCalendarGrid(monthCursor)
    const days = []
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      days.push(d)
    }
    return days
  }, [monthCursor])

  const openDay = (dayKey) => {
    setSubmitError('')
    setActiveCellDay(null)
    setSelectedDay(dayKey)
    const byZona = monthDataByDay[dayKey] || {}
    const next = {}
    for (const z of zone) {
      const existing = byZona[z.id]
      if (existing) {
        const normalized = normalizeConformeNote(existing.note)
        next[z.id] = {
          conforme: normalized.isConforme,
          temperatura: existing.temperatura != null ? String(existing.temperatura) : '',
          note: normalized.note,
          existingId: existing.id,
        }
      } else {
        next[z.id] = { conforme: true, temperatura: '', note: '', existingId: null }
      }
    }
    setDayForm(next)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setSelectedDay(null)
    setSubmitError('')
  }

  const saveDay = async () => {
    setSubmitError('')
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    if (!profilo?.id) return
    if (!selectedDay) return

    setSaving(true)
    try {
      const errors = []
      const updates = []
      const inserts = []
      const dataOra = new Date(`${selectedDay}T09:00:00`).toISOString()

      for (const z of zone) {
        const values = dayForm[z.id] || { conforme: true, temperatura: '', note: '', existingId: null }
        const sogliaMin = z?.soglia_min != null ? Number(z.soglia_min) : null
        const sogliaMax = z?.soglia_max != null ? Number(z.soglia_max) : null

        let temperaturaValue = values.temperatura === '' ? null : Number(values.temperatura)
        if (values.conforme) {
          if (temperaturaValue == null) {
            if (Number.isFinite(sogliaMin) && Number.isFinite(sogliaMax)) {
              temperaturaValue = Math.round(((sogliaMin + sogliaMax) / 2) * 10) / 10
            } else {
              errors.push(`"${z.nome}": mancano le soglie, inserisci la temperatura oppure configura soglia min/max.`)
              continue
            }
          }
        } else {
          if (temperaturaValue == null || Number.isNaN(temperaturaValue)) {
            errors.push(`"${z.nome}": inserisci una temperatura valida.`)
            continue
          }
        }

        const noteFinale = values.conforme
          ? (values.note ? `[CONFORME] ${values.note}` : '[CONFORME]')
          : (values.note || '')

        const payload = {
          zona_id: z.id,
          temperatura: temperaturaValue,
          note: noteFinale,
          operatore_id: profilo.id,
          locale_id: localeId,
          data_ora: dataOra,
        }

        if (values.existingId) {
          updates.push({ id: values.existingId, payload })
        } else {
          inserts.push(payload)
        }
      }

      if (errors.length > 0) {
        setSubmitError(errors[0])
        return
      }

      for (const u of updates) {
        const { error } = await supabase.from('rilevazioni_temperatura').update(u.payload).eq('id', u.id)
        if (error) {
          setSubmitError(error.message || 'Errore durante l\'aggiornamento.')
          return
        }
      }
      if (inserts.length > 0) {
        const { error } = await supabase.from('rilevazioni_temperatura').insert(inserts)
        if (error) {
          setSubmitError(error.message || 'Errore durante il salvataggio.')
          return
        }
      }

      await Promise.all([fetchMonth(localeId, monthCursor), fetchStorico(localeId, storicoMese, storicoAnno, storicoZona)])
      closeModal()
    } catch (e) {
      setSubmitError(e?.message || 'Errore imprevisto durante il salvataggio.')
    } finally {
      setSaving(false)
    }
  }

  const isFuoriSoglia = (r) => {
    const z = r.zone_temperatura
    if (!z) return false
    return r.temperatura < z.soglia_min || r.temperatura > z.soglia_max
  }

  const anniDisponibili = useMemo(() => {
    const y = new Date().getFullYear()
    return [y, y - 1, y - 2, y - 3]
  }, [])

  const mesiNomi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

  const storicoFuoriSoglia = useMemo(() => storico.filter((r) => isFuoriSoglia(r)).length, [storico])

  const handleExportPDF = async () => {
    if (storico.length === 0) return
    setExporting(true)
    try {
      const localeId = activeLocaleId ?? profilo?.locale_id
      // dati locale per timbro/firma
      let timbroDataUrl = null
      let firmaDataUrl = null
      if (localeId) {
        const { data: loc } = await supabase
          .from('locali')
          .select('nome, ragione_sociale, indirizzo, piva_cf, firma_path')
          .eq('id', localeId)
          .single()
        if (loc) {
          timbroDataUrl = generaTimbroDataUrl({ nome: loc.ragione_sociale || loc.nome, indirizzo: loc.indirizzo, pivaCf: loc.piva_cf })
          if (loc.firma_path) {
            const { data: signed } = await supabase.storage.from('allegati-merci').createSignedUrl(loc.firma_path, 120)
            if (signed?.signedUrl) {
              firmaDataUrl = await urlToDataUrl(signed.signedUrl)
            }
          }
        }
      }

      const zoneColonne = storicoZona ? zone.filter((z) => z.id === storicoZona) : zone
      exportTemperaturePDF({
        rilevazioni: storico,
        zone: zoneColonne,
        mese: storicoMese,
        anno: storicoAnno,
        localeName: activeLocaleName || '',
        timbroDataUrl,
        firmaDataUrl,
      })
    } finally {
      setExporting(false)
    }
  }

  const handleSendDocumentazione = async () => {
    if (storico.length === 0) return
    setLoadError('')
    setDocInfo('')
    setSendingDoc(true)
    try {
      const localeId = activeLocaleId ?? profilo?.locale_id
      if (!localeId) { setLoadError('Seleziona un locale prima di inviare.'); return }
      if (!user?.id) { setLoadError('Utente non disponibile.'); return }

      let timbroDataUrl = null
      let firmaDataUrl = null
      const { data: loc } = await supabase
        .from('locali')
        .select('nome, ragione_sociale, indirizzo, piva_cf, firma_path')
        .eq('id', localeId)
        .single()
      if (loc) {
        timbroDataUrl = generaTimbroDataUrl({ nome: loc.ragione_sociale || loc.nome, indirizzo: loc.indirizzo, pivaCf: loc.piva_cf })
        if (loc.firma_path) {
          const { data: signed } = await supabase.storage.from('allegati-merci').createSignedUrl(loc.firma_path, 120)
          if (signed?.signedUrl) firmaDataUrl = await urlToDataUrl(signed.signedUrl)
        }
      }

      const zoneColonne = storicoZona ? zone.filter((z) => z.id === storicoZona) : zone
      const { doc, fileName } = buildTemperaturePDF({
        rilevazioni: storico,
        zone: zoneColonne,
        mese: storicoMese,
        anno: storicoAnno,
        localeName: activeLocaleName || '',
        timbroDataUrl,
        firmaDataUrl,
      })

      let blob
      try {
        blob = doc.output('blob')
      } catch {
        const ab = doc.output('arraybuffer')
        blob = new Blob([ab], { type: 'application/pdf' })
      }

      const file = new File([blob], fileName, { type: 'application/pdf' })
      const { error } = await uploadToDocumentazione({
        localeId,
        file,
        titolo: fileName.replace(/\.pdf$/i, ''),
        tags: ['temperature'],
        userId: user.id,
      })
      if (error) { setLoadError(error.message || 'Errore durante l\'invio in Documentazione.'); return }
      setDocInfo('Documento inviato in Documentazione.')
    } finally {
      setSendingDoc(false)
    }
  }

  const monthLabel = useMemo(() => monthCursor.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }), [monthCursor])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Caricamento...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5"><Icon name="temperature" className="w-7 h-7 text-emerald-600" /> Temperature</h1>
          <p className="text-gray-500 mt-1">Monitora le temperature delle zone</p>
        </div>
      </div>

      {loadError ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}
      {docInfo ? (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {docInfo}
        </div>
      ) : null}

      {zone.length > 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {zone.map((z) => (
            <div key={z.id} className="rounded-2xl p-4 border bg-white border-gray-100 shadow-sm">
              <p className="text-sm text-gray-500">{z.nome}</p>
              <p className="text-xs text-gray-400 mt-1">Soglia: {z.soglia_min}° / {z.soglia_max}°C</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Calendario</p>
            <p className="text-lg font-semibold text-gray-800 capitalize">{monthLabel}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
              onClick={() => setMonthCursor((prev) => addMonths(prev, -1))}
            >
              ←
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
              onClick={() => setMonthCursor((prev) => addMonths(prev, 1))}
            >
              →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-gray-100">
          {weekdays.map((w) => (
            <div key={w} className="py-2 text-center text-xs font-semibold text-gray-500 bg-gray-50">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarDays.map((d) => {
            const inMonth = d.getMonth() === monthCursor.getMonth()
            const key = dayKeyFromDate(d)
            const byZona = monthDataByDay[key] || null
            const any = byZona && Object.keys(byZona).length > 0
            const totalZones = zone.length
            const filledCount = byZona ? Object.keys(byZona).length : 0
            const complete = totalZones > 0 && filledCount >= totalZones
            const isToday = isSameDay(d, new Date())

            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => setActiveCellDay(key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setActiveCellDay(key)
                }}
                className={`group relative h-24 border-b border-r border-gray-100 p-2 text-left transition-colors outline-none ${
                  inMonth ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'
                } ${activeCellDay === key ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className={`${inMonth ? 'text-gray-700' : 'text-gray-400'} text-sm font-semibold`}>
                    {isToday ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white">
                        {d.getDate()}
                      </span>
                    ) : (
                      d.getDate()
                    )}
                  </div>
                  {any ? (
                    <span
                      className={`mt-1 inline-block w-2 h-2 rounded-full ${
                        complete ? 'bg-emerald-500' : 'bg-amber-400'
                      }`}
                    />
                  ) : (
                    <span className="mt-1 inline-block w-2 h-2 rounded-full bg-transparent" />
                  )}
                </div>

                <div className="mt-2 space-y-1">
                  {zone.slice(0, 2).map((z, idx) => {
                    const r = byZona ? byZona[z.id] : null
                    if (!r) return null
                    const normalized = normalizeConformeNote(r.note)
                    const label = String.fromCharCode(65 + idx)
                    const value = normalized.isConforme ? 'OK' : `${r.temperatura}°`
                    return (
                      <div
                        key={z.id}
                        className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs font-semibold ${
                          normalized.isConforme ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        <span>{label}</span>
                        <span className="truncate">{value}</span>
                      </div>
                    )
                  })}
                  {zone.length > 2 && any ? (
                    <div className="text-[11px] text-gray-400">
                      +{Math.max(0, filledCount - 2)}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openDay(key)
                  }}
                  className={`absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${
                    activeCellDay === key ? 'opacity-100' : ''
                  }`}
                  aria-label="Aggiungi"
                >
                  <div className="w-10 h-10 rounded-full bg-white shadow border border-gray-200 flex items-center justify-center text-gray-700 text-xl">
                    +
                  </div>
                </button>
              </div>
            )
          })}
        </div>

        {monthLoading ? (
          <div className="p-3 text-sm text-gray-500 border-t border-gray-100">Caricamento calendario...</div>
        ) : null}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col lg:flex-row lg:items-end gap-4 lg:justify-between">
          <div>
            <h2 className="font-semibold text-gray-700">Storico e registro</h2>
            <p className="text-sm text-gray-500 mt-0.5">Consulta ed esporta le temperature rilevate</p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Mese</label>
              <select
                value={storicoMese}
                onChange={(e) => setStoricoMese(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {mesiNomi.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Anno</label>
              <select
                value={storicoAnno}
                onChange={(e) => setStoricoAnno(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {anniDisponibili.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Zona</label>
              <select
                value={storicoZona}
                onChange={(e) => setStoricoZona(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Tutte le zone</option>
                {zone.map((z) => <option key={z.id} value={z.id}>{z.nome}</option>)}
              </select>
            </div>
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={exporting || sendingDoc || storico.length === 0}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Icon name="file" className="w-4 h-4" />
              {exporting ? 'Generazione...' : 'Scarica PDF'}
            </button>
            <button
              type="button"
              onClick={handleSendDocumentazione}
              disabled={exporting || sendingDoc || storico.length === 0}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Icon name="documentazione" className="w-4 h-4" />
              {sendingDoc ? 'Invio...' : 'Invia a Documentazione'}
            </button>
          </div>
        </div>

        {storico.length > 0 && (
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-sm text-gray-500 flex gap-6">
            <span>Rilevazioni: <span className="font-semibold text-gray-700">{storico.length}</span></span>
            <span>Fuori soglia: <span className={`font-semibold ${storicoFuoriSoglia > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{storicoFuoriSoglia}</span></span>
          </div>
        )}

        {storicoLoading ? (
          <div className="p-8 text-center text-gray-400">Caricamento storico...</div>
        ) : storico.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nessuna rilevazione nel periodo selezionato</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2.5 font-medium">Data</th>
                  <th className="px-4 py-2.5 font-medium">Zona</th>
                  <th className="px-4 py-2.5 font-medium text-center">Soglia</th>
                  <th className="px-4 py-2.5 font-medium text-center">Temp.</th>
                  <th className="px-4 py-2.5 font-medium">Operatore</th>
                  <th className="px-4 py-2.5 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {storico.map((r) => {
                  const fuori = isFuoriSoglia(r)
                  const z = r.zone_temperatura
                  const normalized = normalizeConformeNote(r.note)
                  return (
                    <tr key={r.id} className={`border-b border-gray-50 ${fuori ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                        {new Date(r.data_ora).toLocaleDateString('it-IT')}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">{z?.nome || '—'}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500 whitespace-nowrap">
                        {z?.soglia_min != null && z?.soglia_max != null ? `${z.soglia_min}° / ${z.soglia_max}°` : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-center font-bold ${fuori ? 'text-red-600' : 'text-emerald-600'}`}>
                        {r.temperatura}°C
                        {fuori && <span className="block text-[11px] font-semibold text-red-500">fuori soglia</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{r.profili?.nome || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400">{normalized.note || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && selectedDay ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={closeModal}
          />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800 capitalize">{formatLongDateIt(selectedDay)}</h3>
              <button type="button" className="text-gray-400 hover:text-gray-600 text-2xl" onClick={closeModal}>
                ×
              </button>
            </div>

            <div className="px-6 py-4">
              {submitError ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                  {submitError}
                </div>
              ) : null}

              <div className="space-y-3">
                {zone.map((z) => {
                  const values = dayForm[z.id] || { conforme: true, temperatura: '', note: '' }
                  return (
                    <div key={z.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-800">{z.nome}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Soglia: {z.soglia_min}° / {z.soglia_max}°C</p>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={values.conforme}
                            onChange={(e) =>
                              setDayForm((prev) => ({
                                ...prev,
                                [z.id]: { ...values, conforme: e.target.checked, temperatura: e.target.checked ? values.temperatura : '' },
                              }))
                            }
                          />
                          Conforme
                        </label>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Temperatura (°C)</label>
                          <input
                            type="number"
                            step="0.1"
                            required={!values.conforme}
                            disabled={values.conforme}
                            value={values.temperatura}
                            onChange={(e) =>
                              setDayForm((prev) => ({
                                ...prev,
                                [z.id]: { ...values, temperatura: e.target.value },
                              }))
                            }
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-500"
                            placeholder={values.conforme ? 'Auto (conforme)' : 'es. 3.5'}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                          <input
                            type="text"
                            value={values.note}
                            onChange={(e) =>
                              setDayForm((prev) => ({
                                ...prev,
                                [z.id]: { ...values, note: e.target.value },
                              }))
                            }
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            placeholder="Note opzionali..."
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl font-medium transition-colors"
                onClick={closeModal}
                disabled={saving}
              >
                Annulla
              </button>
              <button
                type="button"
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-60"
                onClick={saveDay}
                disabled={saving}
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
