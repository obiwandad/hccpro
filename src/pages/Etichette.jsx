import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLocale } from '../context/LocaleContext'
import { buildEtichettaContext, getSizeById, defaultVisualConfig } from '../lib/labelTemplates'
import LabelPreview from '../components/LabelPreview'

// Step IDs
const STEP_SORGENTE = 1   // scegli: ricetta / prodotto / manuale
const STEP_SELEZIONA = 2  // scegli l'elemento dalla lista
const STEP_DETTAGLI = 3   // compila date, porzioni, ecc.
const STEP_STAMPA = 4     // anteprima + stampa

const today = () => new Date().toISOString().split('T')[0]
const fmtDate = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('it-IT') }
const addDays = (iso, days) => { const d = new Date(iso); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0] }
const genLotto = (dateProd) => `${dateProd.replace(/-/g, '')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`

// Componente campo manuale con toggle on/off
function ManualField({ label, enabled, onToggle, children }) {
  return (
    <div className={`p-3 transition-colors ${!enabled ? 'bg-gray-50' : ''}`}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
        <div onClick={() => onToggle(!enabled)}
          className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </div>
      </div>
      {enabled ? children : <p className="text-xs text-gray-400 italic">Non verrà stampato</p>}
    </div>
  )
}

export default function Etichette() {
  const { activeLocaleId, activeLocaleName, profilo } = useLocale()

  const [loading, setLoading] = useState(true)
  const [ricette, setRicette] = useState([])
  const [prodotti, setProdotti] = useState([])
  const [allergeniList, setAllergeniList] = useState([])
  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    () => localStorage.getItem('haccpro.activeLabelTemplate') || ''
  )

  // Flusso
  const [step, setStep] = useState(STEP_SORGENTE)
  const [sorgente, setSorgente] = useState(null) // 'ricetta' | 'prodotto' | 'manuale'
  const [ricerca, setRicerca] = useState('')

  // Elemento selezionato
  const [ricettaSelezionata, setRicettaSelezionata] = useState(null)
  const [prodottoSelezionato, setProdottoSelezionato] = useState(null)
  const [ingredientiRicetta, setIngredientiRicetta] = useState([])

  // Form dettagli
  const [form, setForm] = useState({
    data_produzione: today(),
    data_scadenza: '',
    lotto: '',
    quantita: 1,
    peso: '',
    note: '',
  })

  // Form manuale
  const [manualForm, setManualForm] = useState({
    ricettaNome: '',
    ingredientiText: '',
    allergeniText: '',
    data_produzione: today(),
    data_scadenza: '',
    lotto: '',
    quantita: 1,
    peso: '',
    operatore: '',
    locale: '',
  })

  // Etichetta generata
  const [etichettaCtx, setEtichettaCtx] = useState(null)

  // Carica dati
  useEffect(() => {
    if (!activeLocaleId) return
    const init = async () => {
      setLoading(true)
      const [rRes, pRes, allRes] = await Promise.all([
        supabase.from('ricette').select('*').eq('locale_id', activeLocaleId).order('nome'),
        supabase.from('prodotti').select('*, categorie(nome, icona), prodotti_allergeni(allergene_id, allergeni(nome))').eq('locale_id', activeLocaleId).order('nome'),
        supabase.from('allergeni').select('*').order('id'),
      ])
      setRicette(rRes.data || [])
      setProdotti(pRes.data || [])
      setAllergeniList(allRes.data || [])
      await fetchTemplates(activeLocaleId)
      setLoading(false)
    }
    init()
  }, [activeLocaleId])

  // Sync operatore/locale nel form manuale
  useEffect(() => {
    setManualForm(p => ({
      ...p,
      operatore: p.operatore || profilo?.nome || '',
      locale: p.locale || activeLocaleName || '',
    }))
  }, [profilo?.nome, activeLocaleName])

  // Persist template scelto
  useEffect(() => {
    localStorage.setItem('haccpro.activeLabelTemplate', selectedTemplateId)
  }, [selectedTemplateId])

  const fetchTemplates = async (localeId) => {
    setTemplatesLoading(true)
    const { data } = await supabase.from('etichette_template')
      .select('id, nome, visual_config')
      .eq('locale_id', localeId).order('nome')
    const remote = (data || []).map(t => ({
      id: t.id,
      name: t.nome,
      visualConfig: (() => { try { return t.visual_config ? JSON.parse(t.visual_config) : null } catch { return null } })(),
    }))
    setTemplates([...remote])
    setTemplatesLoading(false)
  }

  const selectedTemplate = useMemo(
    () => templates.find(t => t.id === selectedTemplateId) || templates[0] || null,
    [templates, selectedTemplateId]
  )

  const selectedConfig = useMemo(
    () => selectedTemplate?.visualConfig || defaultVisualConfig(),
    [selectedTemplate]
  )

  const etichettaData = useMemo(
    () => etichettaCtx ? buildEtichettaContext(etichettaCtx, window.location.origin) : null,
    [etichettaCtx]
  )

  // -- Navigazione --

  const resetAll = () => {
    setStep(STEP_SORGENTE)
    setSorgente(null)
    setRicettaSelezionata(null)
    setProdottoSelezionato(null)
    setIngredientiRicetta([])
    setEtichettaCtx(null)
    setRicerca('')
    setForm({ data_produzione: today(), data_scadenza: '', lotto: '', quantita: 1, peso: '', note: '' })
  }

  const scegliSorgente = (tipo) => {
    setSorgente(tipo)
    setRicerca('')
    if (tipo === 'manuale') {
      setStep(STEP_DETTAGLI)
    } else {
      setStep(STEP_SELEZIONA)
    }
  }

  const selectRicetta = async (r) => {
    setRicettaSelezionata(r)
    const { data } = await supabase
      .from('ricette_ingredienti')
      .select('*, prodotti(nome, prodotti_allergeni(allergene_id))')
      .eq('ricetta_id', r.id)
    setIngredientiRicetta(data || [])
    // Pre-calcola scadenza
    const scad = addDays(form.data_produzione, r.giorni_scadenza_sottovuoto || 7)
    setForm(p => ({ ...p, data_scadenza: scad, peso: r.peso_porzione_g || '' }))
    setStep(STEP_DETTAGLI)
  }

  const selectProdotto = (p) => {
    setProdottoSelezionato(p)
    const scad = addDays(form.data_produzione, p.giorni_scadenza_default || 3)
    setForm(prev => ({ ...prev, data_scadenza: scad }))
    setStep(STEP_DETTAGLI)
  }

  // -- Genera etichetta --

  const getAllergeniRicetta = () => {
    const ids = new Set()
    ingredientiRicetta.forEach(ing => ing.prodotti?.prodotti_allergeni?.forEach(a => ids.add(a.allergene_id)))
    return allergeniList.filter(a => ids.has(a.id))
  }

  const getAllergeniProdotto = (p) => {
    if (!p?.prodotti_allergeni) return []
    return allergeniList.filter(a => p.prodotti_allergeni.some(pa => pa.allergene_id === a.id))
  }

  const generaEtichetta = async () => {
    const lotto = form.lotto || genLotto(form.data_produzione)
    const operatore = profilo?.nome || ''
    const locale = activeLocaleName || ''

    if (sorgente === 'ricetta' && ricettaSelezionata) {
      const allergeni = getAllergeniRicetta()
      const { data: prod } = await supabase.from('produzioni').insert({
        ricetta_id: ricettaSelezionata.id,
        quantita_prodotta: form.quantita,
        data_produzione: form.data_produzione,
        operatore_id: profilo?.id,
        locale_id: activeLocaleId,
        note: form.note,
      }).select().single()
      if (prod) {
        await supabase.from('etichette').insert({
          produzione_id: prod.id,
          data_produzione: form.data_produzione,
          data_scadenza: form.data_scadenza,
          numero_lotto: lotto,
          operatore_id: profilo?.id,
          locale_id: activeLocaleId,
        })
      }
      setEtichettaCtx({
        ricettaNome: ricettaSelezionata.nome,
        ingredientiText: ingredientiRicetta.map(i => i.prodotti?.nome).filter(Boolean).join(', '),
        allergeniText: allergeni.map(a => a.nome).join(', '),
        dataProduzione: fmtDate(form.data_produzione),
        dataScadenza: fmtDate(form.data_scadenza),
        lotto,
        operatore,
        locale,
        quantita: form.quantita,
        peso: form.peso || ricettaSelezionata.peso_porzione_g || '',
      })

    } else if (sorgente === 'prodotto' && prodottoSelezionato) {
      const allergeni = getAllergeniProdotto(prodottoSelezionato)
      setEtichettaCtx({
        ricettaNome: prodottoSelezionato.nome,
        ingredientiText: '',
        allergeniText: allergeni.map(a => a.nome).join(', '),
        dataProduzione: fmtDate(form.data_produzione),
        dataScadenza: fmtDate(form.data_scadenza),
        lotto,
        operatore,
        locale,
        quantita: form.quantita,
        peso: form.peso || '',
      })

    } else if (sorgente === 'manuale') {
      const dataProd = manualForm.data_produzione
      setEtichettaCtx({
        ricettaNome: manualForm.ricettaNome,
        ingredientiText: manualForm.ingredientiText ?? '',
        allergeniText: manualForm.allergeniText ?? '',
        dataProduzione: manualForm.data_produzione !== null ? fmtDate(manualForm.data_produzione) : '',
        dataScadenza: manualForm.data_scadenza !== null ? fmtDate(manualForm.data_scadenza) : '',
        lotto: manualForm.lotto !== null ? (manualForm.lotto || (dataProd ? genLotto(dataProd) : '')) : '',
        operatore: manualForm.operatore ?? '',
        locale: manualForm.locale ?? '',
        quantita: manualForm.quantita !== null ? manualForm.quantita : '',
        peso: manualForm.peso !== null ? manualForm.peso : '',
      })
    }

    setStep(STEP_STAMPA)
  }

  const handlePrint = () => {
    if (!etichettaData || !selectedConfig) return
    const size = getSizeById(selectedConfig.printSize)

    // Genera HTML per la stampa usando gli stessi stili di LabelPreview
    // ma con dimensioni reali in mm
    const MM = 3.7795
    const fs = selectedConfig.fontSize || 7
    const ptToPx = (pt) => Math.round(pt * 1.333)
    const font = selectedConfig.font || 'Arial, sans-serif'
    const titleColor = selectedConfig.titleColor || '#000'
    const accentColor = selectedConfig.accentColor || '#dc2626'
    const bgColor = selectedConfig.bgColor || '#fff'
    const d = etichettaData

    const hasQr = selectedConfig.qrPosition && selectedConfig.qrPosition !== 'none'
    const qrUrl = d.qrUrl || ''

    const qrScript = hasQr && qrUrl ? `
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>
window.onload = function() {
  var el = document.getElementById('qr');
  if (el && typeof QRCode !== 'undefined') {
    new QRCode(el, { text: '${qrUrl.replace(/'/g, "\\'")}', width: ${Math.round(12*MM)}, height: ${Math.round(12*MM)}, colorDark:'#000', colorLight:'#fff', correctLevel: QRCode.CorrectLevel.M });
  }
  setTimeout(function(){ window.print(); }, 800);
};
</script>` : `<script>window.onload = function(){ window.print(); }</script>`

    const f = selectedConfig.fields || {}
    const rows = []

    if (f.ingredienti && d.ingredientiText) rows.push(`<div class="field"><div class="lbl">Ingredienti</div><div class="val">${d.ingredientiText}</div></div>`)
    if (f.allergeni && d.allergeniText) rows.push(`<div class="abox"><div class="albl">⚠️ ALLERGENI:</div><div class="aval">${d.allergeniText}</div></div>`)

    const dateHtml = [
      f.dataProduzione && d.dataProduzione ? `<div><div class="lbl">Prodotto il</div><div class="val">${d.dataProduzione}</div></div>` : '',
      f.dataScadenza && d.dataScadenza ? `<div><div class="lbl">Scade il</div><div class="val acc">${d.dataScadenza}</div></div>` : '',
    ].filter(Boolean).join('')

    if (selectedConfig.qrPosition === 'right') {
      rows.push(`<div class="dqr">${dateHtml}<div id="qr" class="qr"></div></div>`)
    } else {
      if (dateHtml) rows.push(`<div class="dates">${dateHtml}</div>`)
    }

    const footer = [
      f.lotto && d.lotto ? `<div class="foot">Lotto: <b>${d.lotto}</b></div>` : '',
      f.peso && d.peso ? `<div class="foot">${d.peso}g</div>` : '',
      f.quantita && d.quantita ? `<div class="foot">${d.quantita} pz</div>` : '',
      f.operatore && d.operatore ? `<div class="foot">Op: ${d.operatore}</div>` : '',
      f.locale && d.locale ? `<div class="foot">${d.locale}</div>` : '',
    ].filter(Boolean).join('')

    if (footer) rows.push(`<div class="sep"></div><div>${footer}</div>`)
    if (selectedConfig.qrPosition === 'bottom') rows.push(`<div class="qr-bottom"><div id="qr" class="qr"></div></div>`)

    const html = `<!DOCTYPE html><html><head><title>Etichetta</title>
<style>
@page { size: ${size.w}mm ${size.h}mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${size.w}mm; height: ${size.h}mm; overflow: hidden; background: ${bgColor}; font-family: ${font}; font-size: ${ptToPx(fs)}px; }
.et { width: ${size.w}mm; height: ${size.h}mm; padding: 1.5mm; display: flex; flex-direction: column; gap: 0.6mm; overflow: hidden; }
.tit { font-size: ${ptToPx(Math.round(fs*1.35))}px; font-weight: bold; color: ${titleColor}; line-height: 1.15; margin-bottom: 1mm; }
.lbl { font-size: ${ptToPx(Math.max(5,fs-1))}px; color: #888; text-transform: uppercase; }
.val { font-size: ${ptToPx(fs)}px; color: ${titleColor}; font-weight: 500; }
.acc { color: ${accentColor}; font-weight: bold; }
.field { margin-bottom: 0.5mm; }
.abox { background: #fff8e1; border: 0.3pt solid #f59e0b; padding: 0.5mm 0.8mm; border-radius: 0.8mm; margin-bottom: 0.5mm; }
.albl { font-size: ${ptToPx(Math.max(5,fs-1))}px; font-weight: bold; color: #92400e; }
.aval { font-size: ${ptToPx(Math.max(5,fs-1))}px; color: #92400e; }
.dates { display: flex; gap: 1.5mm; }
.dates > div { flex: 1; }
.dqr { display: flex; gap: 1.5mm; align-items: flex-start; }
.dqr > div:first-child { flex: 1; }
.sep { border-top: 0.3pt solid #ddd; margin: 0.5mm 0; }
.foot { font-size: ${ptToPx(Math.max(5,fs-1))}px; color: #888; }
.qr { width: ${Math.round(12*MM)}px; height: ${Math.round(12*MM)}px; flex-shrink: 0; }
.qr-bottom { display: flex; justify-content: center; margin-top: auto; padding-top: 0.5mm; }
</style></head><body>
<div class="et">
<div class="tit">${selectedConfig.titoloPersonalizzato || d.ricettaNome}</div>
${rows.join('\n')}
</div>
${qrScript}
</body></html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
  }

  // -- Filtri lista --
  const ricetteFiltrate = ricette.filter(r => r.nome.toLowerCase().includes(ricerca.toLowerCase()))
  const prodottiFiltrati = prodotti.filter(p => p.nome.toLowerCase().includes(ricerca.toLowerCase()))

  if (!activeLocaleId) return <div className="flex items-center justify-center h-64 text-gray-400">Nessun locale selezionato</div>
  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Caricamento...</div>

  const stepLabels = ['Tipo', 'Seleziona', 'Dettagli', 'Stampa']

  return (
    <div className="max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">🏷️ Etichette</h1>
          <p className="text-gray-500 text-sm mt-0.5">Genera etichette sottovuoto</p>
        </div>
        {step > STEP_SORGENTE && (
          <button onClick={resetAll} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors">
            ✕ Ricomincia
          </button>
        )}
      </div>

      {/* Step indicator — nascosto su step 1 */}
      {step > STEP_SORGENTE && (
        <div className="flex items-center gap-1.5 mb-6">
          {stepLabels.map((s, i) => {
            // step SELEZIONA non serve per manuale
            if (sorgente === 'manuale' && i === 1) return null
            const n = i + 1
            return (
              <div key={i} className="flex items-center gap-1.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step > n ? 'bg-emerald-500 text-white' : step === n ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {step > n ? '✓' : n}
                </div>
                <span className={`text-xs ${step === n ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>{s}</span>
                {i < stepLabels.length - 1 && <span className="text-gray-200">›</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* STEP 1 — Scegli sorgente */}
      {step === STEP_SORGENTE && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 mb-4">Da dove vuoi prendere i dati per l&apos;etichetta?</p>

          <button onClick={() => scegliSorgente('ricetta')}
            className="w-full flex items-center gap-4 bg-white border border-gray-100 hover:border-emerald-300 rounded-2xl p-4 text-left transition-all shadow-sm hover:shadow-md">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">🍽️</div>
            <div>
              <p className="font-semibold text-gray-800">Da ricetta</p>
              <p className="text-sm text-gray-500 mt-0.5">Piatti composti — ingredienti e allergeni già configurati</p>
              <p className="text-xs text-emerald-600 mt-1">{ricette.length} ricette disponibili</p>
            </div>
            <span className="ml-auto text-gray-300 text-xl">›</span>
          </button>

          <button onClick={() => scegliSorgente('prodotto')}
            className="w-full flex items-center gap-4 bg-white border border-gray-100 hover:border-blue-300 rounded-2xl p-4 text-left transition-all shadow-sm hover:shadow-md">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">📦</div>
            <div>
              <p className="font-semibold text-gray-800">Da prodotto</p>
              <p className="text-sm text-gray-500 mt-0.5">Materie prime e ingredienti — con allergeni associati</p>
              <p className="text-xs text-blue-600 mt-1">{prodotti.length} prodotti disponibili</p>
            </div>
            <span className="ml-auto text-gray-300 text-xl">›</span>
          </button>

          <button onClick={() => scegliSorgente('manuale')}
            className="w-full flex items-center gap-4 bg-white border border-gray-100 hover:border-gray-300 rounded-2xl p-4 text-left transition-all shadow-sm hover:shadow-md">
            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">✏️</div>
            <div>
              <p className="font-semibold text-gray-800">Manuale</p>
              <p className="text-sm text-gray-500 mt-0.5">Compila tutti i campi a mano</p>
            </div>
            <span className="ml-auto text-gray-300 text-xl">›</span>
          </button>
        </div>
      )}

      {/* STEP 2 — Seleziona ricetta o prodotto */}
      {step === STEP_SELEZIONA && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => setStep(STEP_SORGENTE)} className="text-gray-400 hover:text-gray-600 text-sm">← Indietro</button>
            <span className="text-sm text-gray-600 font-medium">
              {sorgente === 'ricetta' ? 'Seleziona ricetta' : 'Seleziona prodotto'}
            </span>
          </div>

          <input type="text" value={ricerca} onChange={e => setRicerca(e.target.value)}
            placeholder="🔍 Cerca..." autoFocus
            className="w-full px-4 py-3 border border-gray-200 rounded-2xl mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {sorgente === 'ricetta' && (
              ricetteFiltrate.length === 0
                ? <p className="text-center text-gray-400 text-sm py-6">Nessuna ricetta trovata</p>
                : ricetteFiltrate.map(r => (
                  <button key={r.id} onClick={() => selectRicetta(r)}
                    className="w-full flex items-center justify-between bg-white border border-gray-100 hover:border-emerald-300 hover:bg-emerald-50 rounded-2xl px-4 py-3 text-left transition-all">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{r.nome}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Scad. sottovuoto: {r.giorni_scadenza_sottovuoto} gg
                        {r.peso_porzione_g && ` · ${r.peso_porzione_g}g`}
                      </p>
                    </div>
                    <span className="text-gray-300 ml-2">›</span>
                  </button>
                ))
            )}

            {sorgente === 'prodotto' && (
              prodottiFiltrati.length === 0
                ? <p className="text-center text-gray-400 text-sm py-6">Nessun prodotto trovato</p>
                : prodottiFiltrati.map(p => {
                  const allergeni = getAllergeniProdotto(p)
                  return (
                    <button key={p.id} onClick={() => selectProdotto(p)}
                      className="w-full flex items-center justify-between bg-white border border-gray-100 hover:border-blue-300 hover:bg-blue-50 rounded-2xl px-4 py-3 text-left transition-all">
                      <div className="flex items-start gap-2">
                        <span className="text-lg mt-0.5">{p.categorie?.icona || '📦'}</span>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{p.nome}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Scad. default: {p.giorni_scadenza_default} gg</p>
                          {allergeni.length > 0 && (
                            <p className="text-xs text-amber-600 mt-0.5">⚠️ {allergeni.map(a => a.nome).join(', ')}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-gray-300 ml-2">›</span>
                    </button>
                  )
                })
            )}
          </div>
        </div>
      )}

      {/* STEP 3 — Dettagli */}
      {step === STEP_DETTAGLI && sorgente !== 'manuale' && (
        <div>
          {/* Riepilogo elemento selezionato */}
          <div className={`rounded-2xl px-4 py-3 mb-4 flex items-center justify-between ${sorgente === 'ricetta' ? 'bg-emerald-50 border border-emerald-200' : 'bg-blue-50 border border-blue-200'}`}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{sorgente === 'ricetta' ? '🍽️' : (prodottoSelezionato?.categorie?.icona || '📦')}</span>
              <div>
                <p className="font-bold text-gray-800 text-sm">{sorgente === 'ricetta' ? ricettaSelezionata?.nome : prodottoSelezionato?.nome}</p>
                {sorgente === 'ricetta' && ingredientiRicetta.length > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">{ingredientiRicetta.map(i => i.prodotti?.nome).filter(Boolean).join(', ')}</p>
                )}
                {sorgente === 'ricetta' && getAllergeniRicetta().length > 0 && (
                  <p className="text-xs text-amber-600 mt-0.5">⚠️ {getAllergeniRicetta().map(a => a.nome).join(', ')}</p>
                )}
                {sorgente === 'prodotto' && getAllergeniProdotto(prodottoSelezionato).length > 0 && (
                  <p className="text-xs text-amber-600 mt-0.5">⚠️ {getAllergeniProdotto(prodottoSelezionato).map(a => a.nome).join(', ')}</p>
                )}
              </div>
            </div>
            <button onClick={() => setStep(STEP_SELEZIONA)} className="text-xs text-gray-400 hover:text-gray-600 underline ml-2">cambia</button>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data produzione</label>
                <input type="date" value={form.data_produzione}
                  onChange={e => {
                    const val = e.target.value
                    const giorni = sorgente === 'ricetta' ? (ricettaSelezionata?.giorni_scadenza_sottovuoto || 7) : (prodottoSelezionato?.giorni_scadenza_default || 3)
                    setForm(p => ({ ...p, data_produzione: val, data_scadenza: addDays(val, giorni) }))
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Scadenza</label>
                <input type="date" value={form.data_scadenza} onChange={e => setForm(p => ({ ...p, data_scadenza: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Porzioni</label>
                <input type="number" min="1" value={form.quantita} onChange={e => setForm(p => ({ ...p, quantita: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Peso (g) opz.</label>
                <input type="number" min="0" value={form.peso} onChange={e => setForm(p => ({ ...p, peso: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="es. 250" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Lotto (opz. — generato auto)</label>
              <input type="text" value={form.lotto} onChange={e => setForm(p => ({ ...p, lotto: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Lascia vuoto per generare automaticamente" />
            </div>
          </div>

          {/* Selezione template */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Template etichetta</label>
            <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {templatesLoading && <p className="text-xs text-gray-400 mt-1">Caricamento template...</p>}
            {profilo?.ruolo === 'admin' && (
              <a href="/admin/template-etichette" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium mt-1 inline-block">
                Gestisci template →
              </a>
            )}
          </div>

          <button onClick={generaEtichetta} disabled={!form.data_produzione || !form.data_scadenza}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3.5 rounded-2xl font-bold text-base transition-colors">
            Genera Etichetta →
          </button>
        </div>
      )}

      {/* STEP 3 manuale */}
      {step === STEP_DETTAGLI && sorgente === 'manuale' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => setStep(STEP_SORGENTE)} className="text-gray-400 hover:text-gray-600 text-sm">← Indietro</button>
            <span className="text-xs text-gray-400">I campi disattivati non appariranno sull&apos;etichetta</span>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50 mb-4 overflow-hidden">

            {/* Nome — obbligatorio */}
            <div className="p-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Nome / Titolo <span className="text-red-400">*</span>
              </label>
              <input value={manualForm.ricettaNome} onChange={e => setManualForm(p => ({ ...p, ricettaNome: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Es. Ragù di carne, Pesto..." />
            </div>

            {/* Ingredienti — opzionale */}
            <ManualField
              label="Ingredienti"
              enabled={manualForm.ingredientiText !== null}
              onToggle={(on) => setManualForm(p => ({ ...p, ingredientiText: on ? '' : null }))}
            >
              <textarea value={manualForm.ingredientiText || ''} onChange={e => setManualForm(p => ({ ...p, ingredientiText: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" rows={2}
                placeholder="Es. farina, uova, latte..." />
            </ManualField>

            {/* Allergeni — opzionale */}
            <ManualField
              label="Allergeni"
              enabled={manualForm.allergeniText !== null}
              onToggle={(on) => setManualForm(p => ({ ...p, allergeniText: on ? '' : null }))}
            >
              <input value={manualForm.allergeniText || ''} onChange={e => setManualForm(p => ({ ...p, allergeniText: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Es. glutine, uova, latte" />
            </ManualField>

            {/* Data produzione — opzionale */}
            <ManualField
              label="Data produzione"
              enabled={manualForm.data_produzione !== null}
              onToggle={(on) => setManualForm(p => ({ ...p, data_produzione: on ? today() : null }))}
            >
              <input type="date" value={manualForm.data_produzione || ''} onChange={e => setManualForm(p => ({ ...p, data_produzione: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </ManualField>

            {/* Scadenza — opzionale */}
            <ManualField
              label="Data scadenza"
              enabled={manualForm.data_scadenza !== null}
              onToggle={(on) => setManualForm(p => ({ ...p, data_scadenza: on ? '' : null }))}
            >
              <input type="date" value={manualForm.data_scadenza || ''} onChange={e => setManualForm(p => ({ ...p, data_scadenza: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </ManualField>

            {/* Lotto — opzionale */}
            <ManualField
              label="Numero lotto"
              enabled={manualForm.lotto !== null}
              onToggle={(on) => setManualForm(p => ({ ...p, lotto: on ? '' : null }))}
            >
              <input value={manualForm.lotto || ''} onChange={e => setManualForm(p => ({ ...p, lotto: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Lascia vuoto per generare automaticamente" />
            </ManualField>

            {/* Porzioni — opzionale */}
            <ManualField
              label="Numero porzioni"
              enabled={manualForm.quantita !== null}
              onToggle={(on) => setManualForm(p => ({ ...p, quantita: on ? 1 : null }))}
            >
              <input type="number" min="1" value={manualForm.quantita || ''} onChange={e => setManualForm(p => ({ ...p, quantita: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </ManualField>

            {/* Peso — opzionale */}
            <ManualField
              label="Peso porzione (g)"
              enabled={manualForm.peso !== null}
              onToggle={(on) => setManualForm(p => ({ ...p, peso: on ? '' : null }))}
            >
              <input type="number" min="0" value={manualForm.peso || ''} onChange={e => setManualForm(p => ({ ...p, peso: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Es. 250" />
            </ManualField>

            {/* Operatore — opzionale */}
            <ManualField
              label="Operatore"
              enabled={manualForm.operatore !== null}
              onToggle={(on) => setManualForm(p => ({ ...p, operatore: on ? (profilo?.nome || '') : null }))}
            >
              <input value={manualForm.operatore || ''} onChange={e => setManualForm(p => ({ ...p, operatore: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </ManualField>

            {/* Locale — opzionale */}
            <ManualField
              label="Locale / Azienda"
              enabled={manualForm.locale !== null}
              onToggle={(on) => setManualForm(p => ({ ...p, locale: on ? (activeLocaleName || '') : null }))}
            >
              <input value={manualForm.locale || ''} onChange={e => setManualForm(p => ({ ...p, locale: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </ManualField>
          </div>

          {/* Template */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Template etichetta</label>
            <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <button onClick={generaEtichetta} disabled={!manualForm.ricettaNome.trim()}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3.5 rounded-2xl font-bold transition-colors">
            Genera Etichetta →
          </button>
        </div>
      )}

      {/* STEP 4 — Stampa */}
      {step === STEP_STAMPA && etichettaCtx && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap">
            <button onClick={handlePrint}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors">
              🖨️ Stampa
            </button>
            <button onClick={() => { setEtichettaCtx(null); setStep(sorgente === 'manuale' ? STEP_DETTAGLI : STEP_DETTAGLI) }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
              ← Modifica
            </button>
            <button onClick={resetAll}
              className="bg-white hover:bg-gray-50 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 transition-colors">
              + Nuova etichetta
            </button>
          </div>

          {/* Anteprima */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">👁 Anteprima</p>
              {templates.length > 0 && (
                <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </div>
            <div className="p-4 bg-gray-50 flex items-center justify-center" style={{ minHeight: '200px' }}>
              {etichettaData && selectedConfig ? (
                <div style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.12)', borderRadius: 2 }}>
                  <LabelPreview
                    config={selectedConfig}
                    data={etichettaData}
                    scale={0.85}
                    forPrint={false}
                  />
                </div>
              ) : (
                <p className="text-gray-400 text-sm">Nessun template disponibile</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
