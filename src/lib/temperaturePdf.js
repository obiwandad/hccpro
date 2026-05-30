import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

const giorniNelMese = (anno, mese) => new Date(anno, mese + 1, 0).getDate()

// Genera e scarica il registro temperature in PDF nel formato della
// "SCHEDA 3 - Scheda di controllo temperature di conservazione":
//   - giorni 1..31 in riga
//   - dispositivi/zone in colonna
//   - una temperatura per cella
//
// rilevazioni: array con { data_ora, temperatura, note, zona_id,
//   zone_temperatura: { nome, soglia_min, soglia_max } }
// zone: elenco zone del locale [{ id, nome, soglia_min, soglia_max }]
export function buildTemperaturePDF({ rilevazioni, zone, mese, anno, localeName }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 10

  // Colonne dispositivo: usa le zone del locale; la scheda originale ne prevede 10.
  // Se ci sono più di 10 zone si genera una seconda pagina-scheda.
  const COLS_PER_SHEET = 10
  const zoneList = (zone && zone.length > 0)
    ? zone
    : // fallback: ricava le zone dai dati se non passate
      Array.from(new Map(rilevazioni.filter(r => r.zone_temperatura).map(r => [r.zona_id, { id: r.zona_id, nome: r.zone_temperatura?.nome, soglia_min: r.zone_temperatura?.soglia_min, soglia_max: r.zone_temperatura?.soglia_max }])).values())

  // Mappa: giorno -> zona_id -> rilevazione (la più recente del giorno)
  const ordinate = [...rilevazioni].sort((a, b) => new Date(b.data_ora) - new Date(a.data_ora))
  const perGiornoZona = {}
  for (const r of ordinate) {
    const g = new Date(r.data_ora).getDate()
    if (!perGiornoZona[g]) perGiornoZona[g] = {}
    if (!perGiornoZona[g][r.zona_id]) perGiornoZona[g][r.zona_id] = r
  }

  const nGiorni = giorniNelMese(anno, mese)

  const fuoriSoglia = (r, z) => {
    if (!r || r.temperatura == null) return false
    const min = z?.soglia_min, max = z?.soglia_max
    if (min == null || max == null) return false
    return r.temperatura < min || r.temperatura > max
  }

  // Suddivide le zone in blocchi da max 10 colonne (una "scheda" per blocco)
  const blocchi = []
  for (let i = 0; i < Math.max(zoneList.length, 1); i += COLS_PER_SHEET) {
    blocchi.push(zoneList.slice(i, i + COLS_PER_SHEET))
  }
  if (blocchi.length === 0) blocchi.push([])

  blocchi.forEach((blocco, idx) => {
    if (idx > 0) doc.addPage()

    // Intestazione tipo scheda
    doc.setFillColor(20, 20, 20)
    doc.rect(margin, margin, pageW - margin * 2, 14, 'F')
    doc.setTextColor(255)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('SCHEDA 3 — SCHEDA DI CONTROLLO TEMPERATURE DI CONSERVAZIONE', margin + 2, margin + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('(compilare una volta al giorno)', margin + 2, margin + 10)
    doc.setTextColor(0)

    // Firma responsabile
    doc.setFontSize(8)
    doc.text('Firma resp. autocontrollo / delegato: ______________________________', pageW - margin - 95, margin + 20)

    // Riquadro Anno / Mese
    let y = margin + 24
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(`Anno: ${anno}`, margin + 2, y + 4)
    doc.text(`Mese: ${MESI[mese]}`, margin + 45, y + 4)
    if (localeName) doc.text(`Locale: ${localeName}`, margin + 95, y + 4)
    doc.setFont('helvetica', 'normal')

    // Costruisce head: Data + nomi zone (con soglie sotto)
    const head = [['Data', ...blocco.map((z) => {
      const sog = (z?.soglia_min != null && z?.soglia_max != null) ? `\n(${z.soglia_min}/${z.soglia_max}°)` : ''
      return `${z?.nome || 'n.'}${sog}`
    })]]
    // Pareggia a 10 colonne come la scheda cartacea (colonne vuote "n.")
    const padCols = COLS_PER_SHEET - blocco.length
    for (let i = 0; i < padCols; i += 1) head[0].push('n.')

    // Body: una riga per giorno
    const body = []
    const fuoriCells = [] // {r, c}
    for (let g = 1; g <= nGiorni; g += 1) {
      const row = [String(g)]
      blocco.forEach((z, ci) => {
        const r = perGiornoZona[g]?.[z.id]
        row.push(r && r.temperatura != null ? `${r.temperatura}°` : '')
        if (fuoriSoglia(r, z)) fuoriCells.push({ r: g - 1, c: ci + 1 })
      })
      for (let i = 0; i < padCols; i += 1) row.push('')
      body.push(row)
    }

    autoTable(doc, {
      startY: y + 7,
      head,
      body,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1, halign: 'center', valign: 'middle', lineColor: [180, 180, 180], lineWidth: 0.1 },
      headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: 'bold', fontSize: 7, lineColor: [150, 150, 150] },
      columnStyles: { 0: { cellWidth: 12, fillColor: [248, 248, 248], fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section !== 'body') return
        const hit = fuoriCells.find((f) => f.r === data.row.index && f.c === data.column.index)
        if (hit) {
          data.cell.styles.textColor = [185, 28, 28]
          data.cell.styles.fillColor = [253, 235, 235]
          data.cell.styles.fontStyle = 'bold'
        }
      },
      didDrawPage: () => {
        const pageH = doc.internal.pageSize.getHeight()
        doc.setFontSize(6.5)
        doc.setTextColor(120)
        doc.text(
          'In caso di temperatura non idonea: spostare i prodotti in un dispositivo funzionante, registrare una non conformità e ripristinare l\'impianto.',
          margin, pageH - 10, { maxWidth: pageW - margin * 2 }
        )
        doc.text(`HACCPro — generato il ${new Date().toLocaleString('it-IT')}`, margin, pageH - 6)
        doc.setTextColor(0)
      },
    })
  })

  const fileName = `scheda3-temperature_${localeName ? localeName.replace(/\s+/g, '-') + '_' : ''}${anno}-${String(mese + 1).padStart(2, '0')}.pdf`
  return { doc, fileName }
}

export function exportTemperaturePDF({ rilevazioni, zone, mese, anno, localeName }) {
  const { doc, fileName } = buildTemperaturePDF({ rilevazioni, zone, mese, anno, localeName })
  doc.save(fileName)
}
