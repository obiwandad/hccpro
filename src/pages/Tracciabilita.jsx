import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import RicezioneRapida from '../components/RicezioneRapida'

const STEP_FOTO = 1
const STEP_PRODOTTO = 2
const STEP_CONFERMA = 3

export default function Tracciabilita() {
  const { user } = useAuth()
  const { activeLocaleId } = useLocale()
  const [profilo, setProfilo] = useState(null)
  const [arrivi, setArrivi] = useState([])
  const [ricezioni, setRicezioni] = useState([])
  const [prodotti, setProdotti] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalita, setModalita] = useState(null) // null | 'rapida' | 'singola'
  const [step, setStep] = useState(STEP_FOTO)
  const [uploading, setUploading] = useState(false)
  const [ricerca, setRicerca] = useState('')
  const [vistaAttiva, setVistaAttiva] = useState('ricezioni') // 'ricezioni' | 'prodotti'
  const [allegati, setAllegati] = useState([])
  const [anteprima, setAnteprima] = useState([])
  const [form, setForm] = useState({
    prodotto_id: '',
    lotto: '',
    data_arrivo: new Date().toISOString().split('T')[0],
    scadenza: '',
    note: '',
  })
  const [avanzate, setAvanzate] = useState(false)
  const fotoRef = useRef()
  const docRef = useRef()

  const fetchArrivi = async (locale_id) => {
    const { data } = await supabase
      .from('arrivi_merci')
      .select('*, prodotti(nome, categorie(icona)), profili(nome)')
      .eq('locale_id', locale_id)
      .order('data_arrivo', { ascending: false })
      .limit(100)
    setArrivi(data || [])
  }

  const fetchRicezioni = async (locale_id) => {
    const { data } = await supabase
      .from('ricezioni')
      .select('*, fornitori(nome), profili(nome)')
      .eq('locale_id', locale_id)
      .order('data_ricezione', { ascending: false })
      .limit(50)
    setRicezioni(data || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: prof } = await supabase.from('profili').select('*, locali(nome)').eq('user_id', user.id).single()
      setProfilo(prof)
      const localeId = activeLocaleId ?? prof?.locale_id
      if (!localeId) {
        setLoading(false)
        return
      }
      await Promise.all([fetchArrivi(localeId), fetchRicezioni(localeId)])
      const { data: prods } = await supabase.from('prodotti').select('*, categorie(nome, icona)').eq('locale_id', localeId).order('nome')
      setProdotti(prods || [])
      setLoading(false)
    }
    if (user) init()
  }, [activeLocaleId, user])

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files)
    setAllegati(prev => [...prev, ...files])
    const previews = files.map(f => ({
      name: f.name,
      type: f.type,
      url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
    }))
    setAnteprima(prev => [...prev, ...previews])
  }

  const removeAllegato = (i) => {
    setAllegati(prev => prev.filter((_, idx) => idx !== i))
    setAnteprima(prev => prev.filter((_, idx) => idx !== i))
  }

  const selectProdotto = (p) => {
    const scadenza = new Date()
    scadenza.setDate(scadenza.getDate() + (p.giorni_scadenza_default || 3))
    setForm(prev => ({ ...prev, prodotto_id: p.id, scadenza: scadenza.toISOString().split('T')[0] }))
    setStep(STEP_CONFERMA)
  }

  const handleSalva = async () => {
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    setUploading(true)
    const urls = []
    for (const file of allegati) {
      const path = `${localeId}/${Date.now()}_${file.name}`
      const { data, error } = await supabase.storage.from('allegati-merci').upload(path, file)
      if (!error) urls.push(data.path)
    }
    await supabase.from('arrivi_merci').insert({
      ...form,
      operatore_id: profilo.id,
      locale_id: localeId,
      allegati: urls,
    })
    await fetchArrivi(localeId)
    resetForm()
    setUploading(false)
  }

  const resetForm = () => {
    setForm({ prodotto_id: '', lotto: '', data_arrivo: new Date().toISOString().split('T')[0], scadenza: '', note: '' })
    setAllegati([])
    setAnteprima([])
    setStep(STEP_FOTO)
    setAvanzate(false)
    setRicerca('')
    setModalita(null)
  }

  const handleRicezioneComplete = async () => {
    const localeId = activeLocaleId ?? profilo?.locale_id
    if (!localeId) return
    await Promise.all([fetchArrivi(localeId), fetchRicezioni(localeId)])
    setModalita(null)
  }

  const getSignedUrl = async (path) => {
    const { data } = await supabase.storage.from('allegati-merci').createSignedUrl(path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const prodottoSelezionato = prodotti.find(p => p.id === form.prodotto_id)
  const prodottiFiltrati = prodotti.filter(p => p.nome.toLowerCase().includes(ricerca.toLowerCase()))
  const isScaduto = (data) => data && new Date(data) < new Date()
  const isVicino = (data) => {
    if (!data) return false
    const diff = new Date(data) - new Date()
    return diff > 0 && diff < 3 * 86400000
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Caricamento...</div>

  return (
    <div className="max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📦 Tracciabilità</h1>
          <p className="text-gray-500 text-sm mt-0.5">Registra gli arrivi merce</p>
        </div>
        {!modalita && (
          <div className="flex gap-2">
            <button onClick={() => setModalita('rapida')}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-2xl font-semibold text-sm transition-colors shadow-sm">
              ⚡ Ricezione rapida
            </button>
            <button onClick={() => setModalita('singola')}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-2xl font-semibold text-sm transition-colors">
              + Singolo
            </button>
          </div>
        )}
      </div>

      {/* RICEZIONE RAPIDA */}
      {modalita === 'rapida' && (
        <RicezioneRapida
          onComplete={handleRicezioneComplete}
          onCancel={() => setModalita(null)}
        />
      )}

      {/* FORM SINGOLO */}
      {modalita === 'singola' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
          <div className="flex border-b border-gray-100">
            {[{ n: 1, label: 'Documento' }, { n: 2, label: 'Prodotto' }, { n: 3, label: 'Conferma' }].map((s) => (
              <div key={s.n} className={`flex-1 py-3 text-center text-xs font-semibold transition-colors ${step === s.n ? 'bg-emerald-500 text-white' : step > s.n ? 'bg-emerald-50 text-emerald-600' : 'text-gray-400'}`}>
                {step > s.n ? '✓' : s.n}. {s.label}
              </div>
            ))}
          </div>

          <div className="p-5">
            {/* STEP 1 */}
            {step === STEP_FOTO && (
              <div>
                <p className="text-gray-600 font-medium mb-4">Allega documento (opzionale)</p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button onClick={() => fotoRef.current.click()}
                    className="flex flex-col items-center gap-2 bg-blue-50 border-2 border-blue-200 hover:border-blue-400 rounded-2xl p-5 transition-colors">
                    <span className="text-4xl">📸</span>
                    <span className="text-sm font-semibold text-blue-700">Scatta foto</span>
                  </button>
                  <input ref={fotoRef} type="file" accept="image/*" capture="environment" multiple onChange={handleFileChange} className="hidden" />
                  <button onClick={() => docRef.current.click()}
                    className="flex flex-col items-center gap-2 bg-gray-50 border-2 border-gray-200 hover:border-gray-400 rounded-2xl p-5 transition-colors">
                    <span className="text-4xl">📄</span>
                    <span className="text-sm font-semibold text-gray-700">Carica file</span>
                  </button>
                  <input ref={docRef} type="file" accept="image/*,.pdf" multiple onChange={handleFileChange} className="hidden" />
                </div>
                {anteprima.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {anteprima.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                        {a.url ? <img src={a.url} alt="" className="w-10 h-10 rounded-lg object-cover" /> : <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">📄</div>}
                        <span className="text-sm text-gray-700 flex-1 truncate">{a.name}</span>
                        <button onClick={() => removeAllegato(i)} className="text-gray-400 hover:text-red-500 text-xl font-bold">×</button>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setStep(STEP_PRODOTTO)} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-2xl font-semibold transition-colors">
                  {anteprima.length > 0 ? 'Continua →' : 'Salta →'}
                </button>
              </div>
            )}

            {/* STEP 2 */}
            {step === STEP_PRODOTTO && (
              <div>
                <p className="text-gray-600 font-medium mb-3">Quale prodotto?</p>
                <input type="text" value={ricerca} onChange={e => setRicerca(e.target.value)}
                  placeholder="🔍 Cerca prodotto..." autoFocus
                  className="w-full px-4 py-3 border border-gray-200 rounded-2xl mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm" />
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {prodottiFiltrati.map((p) => (
                    <button key={p.id} onClick={() => selectProdotto(p)}
                      className="w-full flex items-center justify-between px-4 py-3.5 bg-gray-50 hover:bg-emerald-50 border border-gray-100 hover:border-emerald-300 rounded-2xl transition-colors text-left">
                      <div className="flex items-center gap-2">
                        <span>{p.categorie?.icona || '📦'}</span>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{p.nome}</p>
                          {p.categorie?.nome && <p className="text-xs text-gray-400">{p.categorie.nome}</p>}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">+{p.giorni_scadenza_default}gg →</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setStep(STEP_FOTO)} className="mt-3 w-full text-gray-400 text-sm py-2">← Indietro</button>
              </div>
            )}

            {/* STEP 3 */}
            {step === STEP_CONFERMA && prodottoSelezionato && (
              <div>
                <p className="text-gray-600 font-medium mb-4">Controlla e salva</p>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{prodottoSelezionato.categorie?.icona || '📦'}</span>
                    <p className="font-bold text-emerald-800">{prodottoSelezionato.nome}</p>
                  </div>
                  <button onClick={() => setStep(STEP_PRODOTTO)} className="text-xs text-emerald-600 underline">cambia</button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Data arrivo</label>
                    <input type="date" value={form.data_arrivo} onChange={e => setForm({ ...form, data_arrivo: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Scadenza</label>
                    <input type="date" value={form.scadenza} onChange={e => setForm({ ...form, scadenza: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm" />
                  </div>
                </div>
                {anteprima.length > 0 && (
                  <div className="flex gap-2 mb-3">
                    {anteprima.map((a, i) => (
                      a.url ? <img key={i} src={a.url} alt="" className="w-12 h-12 rounded-xl object-cover border border-gray-200" />
                        : <div key={i} className="w-12 h-12 bg-red-50 border border-gray-200 rounded-xl flex items-center justify-center text-xl">📄</div>
                    ))}
                  </div>
                )}
                <button onClick={() => setAvanzate(!avanzate)} className="text-xs text-gray-400 hover:text-gray-600 mb-3 flex items-center gap-1">
                  {avanzate ? '▲' : '▼'} Lotto e note
                </button>
                {avanzate && (
                  <div className="space-y-3 mb-3">
                    <input type="text" value={form.lotto} onChange={e => setForm({ ...form, lotto: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="Numero lotto (dal fornitore)" />
                    <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" rows={2} placeholder="Note..." />
                  </div>
                )}
                <button onClick={handleSalva} disabled={uploading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white py-4 rounded-2xl font-bold text-base transition-colors">
                  {uploading ? '⏳ Salvataggio...' : '✓ Salva Arrivo'}
                </button>
                <button onClick={() => setStep(STEP_PRODOTTO)} className="mt-2 w-full text-gray-400 text-sm py-2">← Indietro</button>
              </div>
            )}
          </div>
          <div className="px-5 pb-4">
            <button onClick={resetForm} className="w-full text-gray-300 hover:text-gray-500 text-xs py-1">Annulla</button>
          </div>
        </div>
      )}

      {/* Toggle vista */}
      {!modalita && (
        <div className="flex bg-gray-100 rounded-2xl p-1 mb-4">
          <button onClick={() => setVistaAttiva('ricezioni')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${vistaAttiva === 'ricezioni' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
            🚚 Ricezioni ({ricezioni.length})
          </button>
          <button onClick={() => setVistaAttiva('prodotti')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${vistaAttiva === 'prodotti' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
            📦 Prodotti ({arrivi.length})
          </button>
        </div>
      )}

      {/* VISTA RICEZIONI */}
      {!modalita && vistaAttiva === 'ricezioni' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-700">Ultime ricezioni per fornitore</h2>
          </div>
          {ricezioni.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-3xl mb-2">🚚</p>
              <p>Nessuna ricezione registrata</p>
              <p className="text-sm mt-1">Usa &quot;Ricezione rapida&quot; per registrare una consegna</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {ricezioni.map((r) => {
                const arriviRicezione = arrivi.filter(a => a.ricezione_id === r.id)
                return (
                  <div key={r.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-800">🚚 {r.fornitori?.nome || 'Fornitore sconosciuto'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(r.data_ricezione).toLocaleDateString('it-IT')}
                          {r.profili?.nome && ` · ${r.profili.nome}`}
                          {arriviRicezione.length > 0 && ` · ${arriviRicezione.length} prodotti`}
                        </p>
                        {arriviRicezione.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {arriviRicezione.slice(0, 5).map((a) => (
                              <span key={a.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                {a.prodotti?.categorie?.icona || '📦'} {a.prodotti?.nome}
                              </span>
                            ))}
                            {arriviRicezione.length > 5 && (
                              <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">+{arriviRicezione.length - 5}</span>
                            )}
                          </div>
                        )}
                      </div>
                      {r.allegati?.length > 0 && (
                        <div className="flex gap-1 ml-3">
                          {r.allegati.slice(0, 2).map((path, i) => (
                            <button key={i} onClick={() => getSignedUrl(path)}
                              className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center text-lg hover:bg-blue-100 transition-colors">
                              📎
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* VISTA PRODOTTI */}
      {!modalita && vistaAttiva === 'prodotti' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-700">Tutti gli arrivi</h2>
          </div>
          {arrivi.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-3xl mb-2">📦</p>
              <p>Nessun arrivo registrato</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {arrivi.map((a) => (
                <div key={a.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      <span className="text-xl mt-0.5">{a.prodotti?.categorie?.icona || '📦'}</span>
                      <div>
                        <p className="font-semibold text-gray-800">{a.prodotti?.nome}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(a.data_arrivo).toLocaleDateString('it-IT')}
                          {a.lotto && ` · Lotto: ${a.lotto}`}
                          {a.profili?.nome && ` · ${a.profili.nome}`}
                        </p>
                        {a.allegati?.length > 0 && (
                          <div className="flex gap-1.5 mt-1.5">
                            {a.allegati.map((path, i) => (
                              <button key={i} onClick={() => getSignedUrl(path)}
                                className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-100">📎 {i + 1}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {a.scadenza && (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ml-2 ${
                        isScaduto(a.scadenza) ? 'bg-red-100 text-red-700' :
                        isVicino(a.scadenza) ? 'bg-orange-100 text-orange-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {isScaduto(a.scadenza) ? '⚠️ Scaduto' : new Date(a.scadenza).toLocaleDateString('it-IT')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
