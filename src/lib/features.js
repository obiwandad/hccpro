// Funzionalità attivabili/disattivabili per singolo locale.
// La chiave coincide con il path della rotta (es. /etichette -> 'etichette').
// La Dashboard è sempre disponibile e non è elencata qui.
export const FEATURES = [
  { key: 'incassi', label: 'Incassi', icon: '💶' },
  { key: 'tracciabilita', label: 'Tracciabilità', icon: '📦' },
  { key: 'temperature', label: 'Temperature', icon: '🌡️' },
  { key: 'pulizie', label: 'Pulizie', icon: '🧹' },
  { key: 'etichette', label: 'Etichette', icon: '🏷️' },
  { key: 'ddt', label: 'DDT', icon: '📄' },
  { key: 'documentazione', label: 'Documentazione', icon: '📚' },
]

// Una funzionalità è ABILITATA per default: solo un valore esplicito `false`
// la disattiva. Così i locali esistenti mantengono tutto attivo.
export const isFeatureEnabled = (funzionalita, key) => {
  if (!funzionalita) return true
  return funzionalita[key] !== false
}
