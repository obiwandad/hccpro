import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { Icon } from '../lib/icons'

const BUCKET = 'allegati-merci'

// Estrae prodotti dalla mail GrosMarket via API Claude
async function estraiProdottiDaMail(corpoMail) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Analizza questo testo di una mail di consegna e restituisci SOLO un JSON array con i prodotti effettivamente consegnati (qtà preparata > 0).
Per ogni prodotto: { "nome": string, "quantita": string, "unita": string, "sostituto": boolean }
Includi i sostituti. Escludi i prodotti non disponibili (qtà preparata = 0).
Rispondi SOLO con il JSON, nessun altro testo.

TESTO MAIL:
${corpoMail}`
      }]
    })
  })
  const data = await res.json()
  const text = data.content?.[0]?.text || '[]'
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch { return [] }
}

// Estrae lotto e scadenza da foto etichetta via API Claude
async function estraiDaFotoEtichetta(base64Image, mimeType) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
          { type: 'text', text: 'Leggi questa etichetta prodotto. Rispondi SOLO con JSON: {"lotto": "...", "scadenza": "GG/MM/AAAA"}. Se non trovi un valore metti null.' }
        ]
      }]
    })
  })
  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch { return {} }
}

const fmt = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d) ? iso : d.toLocaleDateString('it-IT')
}

const isScaduto = (data) => data && new Date(data) < new Date()
const isVicino = (data) => {
  if (!data) return false
  const diff = new Date(data) - new Date()
  return diff > 0 && diff < 3 * 86400000
}

export default function Tracciabilita() {
  const { user } = useAuth()
  const { activeLocaleId } = useLocale()
  const [profilo, setProfilo] = useState(null)
  const [arrivi, setArrivi] = useState([])
  const [ricezioni, setRicezioni] = useState([])
  const [prodotti, setProdotti] = useState([])
  const [fornitori, setFornitori] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('storico') // 'storico' | 'nuova'
  const [q, setQ] = useState('')
  const [filtroFornitore, setFiltroFornitore] = useState('')
  const [ricezioneAperta, setRicezioneAperta] = useState(null)

  // Stato nuova ricezione
  const [modalitaInserimento, setModalitaInserimento] = useState(null) // null | 'gmail' | 'manuale'
  const [mailList, setMailList] = useState([])
  const [loadingMail, setLoadingMail] = useState(false)
  const [estraendo, setEstraendo] = useState(false)
  const [righe, setRighe] = useState([]) // prodotti estratti/inseriti
  const [fornitoreId, setFornitoreId] = useState('')
  const [numeroOrdine, setNumeroOrdine] = useState('')
  const [dataRicezione, setDataRicezione] = useState(new Date().toISOString().split('T')[0])
  const [salvando, setSalvando] = useState(false)
  const [errore, setErrore] = useState('')

  // Per aggiungere prodotto manuale
  const [ricercaProdotto, setRicercaProdotto] = useState('')
  const [showPickerIdx, setShowPickerIdx] = useState(null)

  const localeId = activeLocaleId ?? profilo?.locale_id

  const fetchDati = useCallback(async (lid) => {
    const [r1, r2, r3, r4] = await Promise.all([
      supabase.from('arrivi_merci').select('*, prodotti(nome, categorie(icona)), profili(nome)').eq('locale_id', lid).order('data_arrivo', { ascending: false }).limit(100),
      supabase.from('ricezioni').select('*, fornitori(nome), profili(nome)').eq('locale_id', lid).order('data_ricezione', { ascending: false }).limit(50),
      supabase.from('prodotti').select('*, categorie(nome, icona)').eq('locale_id', lid).order('nome'),
      supabase.from('fornitori').select('*').eq('locale_id', lid).order('nome'),
    ])
    setArrivi(r1.data || [])
    setRicezioni(r2.data || [])
    setProdotti(r3.data || [])
    setFornitori(r4.data || [])
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: prof } = await supabase.from('profili').select('*, locali(nome)').eq('user_id', user.id).single()
      setProfilo(prof)
      const lid = activeLocaleId ?? prof?.locale_id
      if (lid) await fetchDati(lid)
      setLoading(false)
    }
    if (user) init()
  }, [activeLocaleId, user, fetchDati])

  // ── GMAIL ──────────────────────────────────────────────────
  const cercaMailFornitore = async () => {
    setLoadingMail(true)
    setErrore('')
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          tools: [],
          mcp_servers: [{ type: 'url', url: 'https://gmailmcp.googleapis.com/mcp/v1', name: 'gmail' }],
          messages: [{
            role: 'user',
            content: 'Cerca le ultime 10 mail che contengono "ordine in consegna" o "DDT" o "bolla" nella mia casella Gmail. Per ogni mail restituisci: mittente, oggetto, data, id messaggio. Rispondi SOLO con JSON array: [{"id":"...","mittente":"...","oggetto":"...","data":"..."}]'
          }]
        })
      })
      const data = await res.json()
      const text = data.content?.filter(c => c.type === 'text').map(c => c.text).join('')
      const clean = (text || '[]').replace(/```json|```/g, '').trim()
      setMailList(JSON.parse(clean))
    } catch (e) {
      setErrore('Errore connessione Gmail: ' + e.message)
      setMailList([])
    } finally {
      setLoadingMail(false)
    }
  }

  const importaDaMail = async (mail) => {
    setEstraendo(true)
    setErrore('')
    try {
      // Leggi il corpo della mail via Gmail MCP
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          mcp_servers: [{ type: 'url', url: 'https://gmailmcp.googleapis.com/mcp/v1', name: 'gmail' }],
          messages: [{
            role: 'user',
            content: `Leggi il testo completo della mail con id "${mail.id}" e restituiscilo come testo plain, senza formattazione HTML.`
          }]
        })
      })
      const data = await res.json()
      const corpo = data.content?.filter(c => c.type === 'text').map(c => c.text).join('') || ''

      // Estrai numero ordine
      const matchOrdine = corpo.match(/ordine\s+n[.°]?\s*(\d+)/i)
      if (matchOrdine) setNumeroOrdine(matchOrdine[1])

      // Estrai fornitore dalla mail mittente
      const mittente = mail.mittente || ''
      const fornMatch = fornitori.find(f => mittente.toLowerCase().includes(f.nome.toLowerCase()))
      if (fornMatch) setFornitoreId(fornMatch.id)

      // Estrai prodotti
      const prodottiEstratti = await estraiProdottiDaMail(corpo)
      setRighe(prodottiEstratti.map(p => ({
        nome_originale: p.nome,
        quantita: p.quantita,
        unita: p.unita,
        sostituto: p.sostituto || false,
        prodotto_id: '',
        lotto: '',
        scadenza: '',
        foto: null,
        fotoPreview: null,
        estraendoFoto: false,
      })))
      setMailList([])
    } catch (e) {
      setErrore('Errore estrazione mail: ' + e.message)
    } finally {
      setEstraendo(false)
    }
  }

  // ── FOTO ETICHETTA ─────────────────────────────────────────
  const fotoRefs = useRef({})

  const handleFotoEtichetta = async (idx, file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target.result
      const base64 = dataUrl.split(',')[1]
      const mime = file.type || 'image/jpeg'

      setRighe(prev => prev.map((r, i) => i === idx ? { ...r, foto: file, fotoPreview: dataUrl, estraendoFoto: true } : r))

      try {
        const estratto = await estraiDaFotoEtichetta(base64, mime)
        setRighe(prev => prev.map((r, i) => {
          if (i !== idx) return r
          return {
            ...r,
            estraendoFoto: false,
            lotto: estratto.lotto || r.lotto,
            scadenza: estratto.scadenza
              ? (() => {
                  const parts = estratto.scadenza.split('/')
                  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
                  return r.scadenza
                })()
              : r.scadenza,
          }
        }))
      } catch {
        setRighe(prev => prev.map((r, i) => i === idx ? { ...r, estraendoFoto: false } : r))
      }
    }
    reader.readAsDataURL(file)
  }

  const aggiungiRigaManuale = () => {
    setRighe(prev => [...prev, {
      nome_originale: '',
      quantita: '',
      unita: 'pz',
      sostituto: false,
      prodotto_id: '',
      lotto: '',
      scadenza: '',
      foto: null,
      fotoPreview: null,
      estraendoFoto: false,
    }])
  }

  const rimuoviRiga = (idx) => setRighe(prev => prev.filter((_, i) => i !== idx))

  const updateRiga = (idx, campo, valore) => setRighe(prev => prev.map((r, i) => i === idx ? { ...r, [campo]: valore } : r))

  // ── SALVA ─────────────────────────────────────────────────
  const handleSalva = async () => {
    if (!localeId) return
    setSalvando(true)
    setErrore('')
    try {
      // 1. Crea ricezione
      const { data: rec, error: recErr } = await supabase.from('ricezioni').insert({
        locale_id: localeId,
        fornitore_id: fornitoreId || null,
        data_ricezione: dataRicezione,
        numero_ordine: numeroOrdine || null,
        operatore_id: profilo?.id || null,
      }).select().single()
      if (recErr) { setErrore(recErr.message); return }

      // 2. Per ogni riga — upload foto e inserisci arrivo
      for (const riga of righe) {
        let fotoPath = null
        if (riga.foto) {
          const path = `${localeId}/etichette/${Date.now()}_${riga.foto.name}`
          const { data: up } = await supabase.storage.from(BUCKET).upload(path, riga.foto)
          if (up) fotoPath = up.path
        }
        const prodId = riga.prodotto_id || null
        if (!prodId && !riga.nome_originale) continue
        await supabase.from('arrivi_merci').insert({
          locale_id: localeId,
          ricezione_id: rec.id,
          prodotto_id: prodId || null,
          nome_originale: riga.nome_originale || null,
          quantita: riga.quantita || null,
          unita: riga.unita || null,
          lotto: riga.lotto || null,
          scadenza: riga.scadenza || null,
          foto_etichetta: fotoPath,
          data_arrivo: dataRicezione,
          operatore_id: profilo?.id || null,
          allegati: fotoPath ? [fotoPath] : [],
        })
      }

      await fetchDati(localeId)
      resetNuova()
      setTab('storico')
    } finally {
      setSalvando(false)
    }
  }

  const resetNuova = () => {
    setModalitaInserimento(null)
    setRighe([])
    setFornitoreId('')
    setNumeroOrdine('')
    setDataRicezione(new Date().toISOString().split('T')[0])
    setMailList([])
    setErrore('')
  }

  // ── FILTRI STORICO ─────────────────────────────────────────
  const ricezoniFiltrate = ricezioni.filter(r => {
    const hayForn = (r.fornitori?.nome || '').toLowerCase()
    const hayOrdine = (r.numero_ordine || '').toLowerCase()
    const arriviRic = arrivi.filter(a => a.ricezione_id === r.id)
    const hayProd = arriviRic.map(a => (a.prodotti?.nome || a.nome_originale || '').toLowerCase()).join(' ')
    const qq = q.toLowerCase()
    const okQ = !qq || hayForn.includes(qq) || hayOrdine.includes(qq) || hayProd.includes(qq)
    const okForn = !filtroFornitore || r.fornitore_id === filtroFornitore
    return okQ && okForn
  })

  const prodottiFiltrati = prodotti.filter(p => p.nome.toLowerCase().includes(ricercaProdotto.toLowerCase()))

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Caricamento...</div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5"><Icon name="tracciabilita" className="w-7 h-7 text-emerald-600" /> Tracciabilità</h1>
          <p className="text-gray-500 text-sm mt-0.5">Ricezioni merce e documenti DDT</p>
        </div>
        <button
          onClick={() => { setTab('nuova'); setModalitaInserimento(null) }}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors"
        >
          + Nuova ricezione
        </button>
      </div>

      {/* Tab */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-0">
          {[{ id: 'storico', label: `Storico (${ricezioni.length})` }, { id: 'nuova', label: 'Nuova ricezione' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-emerald-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {errore && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{errore}</div>}

      {/* ═══════════ STORICO ═══════════ */}
      {tab === 'storico' && (
        <div>
          <div className="flex gap-3 mb-4 flex-wrap">
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Cerca fornitore, prodotto, ordine…"
              className="flex-1 min-w-[200px] px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm" />
            <select value={filtroFornitore} onChange={e => setFiltroFornitore(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white">
              <option value="">Tutti i fornitori</option>
              {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>

          {ricezoniFiltrate.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center text-gray-400">
              <Icon name="fornitori" className="w-8 h-8 text-gray-300 mb-2 mx-auto" />
              <p className="font-medium">Nessuna ricezione registrata</p>
              <p className="text-sm mt-1">Registra la prima ricezione con il pulsante in alto</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ricezoniFiltrate.map(r => {
                const arriviRic = arrivi.filter(a => a.ricezione_id === r.id)
                const aperta = ricezioneAperta === r.id
                return (
                  <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {/* Header ricezione */}
                    <button
                      onClick={() => setRicezioneAperta(aperta ? null : r.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0"><Icon name="fornitori" className="w-5 h-5" /></div>
                        <div>
                          <p className="font-semibold text-gray-800">
                            {r.fornitori?.nome || 'Fornitore sconosciuto'}
                            {r.numero_ordine && <span className="ml-2 text-xs font-normal text-gray-400">Ordine {r.numero_ordine}</span>}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {fmt(r.data_ricezione)}
                            {r.profili?.nome && ` · ${r.profili.nome}`}
                            {arriviRic.length > 0 && ` · ${arriviRic.length} prodotti`}
                          </p>
                        </div>
                      </div>
                      <span className="text-gray-400 text-sm">{aperta ? '▲' : '▼'}</span>
                    </button>

                    {/* Dettaglio prodotti */}
                    {aperta && (
                      <div className="border-t border-gray-100 divide-y divide-gray-50">
                        {arriviRic.length === 0 ? (
                          <p className="px-5 py-4 text-sm text-gray-400">Nessun prodotto registrato</p>
                        ) : arriviRic.map(a => (
                          <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                            {/* Foto etichetta */}
                            {a.foto_etichetta ? (
                              <button onClick={async () => {
                                const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.foto_etichetta, 60)
                                if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                              }}
                                className="w-10 h-10 rounded-xl border border-gray-200 overflow-hidden flex-shrink-0 hover:opacity-80"
                                title="Apri foto etichetta">
                                <img src={`https://placeholder.com/40`} alt="etichetta" className="w-full h-full object-cover" />
                                <span className="sr-only">📷</span>
                              </button>
                            ) : (
                              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                                {a.prodotti?.categorie?.icona || '📦'}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">
                                {a.prodotti?.nome || a.nome_originale || '—'}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {a.quantita && `${a.quantita} ${a.unita || ''}`}
                                {a.lotto && ` · Lotto: ${a.lotto}`}
                              </p>
                            </div>
                            {a.scadenza && (
                              <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
                                isScaduto(a.scadenza) ? 'bg-red-100 text-red-700' :
                                isVicino(a.scadenza) ? 'bg-orange-100 text-orange-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {isScaduto(a.scadenza) ? 'Scaduto' : fmt(a.scadenza)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ NUOVA RICEZIONE ═══════════ */}
      {tab === 'nuova' && (
        <div className="max-w-3xl">

          {/* Scelta modalità */}
          {!modalitaInserimento && righe.length === 0 && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                onClick={() => { setModalitaInserimento('gmail'); cercaMailFornitore() }}
                className="flex flex-col items-center gap-3 bg-white border-2 border-gray-200 hover:border-emerald-400 rounded-2xl p-6 transition-colors"
              >
                <Icon name="mail" className="w-9 h-9 text-emerald-600" />
                <div className="text-center">
                  <p className="font-semibold text-gray-800">Importa da Gmail</p>
                  <p className="text-xs text-gray-500 mt-1">Cerca le mail di consegna del fornitore</p>
                </div>
              </button>
              <button
                onClick={() => { setModalitaInserimento('manuale'); aggiungiRigaManuale() }}
                className="flex flex-col items-center gap-3 bg-white border-2 border-gray-200 hover:border-emerald-400 rounded-2xl p-6 transition-colors"
              >
                <Icon name="pencil" className="w-9 h-9 text-emerald-600" />
                <div className="text-center">
                  <p className="font-semibold text-gray-800">Inserimento manuale</p>
                  <p className="text-xs text-gray-500 mt-1">Aggiungi i prodotti uno per uno</p>
                </div>
              </button>
            </div>
          )}

          {/* Lista mail Gmail */}
          {modalitaInserimento === 'gmail' && mailList.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <p className="font-semibold text-gray-700">Seleziona la mail da importare</p>
              </div>
              <div className="divide-y divide-gray-50">
                {mailList.map((m, i) => (
                  <button key={i} onClick={() => importaDaMail(m)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-emerald-50 transition-colors text-left">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{m.oggetto}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{m.mittente} · {m.data}</p>
                    </div>
                    <span className="text-emerald-500 text-sm">Importa →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {loadingMail && <div className="text-center py-8 text-gray-500">Cercando mail…</div>}
          {estraendo && <div className="text-center py-8 text-gray-500">Estrazione prodotti in corso…</div>}

          {/* Form ricezione */}
          {(righe.length > 0 || modalitaInserimento === 'manuale') && (
            <>
              {/* Testata */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Fornitore</label>
                    <select value={fornitoreId} onChange={e => setFornitoreId(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white">
                      <option value="">— seleziona —</option>
                      {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">N° ordine / DDT</label>
                    <input value={numeroOrdine} onChange={e => setNumeroOrdine(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      placeholder="Es. 1283470" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Data ricezione</label>
                    <input type="date" value={dataRicezione} onChange={e => setDataRicezione(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm" />
                  </div>
                </div>
              </div>

              {/* Righe prodotti */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <p className="font-semibold text-gray-700">Prodotti ricevuti ({righe.length})</p>
                  <button onClick={aggiungiRigaManuale}
                    className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
                    + Aggiungi prodotto
                  </button>
                </div>

                <div className="divide-y divide-gray-50">
                  {righe.map((riga, idx) => (
                    <div key={idx} className="p-4">
                      <div className="flex items-start gap-3">

                        {/* Foto etichetta */}
                        <div className="flex flex-col items-center gap-1 flex-shrink-0">
                          <input
                            type="file" accept="image/*" capture="environment"
                            ref={el => fotoRefs.current[idx] = el}
                            onChange={e => handleFotoEtichetta(idx, e.target.files?.[0])}
                            className="hidden"
                          />
                          <button onClick={() => fotoRefs.current[idx]?.click()}
                            className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-300 hover:border-emerald-400 flex flex-col items-center justify-center gap-1 transition-colors overflow-hidden">
                            {riga.fotoPreview ? (
                              <img src={riga.fotoPreview} alt="" className="w-full h-full object-cover rounded-xl" />
                            ) : riga.estraendoFoto ? (
                              <Icon name="refresh" className="w-4 h-4 text-gray-400" />
                            ) : (
                              <>
                                <Icon name="photo" className="w-5 h-5" />
                                <span className="text-[10px] text-gray-400">etichetta</span>
                              </>
                            )}
                          </button>
                          {riga.fotoPreview && (
                            <button onClick={() => updateRiga(idx, 'foto', null) || updateRiga(idx, 'fotoPreview', null)}
                              className="text-[10px] text-gray-400 hover:text-red-500">rimuovi</button>
                          )}
                        </div>

                        {/* Campi */}
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          {/* Nome prodotto */}
                          <div className="col-span-2">
                            <div className="relative">
                              <input
                                value={riga.nome_originale}
                                onChange={e => { updateRiga(idx, 'nome_originale', e.target.value); setRicercaProdotto(e.target.value); setShowPickerIdx(idx) }}
                                onFocus={() => setShowPickerIdx(idx)}
                                placeholder="Nome prodotto"
                                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                              />
                              {showPickerIdx === idx && ricercaProdotto.length > 0 && prodottiFiltrati.length > 0 && (
                                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                  {prodottiFiltrati.slice(0, 8).map(p => (
                                    <button key={p.id} onClick={() => {
                                      updateRiga(idx, 'prodotto_id', p.id)
                                      updateRiga(idx, 'nome_originale', p.nome)
                                      setShowPickerIdx(null)
                                      setRicercaProdotto('')
                                    }}
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 flex items-center gap-2">
                                      <span>{p.categorie?.icona || '📦'}</span>
                                      <span>{p.nome}</span>
                                      {p.categorie?.nome && <span className="text-xs text-gray-400">{p.categorie.nome}</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Quantità */}
                          <div>
                            <input value={riga.quantita} onChange={e => updateRiga(idx, 'quantita', e.target.value)}
                              placeholder="Quantità"
                              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm" />
                          </div>

                          {/* Lotto */}
                          <div>
                            <input value={riga.lotto} onChange={e => updateRiga(idx, 'lotto', e.target.value)}
                              placeholder="Lotto (opzionale)"
                              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm" />
                          </div>

                          {/* Scadenza */}
                          <div>
                            <input type="date" value={riga.scadenza} onChange={e => updateRiga(idx, 'scadenza', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm" />
                          </div>

                          {/* Badge sostituto */}
                          {riga.sostituto && (
                            <div className="flex items-center">
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">sostituto</span>
                            </div>
                          )}
                        </div>

                        {/* Rimuovi */}
                        <button onClick={() => rimuoviRiga(idx)}
                          className="text-gray-300 hover:text-red-500 text-xl font-bold flex-shrink-0 mt-1">×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Azioni */}
              <div className="flex items-center justify-between">
                <button onClick={resetNuova} className="text-gray-400 hover:text-gray-600 text-sm">
                  Annulla
                </button>
                <button onClick={handleSalva} disabled={salvando || righe.length === 0}
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-medium transition-colors">
                  {salvando ? 'Salvataggio…' : `Conferma ricezione (${righe.length} prodotti)`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
