import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase, uploadToDocumentazione } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { Icon } from '../lib/icons'
import { generaTimbroDataUrl } from '../lib/timbro'

const todayKey = () => new Date().toISOString().slice(0, 10)

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

const makeId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const hex = () => Math.floor(Math.random() * 16).toString(16)
  const s = (n) => Array.from({ length: n }, hex).join('')
  return `${s(8)}-${s(4)}-4${s(3)}-${((8 + Math.floor(Math.random() * 4))).toString(16)}${s(3)}-${s(12)}`
}

const emptyRiga = () => ({ descrizione: '', quantita: '1', um: 'pz' })

const normalizeRighe = (righe) =>
  (Array.isArray(righe) ? righe : [])
    .map((r) => ({
      descrizione: String(r?.descrizione ?? '').trim(),
      quantita: String(r?.quantita ?? '').trim(),
      um: String(r?.um ?? '').trim() || 'pz',
    }))
    .filter((r) => r.descrizione)

const fmtDateIt = (dateKey) => {
  if (!dateKey) return ''
  return new Date(`${String(dateKey).slice(0, 10)}T12:00:00`).toLocaleDateString('it-IT')
}

const buildDDTPDF = ({ ddt, localeName, timbroDataUrl, firmaDataUrl }) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 10
  const gap = 6

  const numero = ddt?.numero != null ? String(ddt.numero) : ''
  const anno = ddt?.anno != null ? String(ddt.anno) : ''
  const data = fmtDateIt(ddt?.data)
  const mittente = ddt?.mittente || {}
  const destinatario = ddt?.destinatario || {}
  const trasporto = ddt?.trasporto || {}
  const righe = Array.isArray(ddt?.righe) ? ddt.righe : []
  const causale = ddt?.causale || ''
  const note = ddt?.note || ''

  const safe = (v) => String(v ?? '').trim()
  const box = ({ x, y, w, h, title, lines }) => {
    doc.setDrawColor(210)
    doc.rect(x, y, w, h)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text(title, x + 2, y + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const text = (Array.isArray(lines) ? lines : []).filter(Boolean).join('\n')
    const split = doc.splitTextToSize(text, w - 4)
    doc.text(split, x + 2, y + 10)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Documento di Trasporto (DDT)', margin, margin + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const headerLine = `DDT ${numero}/${anno}${localeName ? ` · ${localeName}` : ''}`
  doc.text(headerLine, margin, margin + 12)

  doc.setFont('helvetica', 'bold')
  doc.text('Numero:', pageW - margin - 55, margin + 6)
  doc.text('Data:', pageW - margin - 55, margin + 12)
  doc.setFont('helvetica', 'normal')
  doc.text(`${numero}/${anno}`, pageW - margin - 32, margin + 6)
  doc.text(data, pageW - margin - 32, margin + 12)

  let y = margin + 18

  const colW = (pageW - margin * 2 - gap) / 2
  const boxH = 28
  box({
    x: margin,
    y,
    w: colW,
    h: boxH,
    title: 'Mittente',
    lines: [
      safe(mittente.nome),
      safe(mittente.indirizzo),
      mittente.piva ? `P.IVA/CF: ${safe(mittente.piva)}` : '',
    ],
  })
  box({
    x: margin + colW + gap,
    y,
    w: colW,
    h: boxH,
    title: 'Destinatario',
    lines: [
      safe(destinatario.nome),
      safe(destinatario.indirizzo),
      destinatario.piva ? `P.IVA/CF: ${safe(destinatario.piva)}` : '',
    ],
  })

  y += boxH + gap

  const boxH2 = 22
  box({
    x: margin,
    y,
    w: colW,
    h: boxH2,
    title: 'Causale',
    lines: [safe(causale)],
  })
  box({
    x: margin + colW + gap,
    y,
    w: colW,
    h: boxH2,
    title: 'Trasporto',
    lines: [
      trasporto.aCura ? `A cura: ${safe(trasporto.aCura)}` : '',
      trasporto.vettore ? `Vettore: ${safe(trasporto.vettore)}` : '',
      trasporto.targa ? `Targa: ${safe(trasporto.targa)}` : '',
      trasporto.colli ? `Colli: ${safe(trasporto.colli)}` : '',
      trasporto.peso ? `Peso: ${safe(trasporto.peso)}` : '',
    ],
  })

  y += boxH2 + gap

  const head = [['#', 'Descrizione', 'Q.tà', 'UM']]
  const body = righe.length
    ? righe.map((r, idx) => [String(idx + 1), safe(r?.descrizione), safe(r?.quantita), safe(r?.um)])
    : [['', 'Nessuna riga', '', '']]

  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2, lineColor: [200, 200, 200], lineWidth: 0.1, valign: 'middle' },
    headStyles: { fillColor: [245, 245, 245], textColor: 30, fontStyle: 'bold', lineColor: [160, 160, 160] },
    columnStyles: { 0: { cellWidth: 10, halign: 'right' }, 2: { cellWidth: 22, halign: 'right' }, 3: { cellWidth: 14, halign: 'center' } },
  })

  const afterY = doc.lastAutoTable?.finalY != null ? doc.lastAutoTable.finalY : y + 10
  let y2 = afterY + 6

  if (note) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Note', margin, y2)
    y2 += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const split = doc.splitTextToSize(safe(note), pageW - margin * 2)
    doc.text(split, margin, y2)
    y2 += split.length * 4 + 2
  }

  const stampW = 60
  const stampH = 25
  const stampX = pageW - margin - stampW
  const stampY = pageH - margin - stampH
  const scaleFirma = 0.85
  const fw = stampW * scaleFirma
  const fh = stampH * scaleFirma
  const reserveBottomBlockY = timbroDataUrl
    ? (stampY - 10 - (firmaDataUrl ? (fh + 4) : 0))
    : (pageH - 30)
  const sigY = Math.min(pageH - 18, Math.max(y2 + 8, reserveBottomBlockY))
  doc.setDrawColor(120)
  doc.line(margin, sigY, margin + 70, sigY)
  doc.line(pageW - margin - 70, sigY, pageW - margin, sigY)
  doc.setFontSize(9)
  doc.setTextColor(80)
  doc.text('Firma mittente', margin, sigY + 5)
  doc.text('Firma destinatario', pageW - margin - 70, sigY + 5)
  doc.setTextColor(0)

  if (timbroDataUrl) {
    try {
      doc.addImage(timbroDataUrl, 'PNG', stampX, stampY, stampW, stampH)
    } catch {
      void 0
    }
  }
  if (timbroDataUrl && firmaDataUrl) {
    const fx = stampX + (stampW - fw) / 2
    const fy = Math.max(margin, stampY - 4 - fh)
    try {
      doc.addImage(firmaDataUrl, 'PNG', fx, fy, fw, fh)
    } catch {
      void 0
    }
  }

  const fileName = `ddt_${localeName ? localeName.replace(/\s+/g, '-') + '_' : ''}${anno}-${String(numero).padStart(4, '0')}_${String(ddt?.data || '').slice(0, 10)}.pdf`
  return { doc, fileName }
}

const exportDDTPDF = ({ ddt, localeName, timbroDataUrl, firmaDataUrl }) => {
  const { doc, fileName } = buildDDTPDF({ ddt, localeName, timbroDataUrl, firmaDataUrl })
  doc.save(fileName)
}

export default function DDT() {
  const { user } = useAuth()
  const { profilo, activeLocaleId, activeLocaleName, loading: localeLoading } = useLocale()

  const localeId = activeLocaleId ?? profilo?.locale_id ?? null

  const year = useMemo(() => new Date().getFullYear(), [])
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [mode, setMode] = useState('list')
  const [form, setForm] = useState(() => ({
    id: null,
    anno: year,
    numero: null,
    data: todayKey(),
    mittente: { nome: '', indirizzo: '', piva: '' },
    destinatario: { nome: '', indirizzo: '', piva: '' },
    causale: '',
    righe: [emptyRiga()],
    trasporto: { aCura: 'Mittente', vettore: '', targa: '', colli: '', peso: '' },
    note: '',
  }))

  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [docSending, setDocSending] = useState(false)
  const [docSendError, setDocSendError] = useState('')
  const [docSendOk, setDocSendOk] = useState('')

  const fetchList = async (lid) => {
    if (!lid) return
    setLoading(true)
    setLoadError('')
    try {
      const { data, error } = await supabase
        .from('ddt')
        .select('id, anno, numero, data, mittente, destinatario, causale, righe, trasporto, note, created_at')
        .eq('locale_id', lid)
        .order('data', { ascending: false })
        .order('numero', { ascending: false })
        .limit(80)

      if (error) {
        setLoadError(error.message || 'Errore nel caricamento dei DDT.')
        setList([])
        return
      }

      setList(data || [])
    } finally {
      setLoading(false)
    }
  }

  const fetchNextNumero = async (lid, anno) => {
    const { data, error } = await supabase
      .from('ddt')
      .select('numero')
      .eq('locale_id', lid)
      .eq('anno', anno)
      .order('numero', { ascending: false })
      .limit(1)

    if (error) return null
    const last = data?.[0]?.numero
    const next = (Number(last) || 0) + 1
    return next
  }

  useEffect(() => {
    if (localeLoading) return
    if (!localeId) {
      setList([])
      setLoading(false)
      return
    }
    fetchList(localeId)
  }, [localeId, localeLoading])

  useEffect(() => {
    if (!activeLocaleName) return
    setForm((prev) => ({
      ...prev,
      mittente: { ...prev.mittente, nome: prev.mittente.nome || activeLocaleName },
    }))
  }, [activeLocaleName])

  const resetToList = () => {
    setSubmitError('')
    setMode('list')
  }

  const openNew = async () => {
    setSubmitError('')
    if (!localeId) return
    const nextNumero = await fetchNextNumero(localeId, year)
    setForm({
      id: null,
      anno: year,
      numero: nextNumero ?? '',
      data: todayKey(),
      mittente: { nome: activeLocaleName || '', indirizzo: '', piva: '' },
      destinatario: { nome: '', indirizzo: '', piva: '' },
      causale: 'Trasporto merci',
      righe: [emptyRiga()],
      trasporto: { aCura: 'Mittente', vettore: '', targa: '', colli: '', peso: '' },
      note: '',
    })
    setMode('edit')
  }

  const openEdit = (row) => {
    setSubmitError('')
    setForm({
      id: row?.id || null,
      anno: row?.anno ?? year,
      numero: row?.numero ?? null,
      data: String(row?.data || todayKey()).slice(0, 10),
      mittente: {
        nome: row?.mittente?.nome || activeLocaleName || '',
        indirizzo: row?.mittente?.indirizzo || '',
        piva: row?.mittente?.piva || '',
      },
      destinatario: {
        nome: row?.destinatario?.nome || '',
        indirizzo: row?.destinatario?.indirizzo || '',
        piva: row?.destinatario?.piva || '',
      },
      causale: row?.causale || '',
      righe: Array.isArray(row?.righe) && row.righe.length > 0 ? row.righe : [emptyRiga()],
      trasporto: {
        aCura: row?.trasporto?.aCura || 'Mittente',
        vettore: row?.trasporto?.vettore || '',
        targa: row?.trasporto?.targa || '',
        colli: row?.trasporto?.colli || '',
        peso: row?.trasporto?.peso || '',
      },
      note: row?.note || '',
    })
    setMode('edit')
  }

  const validate = () => {
    if (!localeId) return 'Nessun locale selezionato.'
    if (!profilo?.id) return 'Profilo non disponibile.'
    const numeroValue = Number(String(form?.numero ?? '').replace(',', '.'))
    if (!Number.isFinite(numeroValue) || numeroValue <= 0) return 'Numero DDT non valido.'
    if (!form?.data) return 'Data mancante.'
    if (!form?.mittente?.nome?.trim()) return 'Mittente: inserisci il nome.'
    if (!form?.destinatario?.nome?.trim()) return 'Destinatario: inserisci il nome.'
    const righe = normalizeRighe(form?.righe)
    if (righe.length === 0) return 'Inserisci almeno una riga (descrizione).'
    for (const r of righe) {
      const q = Number(String(r.quantita).replace(',', '.'))
      if (!Number.isFinite(q) || q <= 0) return `Quantità non valida per "${r.descrizione}".`
    }
    return ''
  }

  const loadTimbroFirmaDataUrl = async () => {
    if (!localeId) return null
    const { data: loc } = await supabase
      .from('locali')
      .select('nome, ragione_sociale, indirizzo, piva_cf, firma_path')
      .eq('id', localeId)
      .single()
    if (!loc) return null
    const timbroDataUrl = generaTimbroDataUrl({ nome: loc.ragione_sociale || loc.nome, indirizzo: loc.indirizzo, pivaCf: loc.piva_cf })
    let firmaDataUrl = null
    if (loc.firma_path) {
      const { data: signed } = await supabase.storage.from('allegati-merci').createSignedUrl(loc.firma_path, 120)
      if (signed?.signedUrl) firmaDataUrl = await urlToDataUrl(signed.signedUrl)
    }
    return { timbroDataUrl, firmaDataUrl }
  }

  const doPrint = async (ddt) => {
    const pack = await loadTimbroFirmaDataUrl()
    exportDDTPDF({ ddt, localeName: activeLocaleName, timbroDataUrl: pack?.timbroDataUrl || null, firmaDataUrl: pack?.firmaDataUrl || null })
  }

  const sendToDoc = async (ddt) => {
    if (!localeId) return
    setDocSendError('')
    setDocSendOk('')
    setDocSending(true)
    try {
      const pack = await loadTimbroFirmaDataUrl()
      const { doc, fileName } = buildDDTPDF({ ddt, localeName: activeLocaleName, timbroDataUrl: pack?.timbroDataUrl || null, firmaDataUrl: pack?.firmaDataUrl || null })
      const blob = doc.output('blob')
      const file = new File([blob], fileName, { type: 'application/pdf' })
      const titolo = fileName.replace(/\.pdf$/i, '')

      const { error } = await uploadToDocumentazione({
        localeId,
        file,
        titolo,
        tags: ['ddt'],
        userId: user?.id || null,
      })

      if (error) {
        setDocSendError(error.message || 'Errore durante l\'invio in Documentazione.')
        return
      }

      setDocSendOk('PDF inviato in Documentazione.')
    } catch (e) {
      setDocSendError(e?.message || 'Errore imprevisto durante l\'invio in Documentazione.')
    } finally {
      setDocSending(false)
    }
  }

  const save = async (after) => {
    setSubmitError('')
    const err = validate()
    if (err) {
      setSubmitError(err)
      return
    }

    setSaving(true)
    try {
      const numeroValue = Number(String(form.numero ?? '').replace(',', '.'))
      const righe = normalizeRighe(form.righe).map((r) => ({
        descrizione: r.descrizione,
        quantita: Math.round(Number(String(r.quantita).replace(',', '.')) * 1000) / 1000,
        um: r.um || 'pz',
      }))

      const payload = {
        locale_id: localeId,
        anno: Number(form.anno) || year,
        numero: numeroValue,
        data: String(form.data).slice(0, 10),
        mittente: {
          nome: form.mittente.nome?.trim() || '',
          indirizzo: form.mittente.indirizzo?.trim() || '',
          piva: form.mittente.piva?.trim() || '',
        },
        destinatario: {
          nome: form.destinatario.nome?.trim() || '',
          indirizzo: form.destinatario.indirizzo?.trim() || '',
          piva: form.destinatario.piva?.trim() || '',
        },
        causale: form.causale?.trim() || '',
        righe,
        trasporto: {
          aCura: form.trasporto?.aCura || '',
          vettore: form.trasporto?.vettore?.trim() || '',
          targa: form.trasporto?.targa?.trim() || '',
          colli: form.trasporto?.colli?.trim() || '',
          peso: form.trasporto?.peso?.trim() || '',
        },
        note: form.note?.trim() || '',
      }

      if (form.id) {
        const { error } = await supabase
          .from('ddt')
          .update(payload)
          .eq('id', form.id)
        if (error) {
          setSubmitError(error.message || 'Errore durante il salvataggio.')
          return
        }
      } else {
        const { error } = await supabase
          .from('ddt')
          .insert({ id: makeId(), created_by: profilo.id, ...payload })
        if (error) {
          setSubmitError(error.message || 'Errore durante il salvataggio.')
          return
        }
      }

      await fetchList(localeId)
      const saved = { ...payload }
      if (after === 'download') doPrint(saved)
      if (after === 'documentazione') await sendToDoc(saved)
      resetToList()
    } catch (e) {
      setSubmitError(e?.message || 'Errore imprevisto.')
    } finally {
      setSaving(false)
    }
  }

  const removeRow = async (id) => {
    if (!id) return
    if (!confirm('Eliminare questo DDT?')) return
    setSaving(true)
    try {
      const { error } = await supabase.from('ddt').delete().eq('id', id)
      if (error) {
        setLoadError(error.message || 'Errore durante l\'eliminazione.')
        return
      }
      await fetchList(localeId)
    } finally {
      setSaving(false)
    }
  }

  if (localeLoading) return <div className="flex items-center justify-center h-64 text-gray-500">Caricamento...</div>

  if (!localeId) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Nessun locale associato al tuo profilo.</div>
  }

  if (mode === 'edit') {
    const busy = saving || docSending
    return (
      <div>
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5">
              <Icon name="ddt" className="w-7 h-7 text-emerald-600" /> DDT
            </h1>
            <p className="text-gray-500 mt-1">Crea e salva un Documento di Trasporto</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-medium transition-colors"
              onClick={resetToList}
              disabled={busy}
            >
              Indietro
            </button>
            <button
              type="button"
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-60"
              onClick={() => save(null)}
              disabled={busy}
            >
              Salva
            </button>
            <button
              type="button"
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-60"
              onClick={() => save('download')}
              disabled={busy}
            >
              <Icon name="file" className="w-4 h-4" />
              Salva e scarica PDF
            </button>
            <button
              type="button"
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-60"
              onClick={() => save('documentazione')}
              disabled={busy}
            >
              <Icon name="documentazione" className="w-4 h-4" />
              Salva e invia a Documentazione
            </button>
          </div>
        </div>

        {docSendError ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {docSendError}
          </div>
        ) : docSendOk ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {docSendOk}
          </div>
        ) : null}

        {submitError ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-700 mb-4">Dati DDT</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Numero</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={form.numero ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, numero: e.target.value }))}
                  disabled={!!form.id}
                  className={`w-full px-4 py-2.5 border border-gray-300 rounded-xl ${form.id ? 'bg-gray-100 text-gray-600' : 'focus:outline-none focus:ring-2 focus:ring-emerald-500'}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <input
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm((p) => ({ ...p, data: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Causale</label>
                <input
                  type="text"
                  value={form.causale}
                  onChange={(e) => setForm((p) => ({ ...p, causale: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Es. Trasporto merci per evento"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-700 mb-4">Trasporto</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">A cura di</label>
                <select
                  value={form.trasporto.aCura}
                  onChange={(e) => setForm((p) => ({ ...p, trasporto: { ...p.trasporto, aCura: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="Mittente">Mittente</option>
                  <option value="Destinatario">Destinatario</option>
                  <option value="Vettore">Vettore</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vettore</label>
                <input
                  type="text"
                  value={form.trasporto.vettore}
                  onChange={(e) => setForm((p) => ({ ...p, trasporto: { ...p.trasporto, vettore: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Es. Nome corriere"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Targa</label>
                <input
                  type="text"
                  value={form.trasporto.targa}
                  onChange={(e) => setForm((p) => ({ ...p, trasporto: { ...p.trasporto, targa: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colli</label>
                <input
                  type="text"
                  value={form.trasporto.colli}
                  onChange={(e) => setForm((p) => ({ ...p, trasporto: { ...p.trasporto, colli: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Es. 3"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Peso</label>
                <input
                  type="text"
                  value={form.trasporto.peso}
                  onChange={(e) => setForm((p) => ({ ...p, trasporto: { ...p.trasporto, peso: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Es. 12 kg"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-700 mb-4">Mittente</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  type="text"
                  value={form.mittente.nome}
                  onChange={(e) => setForm((p) => ({ ...p, mittente: { ...p.mittente, nome: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo</label>
                <input
                  type="text"
                  value={form.mittente.indirizzo}
                  onChange={(e) => setForm((p) => ({ ...p, mittente: { ...p.mittente, indirizzo: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">P.IVA / CF</label>
                <input
                  type="text"
                  value={form.mittente.piva}
                  onChange={(e) => setForm((p) => ({ ...p, mittente: { ...p.mittente, piva: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-700 mb-4">Destinatario</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  type="text"
                  value={form.destinatario.nome}
                  onChange={(e) => setForm((p) => ({ ...p, destinatario: { ...p.destinatario, nome: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Es. Cliente / Organizzatore"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo</label>
                <input
                  type="text"
                  value={form.destinatario.indirizzo}
                  onChange={(e) => setForm((p) => ({ ...p, destinatario: { ...p.destinatario, indirizzo: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">P.IVA / CF</label>
                <input
                  type="text"
                  value={form.destinatario.piva}
                  onChange={(e) => setForm((p) => ({ ...p, destinatario: { ...p.destinatario, piva: e.target.value } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-semibold text-gray-700">Righe</h2>
            <button
              type="button"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl font-medium"
              onClick={() => setForm((p) => ({ ...p, righe: [...p.righe, emptyRiga()] }))}
              disabled={saving}
            >
              + Riga
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {form.righe.map((r, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-3 items-end">
                <div className="col-span-12 md:col-span-7">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
                  <input
                    type="text"
                    value={r.descrizione}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        righe: p.righe.map((x, i) => (i === idx ? { ...x, descrizione: e.target.value } : x)),
                      }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Es. 10 casse acqua"
                  />
                </div>
                <div className="col-span-6 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantità</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={r.quantita}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        righe: p.righe.map((x, i) => (i === idx ? { ...x, quantita: e.target.value } : x)),
                      }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="col-span-6 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">UM</label>
                  <input
                    type="text"
                    value={r.um}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        righe: p.righe.map((x, i) => (i === idx ? { ...x, um: e.target.value } : x)),
                      }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="pz"
                  />
                </div>
                <div className="col-span-12 md:col-span-1">
                  <button
                    type="button"
                    className="w-full bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2.5 rounded-xl font-medium"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        righe: p.righe.length > 1 ? p.righe.filter((_, i) => i !== idx) : [emptyRiga()],
                      }))
                    }
                    disabled={saving}
                    aria-label="Rimuovi riga"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Note opzionali..."
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {docSendError ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {docSendError}
        </div>
      ) : docSendOk ? (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {docSendOk}
        </div>
      ) : null}
      <div className="flex items-center justify-between mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5">
            <Icon name="ddt" className="w-7 h-7 text-emerald-600" /> DDT
          </h1>
          <p className="text-gray-500 mt-1">Genera, salva e stampa Documenti di Trasporto</p>
        </div>
        <button
          type="button"
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors"
          onClick={openNew}
          disabled={saving || docSending}
        >
          + Nuovo DDT
        </button>
      </div>

      {loadError ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-500">Caricamento...</div>
      ) : list.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
          Nessun DDT salvato
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {list.map((d) => (
              <div key={d.id} className="p-4 flex items-center justify-between gap-4 flex-wrap hover:bg-gray-50">
                <div className="min-w-[220px]">
                  <p className="font-semibold text-gray-800">
                    {d.numero}/{d.anno} <span className="text-sm text-gray-500 font-medium">· {fmtDateIt(d.data)}</span>
                  </p>
                  <p className="text-sm text-gray-600 mt-0.5 truncate">
                    {d.destinatario?.nome || '—'}
                    {d.causale ? <span className="text-gray-400"> · {d.causale}</span> : null}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl font-medium text-sm"
                    onClick={() => openEdit(d)}
                    disabled={saving || docSending}
                  >
                    Apri
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
                    onClick={() => doPrint(d)}
                    disabled={saving || docSending}
                  >
                    <Icon name="file" className="w-4 h-4" />
                    Scarica PDF
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
                    onClick={() => sendToDoc(d)}
                    disabled={saving || docSending}
                  >
                    <Icon name="documentazione" className="w-4 h-4" />
                    Invia a Documentazione
                  </button>
                  <button
                    type="button"
                    className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-xl font-medium text-sm"
                    onClick={() => removeRow(d.id)}
                    disabled={saving || docSending}
                  >
                    Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
