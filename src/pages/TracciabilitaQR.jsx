import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CACHE_KEY = (lotto) => `haccpro.qr.pin.${lotto}`
const PIN_EXPIRY_MS = 4 * 60 * 60 * 1000 // 4 ore

export default function TracciabilitaQR() {
  const { lotto } = useParams()
  const [step, setStep] = useState('pin') // 'pin' | 'loading' | 'data' | 'error'
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)
  const [data, setData] = useState(null)
  const [allegatiUrl, setAllegatiUrl] = useState({}) // path → signedUrl

  // Controlla se c'è un PIN cached valido
  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY(lotto))
    if (cached) {
      try {
        const { localeId, exp } = JSON.parse(cached)
        if (exp > Date.now()) {
          loadTracciabilita(localeId)
          return
        }
      } catch {
        localStorage.removeItem(CACHE_KEY(lotto))
      }
    }
  }, [lotto])

  const verificaPin = async () => {
    if (pin.length < 4) { setPinError('Inserisci il PIN del locale'); return }
    setPinLoading(true)
    setPinError('')

    // Cerca il locale con questo PIN
    const { data: locali, error } = await supabase
      .from('locali')
      .select('id, nome, tracciabilita_pin')
      .eq('tracciabilita_pin', pin)

    if (error || !locali?.length) {
      setPinError('PIN non corretto')
      setPinLoading(false)
      return
    }

    // Cerca la produzione con questo lotto tra i locali trovati
    let localeId = null
    for (const locale of locali) {
      const { data: etichette } = await supabase
        .from('etichette')
        .select('id, locale_id')
        .eq('numero_lotto', lotto)
        .eq('locale_id', locale.id)
        .limit(1)
      if (etichette?.length) {
        localeId = locale.id
        break
      }
    }

    if (!localeId) {
      setPinError('Lotto non trovato per questo locale')
      setPinLoading(false)
      return
    }

    // Cache PIN per 4 ore
    localStorage.setItem(CACHE_KEY(lotto), JSON.stringify({
      localeId,
      exp: Date.now() + PIN_EXPIRY_MS,
    }))

    setPinLoading(false)
    loadTracciabilita(localeId)
  }

  const loadTracciabilita = async (localeId) => {
    setStep('loading')
    try {
      // 1. Trova etichetta + produzione
      const { data: etichetta } = await supabase
        .from('etichette')
        .select(`
          id, numero_lotto, data_produzione, data_scadenza,
          produzioni(
            id, quantita_prodotta, note,
            ricette(
              id, nome, giorni_scadenza_sottovuoto,
              ricette_ingredienti(
                id, quantita, unita,
                prodotti(
                  id, nome,
                  categorie(nome, icona),
                  fornitori(nome, telefono)
                )
              )
            )
          ),
          profili(nome),
          locali(nome)
        `)
        .eq('numero_lotto', lotto)
        .eq('locale_id', localeId)
        .single()

      if (!etichetta) { setStep('error'); return }

      const ricetta = etichetta.produzioni?.ricette
      const ingredienti = ricetta?.ricette_ingredienti || []
      const dataProd = etichetta.data_produzione

      // 2. Per ogni ingrediente trova l'arrivo merci più recente ≤ data produzione
      const arriviPerIngrediente = await Promise.all(
        ingredienti.map(async (ing) => {
          const { data: arrivi } = await supabase
            .from('arrivi_merci')
            .select('id, data_arrivo, scadenza, lotto, note, allegati')
            .eq('prodotto_id', ing.prodotti.id)
            .eq('locale_id', localeId)
            .lte('data_arrivo', dataProd)
            .order('data_arrivo', { ascending: false })
            .limit(1)

          return {
            ...ing,
            arrivo: arrivi?.[0] || null,
          }
        })
      )

      setData({
        etichetta,
        ricetta,
        ingredienti: arriviPerIngrediente,
        locale: etichetta.locali?.nome,
        operatore: etichetta.profili?.nome,
      })
      setStep('data')
    } catch (e) {
      console.error(e)
      setStep('error')
    }
  }

  const getSignedUrl = async (path) => {
    if (allegatiUrl[path]) {
      window.open(allegatiUrl[path], '_blank')
      return
    }
    const { data } = await supabase.storage
      .from('allegati-merci')
      .createSignedUrl(path, 300) // 5 minuti
    if (data?.signedUrl) {
      setAllegatiUrl(prev => ({ ...prev, [path]: data.signedUrl }))
      window.open(data.signedUrl, '_blank')
    }
  }

  const fmtDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('it-IT')
  }

  const isScaduto = (iso) => iso && new Date(iso) < new Date()
  const isVicino = (iso) => {
    if (!iso) return false
    const diff = new Date(iso) - new Date()
    return diff > 0 && diff < 3 * 86400000
  }

  // --- PIN screen ---
  if (step === 'pin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-6">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🔍</div>
            <h1 className="text-xl font-bold text-gray-800">Tracciabilità</h1>
            <p className="text-sm text-gray-500 mt-1">Lotto: <span className="font-mono font-semibold text-gray-700">{lotto}</span></p>
            <p className="text-xs text-gray-400 mt-2">Inserisci il PIN del locale per visualizzare i dati</p>
          </div>

          {/* PIN input — tastierino grande mobile-friendly */}
          <div className="mb-4">
            <div className="flex justify-center gap-3 mb-4">
              {[0, 1, 2, 3].map(i => (
                <div key={i}
                  className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-colors ${
                    pin.length > i ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-300'
                  }`}>
                  {pin.length > i ? '●' : '○'}
                </div>
              ))}
            </div>

            {/* Tastierino numerico */}
            <div className="grid grid-cols-3 gap-2">
              {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k, i) => (
                <button key={i}
                  onClick={() => {
                    if (k === '⌫') setPin(p => p.slice(0, -1))
                    else if (k !== '' && pin.length < 4) setPin(p => p + k)
                  }}
                  disabled={k === ''}
                  className={`h-12 rounded-xl text-lg font-semibold transition-colors ${
                    k === '' ? 'invisible' :
                    k === '⌫' ? 'bg-gray-100 hover:bg-gray-200 text-gray-600' :
                    'bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-gray-800 border border-gray-200'
                  }`}>
                  {k}
                </button>
              ))}
            </div>
          </div>

          {pinError && (
            <p className="text-sm text-red-500 text-center mb-3">{pinError}</p>
          )}

          <button
            onClick={verificaPin}
            disabled={pin.length < 4 || pinLoading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-colors">
            {pinLoading ? 'Verifica...' : 'Accedi'}
          </button>
        </div>
      </div>
    )
  }

  // --- Loading ---
  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-3 animate-pulse">🔍</div>
          <p>Caricamento tracciabilità...</p>
        </div>
      </div>
    )
  }

  // --- Error ---
  if (step === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-3">❌</div>
          <p className="font-semibold text-gray-700">Lotto non trovato</p>
          <p className="text-sm mt-1">Il lotto <span className="font-mono">{lotto}</span> non esiste o non è accessibile.</p>
          <button onClick={() => { setStep('pin'); setPin(''); setPinError('') }}
            className="mt-4 text-emerald-600 text-sm underline">
            Riprova
          </button>
        </div>
      </div>
    )
  }

  // --- Dati tracciabilità ---
  const { etichetta, ricetta, ingredienti, locale, operatore } = data

  return (
    <div className="min-h-screen bg-gray-50 pb-10">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-bold text-gray-800 text-lg">🔍 Tracciabilità</h1>
            <p className="text-xs text-gray-400 font-mono">{lotto}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">{locale}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* Card prodotto */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-emerald-500 px-4 py-3">
            <h2 className="text-white font-bold text-lg">{ricetta?.nome || '—'}</h2>
            {operatore && <p className="text-emerald-100 text-xs mt-0.5">Op: {operatore}</p>}
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Prodotto il</p>
              <p className="font-semibold text-gray-800">{fmtDate(etichetta.data_produzione)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Scade il</p>
              <p className={`font-semibold ${isScaduto(etichetta.data_scadenza) ? 'text-red-600' : isVicino(etichetta.data_scadenza) ? 'text-orange-500' : 'text-gray-800'}`}>
                {fmtDate(etichetta.data_scadenza)}
                {isScaduto(etichetta.data_scadenza) && ' ⚠️'}
              </p>
            </div>
            {etichetta.produzioni?.quantita_prodotta && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Porzioni</p>
                <p className="font-semibold text-gray-800">{etichetta.produzioni.quantita_prodotta}</p>
              </div>
            )}
          </div>
        </div>

        {/* Ingredienti + arrivi */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
            📦 Tracciabilità ingredienti ({ingredienti.length})
          </p>
          <div className="space-y-2">
            {ingredienti.map((ing, i) => {
              const prodotto = ing.prodotti
              const arrivo = ing.arrivo
              const allegati = arrivo?.allegati || []
              return (
                <div key={ing.id || i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Intestazione ingrediente */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                    <span className="text-xl">{prodotto?.categorie?.icona || '📦'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm">{prodotto?.nome}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {prodotto?.categorie?.nome && (
                          <span className="text-xs text-gray-400">{prodotto.categorie.nome}</span>
                        )}
                        {prodotto?.fornitori?.nome && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                            🚚 {prodotto.fornitori.nome}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {ing.quantita}{ing.unita}
                    </span>
                  </div>

                  {/* Arrivo merce */}
                  {arrivo ? (
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Arrivo più recente</p>
                          <p className="text-sm font-medium text-gray-700">{fmtDate(arrivo.data_arrivo)}</p>
                          {arrivo.lotto && (
                            <p className="text-xs text-gray-500 font-mono mt-0.5">Lotto fornitore: {arrivo.lotto}</p>
                          )}
                          {arrivo.scadenza && (
                            <p className={`text-xs mt-0.5 ${isScaduto(arrivo.scadenza) ? 'text-red-500' : 'text-gray-400'}`}>
                              Scad. ingrediente: {fmtDate(arrivo.scadenza)}
                              {isScaduto(arrivo.scadenza) && ' ⚠️'}
                            </p>
                          )}
                          {arrivo.note && (
                            <p className="text-xs text-gray-400 italic mt-0.5">{arrivo.note}</p>
                          )}
                        </div>

                        {/* Allegati */}
                        {allegati.length > 0 && (
                          <div className="flex flex-col gap-1.5 flex-shrink-0">
                            {allegati.map((path, ai) => {
                              const isImg = /\.(jpe?g|png|gif|webp)$/i.test(path)
                              return (
                                <button key={ai}
                                  onClick={() => getSignedUrl(path)}
                                  className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs px-3 py-1.5 rounded-xl transition-colors font-medium">
                                  <span>{isImg ? '🖼️' : '📄'}</span>
                                  <span>{isImg ? 'Foto' : 'Doc'} {ai + 1}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-3">
                      <p className="text-xs text-gray-400 italic">Nessun arrivo registrato prima della produzione</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-2">
          <p className="text-xs text-gray-300">HACCPro — Tracciabilità HACCP</p>
          <p className="text-xs text-gray-300 font-mono">{lotto}</p>
        </div>
      </div>
    </div>
  )
}
