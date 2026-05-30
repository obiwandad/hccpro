import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLocale } from '../context/LocaleContext'
import { Icon } from '../lib/icons'

// Etichette dei due incassi — modificabili qui se vuoi rinominarli (es. "Sala" / "Asporto")
const LABEL_A = 'Incasso A'
const LABEL_B = 'Incasso B'

const weekdays = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM']

const dayKeyFromDate = (d) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

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

const euro0 = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const euro2 = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const toNumber = (v) => {
  if (v === '' || v == null) return 0
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const emptyForm = { incasso_a: '', incasso_b: '', chiusura: false, note: '' }

export default function Incassi() {
  const { profilo, activeLocaleId, loading: localeLoading } = useLocale()

  const [monthCursor, setMonthCursor] = useState(() => monthStartDate(new Date()))
  const [monthDataByDay, setMonthDataByDay] = useState({})
  const [monthLoading, setMonthLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [activeCellDay, setActiveCellDay] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)

  const localeId = activeLocaleId ?? profilo?.locale_id ?? null

  const fetchMonth = async (lid, monthStart) => {
    if (!lid) return
    setMonthLoading(true)
    setLoadError('')
    try {
      const start = dayKeyFromDate(new Date(monthStart.getFullYear(), monthStart.getMonth(), 1))
      const end = dayKeyFromDate(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))

      const { data, error } = await supabase
        .from('incassi')
        .select('id, data, incasso_a, incasso_b, chiusura, note')
        .eq('locale_id', lid)
        .gte('data', start)
        .lt('data', end)

      if (error) {
        setLoadError(error.message || 'Errore nel caricamento degli incassi.')
        return
      }

      const map = {}
      for (const r of data || []) {
        map[String(r.data).slice(0, 10)] = r
      }
      setMonthDataByDay(map)
    } finally {
      setMonthLoading(false)
    }
  }

  useEffect(() => {
    if (localeLoading) return
    if (!localeId) {
      setMonthDataByDay({})
      return
    }
    fetchMonth(localeId, monthCursor)
  }, [localeId, monthCursor, localeLoading])

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

  const monthLabel = useMemo(
    () => monthCursor.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
    [monthCursor]
  )

  const totals = useMemo(() => {
    let a = 0
    let b = 0
    let days = 0
    for (const key of Object.keys(monthDataByDay)) {
      const d = new Date(`${key}T12:00:00`)
      if (d.getMonth() !== monthCursor.getMonth() || d.getFullYear() !== monthCursor.getFullYear()) continue
      const r = monthDataByDay[key]
      a += Number(r.incasso_a) || 0
      b += Number(r.incasso_b) || 0
      days += 1
    }
    return { a, b, total: a + b, days }
  }, [monthDataByDay, monthCursor])

  const openDay = (dayKey) => {
    setSubmitError('')
    setActiveCellDay(null)
    setSelectedDay(dayKey)
    const existing = monthDataByDay[dayKey]
    if (existing) {
      setForm({
        incasso_a: existing.incasso_a != null ? String(existing.incasso_a) : '',
        incasso_b: existing.incasso_b != null ? String(existing.incasso_b) : '',
        chiusura: !!existing.chiusura,
        note: existing.note || '',
      })
    } else {
      setForm(emptyForm)
    }
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setSelectedDay(null)
    setSubmitError('')
  }

  const saveDay = async () => {
    setSubmitError('')
    if (!localeId) {
      setSubmitError('Nessun locale selezionato.')
      return
    }
    if (!selectedDay) return

    setSaving(true)
    try {
      const chiusura = !!form.chiusura
      const payload = {
        locale_id: localeId,
        data: selectedDay,
        incasso_a: chiusura ? 0 : toNumber(form.incasso_a),
        incasso_b: chiusura ? 0 : toNumber(form.incasso_b),
        chiusura,
        note: form.note?.trim() ? form.note.trim() : null,
        operatore_id: profilo?.id ?? null,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('incassi')
        .upsert(payload, { onConflict: 'locale_id,data' })

      if (error) {
        setSubmitError(error.message || 'Errore durante il salvataggio.')
        return
      }

      await fetchMonth(localeId, monthCursor)
      closeModal()
    } catch (e) {
      setSubmitError(e?.message || 'Errore imprevisto.')
    } finally {
      setSaving(false)
    }
  }

  const deleteDay = async () => {
    if (!localeId || !selectedDay) return
    if (!monthDataByDay[selectedDay]) {
      closeModal()
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('incassi')
        .delete()
        .eq('locale_id', localeId)
        .eq('data', selectedDay)
      if (error) {
        setSubmitError(error.message || 'Errore durante l\'eliminazione.')
        return
      }
      await fetchMonth(localeId, monthCursor)
      closeModal()
    } finally {
      setSaving(false)
    }
  }

  if (localeLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Caricamento...</div>
  }

  if (!localeId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Nessun locale associato al tuo profilo.
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5"><Icon name="incassi" className="w-7 h-7 text-emerald-600" /> Incassi</h1>
          <p className="text-gray-500 mt-1">Gestione incassi giornalieri</p>
        </div>
      </div>

      {loadError ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {/* Riepilogo del mese */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-2xl p-4 border bg-blue-50 border-blue-100 shadow-sm">
          <p className="text-sm text-blue-700">{LABEL_A}</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{euro0.format(totals.a)}</p>
        </div>
        <div className="rounded-2xl p-4 border bg-emerald-50 border-emerald-100 shadow-sm">
          <p className="text-sm text-emerald-700">{LABEL_B}</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{euro0.format(totals.b)}</p>
        </div>
        <div className="rounded-2xl p-4 border bg-gray-900 border-gray-900 shadow-sm">
          <p className="text-sm text-gray-300">Totale mese</p>
          <p className="text-2xl font-bold text-white mt-1">{euro0.format(totals.total)}</p>
        </div>
        <div className="rounded-2xl p-4 border bg-white border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500">Giorni registrati</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{totals.days}</p>
        </div>
      </div>

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
              onClick={() => setMonthCursor(monthStartDate(new Date()))}
            >
              Oggi
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
            const record = monthDataByDay[key] || null
            const has = !!record
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
                className={`group relative h-28 border-b border-r border-gray-100 p-2 text-left transition-colors outline-none ${
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
                  <span
                    className={`mt-1 inline-block w-2 h-2 rounded-full ${
                      has ? 'bg-emerald-500' : 'bg-transparent'
                    }`}
                  />
                </div>

                {has ? (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs font-semibold bg-blue-50 text-blue-700">
                      <span>A</span>
                      <span className="truncate">{euro0.format(Number(record.incasso_a) || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700">
                      <span>B</span>
                      <span className="truncate">{euro0.format(Number(record.incasso_b) || 0)}</span>
                    </div>
                    {record.chiusura ? (
                      <div className="text-[11px] font-medium text-gray-400">Chiuso</div>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openDay(key)
                  }}
                  className={`absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${
                    activeCellDay === key ? 'opacity-100' : ''
                  }`}
                  aria-label="Modifica incasso"
                >
                  <div className="w-10 h-10 rounded-full bg-white shadow border border-gray-200 flex items-center justify-center text-gray-700 text-xl">
                    {has ? '✎' : '+'}
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

      {modalOpen && selectedDay ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
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

              {/* Giorno di chiusura */}
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">Giorno di Chiusura</p>
                  <p className="text-xs text-gray-500 mt-0.5">Imposta incassi a zero per questo giorno</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.chiusura}
                  onClick={() => setForm((p) => ({ ...p, chiusura: !p.chiusura }))}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                    form.chiusura ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      form.chiusura ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{LABEL_A} (€)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    disabled={form.chiusura}
                    value={form.chiusura ? '' : form.incasso_a}
                    onChange={(e) => setForm((p) => ({ ...p, incasso_a: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{LABEL_B} (€)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    disabled={form.chiusura}
                    value={form.chiusura ? '' : form.incasso_b}
                    onChange={(e) => setForm((p) => ({ ...p, incasso_b: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-400"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {!form.chiusura ? (
                <p className="mt-2 text-sm text-gray-500">
                  Totale giorno:{' '}
                  <span className="font-semibold text-gray-800">
                    {euro2.format(toNumber(form.incasso_a) + toNumber(form.incasso_b))}
                  </span>
                </p>
              ) : null}

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <textarea
                  rows={3}
                  value={form.note}
                  onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Note opzionali..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <div>
                {monthDataByDay[selectedDay] ? (
                  <button
                    type="button"
                    className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-60"
                    onClick={deleteDay}
                    disabled={saving}
                  >
                    Elimina
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
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
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-60"
                  onClick={saveDay}
                  disabled={saving}
                >
                  {saving ? 'Salvataggio...' : 'Salva'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
