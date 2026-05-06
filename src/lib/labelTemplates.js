// labelTemplates.js — sistema semplificato
// L'etichetta è renderizzata come componente React (vedi LabelPreview.jsx)
// Questo file gestisce solo config, storage e context dati

export const PRINT_SIZES = [
  { id: '30x50', label: '30×50 mm', desc: 'Verticale', w: 30, h: 50 },
  { id: '50x30', label: '50×30 mm', desc: 'Orizzontale', w: 50, h: 30 },
  { id: '40x60', label: '40×60 mm', desc: 'Verticale', w: 40, h: 60 },
  { id: '60x40', label: '60×40 mm', desc: 'Orizzontale', w: 60, h: 40 },
]

export const FONTS = [
  { id: 'Arial, sans-serif', label: 'Arial' },
  { id: 'Georgia, serif', label: 'Georgia' },
  { id: "'Courier New', monospace", label: 'Courier New' },
  { id: 'Verdana, sans-serif', label: 'Verdana' },
]

export const FIELDS = [
  { id: 'nome', label: 'Nome piatto', required: true },
  { id: 'ingredienti', label: 'Ingredienti' },
  { id: 'allergeni', label: 'Allergeni' },
  { id: 'dataProduzione', label: 'Data produzione' },
  { id: 'dataScadenza', label: 'Data scadenza' },
  { id: 'lotto', label: 'Numero lotto' },
  { id: 'peso', label: 'Peso porzione' },
  { id: 'quantita', label: 'Numero porzioni' },
  { id: 'operatore', label: 'Operatore' },
  { id: 'locale', label: 'Locale/Azienda' },
]

export const QR_POSITIONS = [
  { id: 'none', label: 'Nessuno' },
  { id: 'bottom', label: 'In basso' },
  { id: 'right', label: 'Accanto alle date' },
]

export const getSizeById = (id) =>
  PRINT_SIZES.find(s => s.id === id) || PRINT_SIZES[0]

export const defaultVisualConfig = () => ({
  nome: 'Nuovo template',
  printSize: '30x50',
  font: 'Arial, sans-serif',
  fontSize: 7,       // pt
  bgColor: '#ffffff',
  titleColor: '#000000',
  accentColor: '#dc2626',
  titoloPersonalizzato: '',
  qrPosition: 'none',
  fields: {
    nome: true,
    ingredienti: true,
    allergeni: true,
    dataProduzione: true,
    dataScadenza: true,
    lotto: true,
    peso: false,
    quantita: false,
    operatore: true,
    locale: true,
  },
})

export const makeTemplateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const hex = () => Math.floor(Math.random() * 16).toString(16)
  const s = (n) => Array.from({ length: n }, hex).join('')
  return `${s(8)}-${s(4)}-4${s(3)}-${((8 + Math.floor(Math.random() * 4))).toString(16)}${s(3)}-${s(12)}`
}

// Dati di esempio per l'anteprima
export const ESEMPIO = {
  ricettaNome: 'Lasagna Verdure',
  ingredientiText: 'Pasta, Zucchine, Melanzane, Pomodoro, Mozzarella',
  allergeniText: 'Glutine, Latte, Uova',
  dataProduzione: new Date().toLocaleDateString('it-IT'),
  dataScadenza: new Date(Date.now() + 7 * 86400000).toLocaleDateString('it-IT'),
  lotto: `${new Date().toISOString().slice(0,10).replace(/-/g,'')}-001`,
  operatore: 'Mario Rossi',
  locale: 'Ristorante Principale',
  quantita: '4',
  peso: '250',
}

// Costruisce il context dati per l'etichetta
export const buildEtichettaContext = (etichetta, baseUrl) => {
  const lotto = etichetta?.lotto ?? ''
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  return {
    ricettaNome: etichetta?.ricettaNome ?? '',
    ingredientiText: etichetta?.ingredientiText ?? '',
    allergeniText: etichetta?.allergeniText ?? '',
    dataProduzione: etichetta?.dataProduzione ?? '',
    dataScadenza: etichetta?.dataScadenza ?? '',
    lotto,
    operatore: etichetta?.operatore ?? '',
    locale: etichetta?.locale ?? '',
    quantita: etichetta?.quantita ?? '',
    peso: etichetta?.peso ?? '',
    qrUrl: lotto ? `${base}/tracciabilita/${encodeURIComponent(lotto)}` : '',
  }
}
