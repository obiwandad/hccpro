import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLocale } from '../../context/LocaleContext'
import {
  PRINT_SIZES, FONTS, FIELDS, QR_POSITIONS,
  defaultVisualConfig, getSizeById, makeTemplateId, ESEMPIO, buildEtichettaContext,
} from '../../lib/labelTemplates'
import LabelPreview from '../../components/LabelPreview'

const MM_TO_PX = 3.7795

const Toggle = ({ label, checked, onChange, disabled }) => (
  <label className={`flex items-center justify-between py-1.5 select-none ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
    <span className="text-sm text-gray-700">{label}</span>
    <div onClick={() => !disabled && onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ml-3 ${checked ? 'bg-emerald-500' : 'bg-gray-200'}`}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </div>
  </label>
)

// Calcola la scala per far entrare l'etichetta nel contenitore disponibile
function useScaledPreview(config) {
  const containerRef = useRef(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!containerRef.current || !config) return
    const size = getSizeById(config.printSize)
    const realW = size.w * MM_TO_PX
    const realH = size.h * MM_TO_PX

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const s = Math.min(
        (width - 32) / realW,
        (height - 32) / realH,
        2 // max 2x
      )
      setScale(Math.max(0.1, s))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [config?.printSize])

  return { containerRef, scale }
}

// Pannello anteprima live
function PreviewPanel({ config, data, title, subtitle }) {
  const { containerRef, scale } = useScaledPreview(config)
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 flex-shrink-0 px-1">
        <p className="text-sm font-semibold text-gray-600">{title || '👁 Anteprima'}</p>
        {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
      </div>
      <div ref={containerRef}
        className="flex-1 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden">
        {config ? (
          <div style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.12)', borderRadius: 2 }}>
            <LabelPreview config={config} data={data} scale={scale} forPrint={false} />
          </div>
        ) : (
          <p className="text-sm text-gray-400">Seleziona un template</p>
        )}
      </div>
    </div>
  )
}

export default function AdminTemplateEtichette() {
  const { profilo, activeLocaleId } = useLocale()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [config, setConfig] = useState(defaultVisualConfig())
  const [previewTarget, setPreviewTarget] = useState(null)

  const canUse = profilo?.ruolo === 'admin'
  const esempioData = useMemo(() => buildEtichettaContext(ESEMPIO), [])

  const fetchTemplates = useCallback(async () => {
    if (!activeLocaleId) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('etichette_template')
      .select('*')
      .eq('locale_id', activeLocaleId)
      .order('nome')
    if (err) { setError(err.message); setLoading(false); return }
    setTemplates(data || [])
    setLoading(false)
  }, [activeLocaleId])

  useEffect(() => {
    if (!canUse) return
    fetchTemplates()
  }, [canUse, fetchTemplates])

  const updateConfig = (key, value) => setConfig(prev => ({ ...prev, [key]: value }))
  const updateField = (id, val) => setConfig(prev => ({ ...prev, fields: { ...prev.fields, [id]: val } }))

  const openNew = () => {
    setEditingId(null)
    setConfig(defaultVisualConfig())
    setError('')
    setModalOpen(true)
  }

  const openEdit = (t) => {
    setEditingId(t.id)
    let vc = defaultVisualConfig()
    if (t.visual_config) {
      try {
        vc = { ...vc, ...JSON.parse(t.visual_config) }
      } catch {
        vc = defaultVisualConfig()
      }
    }
    setConfig({ ...vc, nome: t.nome ?? vc.nome })
    setError('')
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!activeLocaleId || !config.nome?.trim()) return
    setSaving(true); setError('')
    const payload = {
      nome: config.nome.trim(),
      visual_config: JSON.stringify(config),
      locale_id: activeLocaleId,
      // css e html non più usati, ma li manteniamo vuoti per compatibilità
      css: '', html: '',
    }
    try {
      if (editingId) {
        const { error: err } = await supabase.from('etichette_template').update(payload).eq('id', editingId)
        if (err) { setError(err.message); return }
      } else {
        const { error: err } = await supabase.from('etichette_template').insert({ ...payload, id: makeTemplateId() })
        if (err) { setError(err.message); return }
      }
      await fetchTemplates()
      // Aggiorna previewTarget se era quello che stavamo modificando
      if (editingId && previewTarget?.id === editingId) {
        setPreviewTarget({ ...previewTarget, visual_config: JSON.stringify(config), nome: config.nome.trim() })
      }
      setModalOpen(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async (t) => {
    if (!confirm(`Eliminare "${t.nome}"?`)) return
    const { error: err } = await supabase.from('etichette_template').delete().eq('id', t.id)
    if (err) { setError(err.message); return }
    if (previewTarget?.id === t.id) setPreviewTarget(null)
    await fetchTemplates()
  }

  // Config del template selezionato per l'anteprima lista
  const previewConfig = useMemo(() => {
    if (!previewTarget) return null
    try { return previewTarget.visual_config ? JSON.parse(previewTarget.visual_config) : null } catch { return null }
  }, [previewTarget])

  const sizeLabel = (vc) => {
    if (!vc) return ''
    try {
      const cfg = typeof vc === 'string' ? JSON.parse(vc) : vc
      const s = getSizeById(cfg.printSize)
      return `${s.w}×${s.h}mm`
    } catch { return '' }
  }

  if (!canUse) return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100">
      <p className="text-gray-500 text-sm">Sezione riservata agli admin.</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">🏷️ Template Etichette</h1>
          <p className="text-gray-500 text-sm mt-0.5">Configura l&apos;aspetto delle etichette</p>
        </div>
        <button onClick={openNew}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          + Nuovo
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Lista */}
        <div className="lg:col-span-3 space-y-2">
          {loading ? (
            <p className="text-sm text-gray-400 p-3">Caricamento...</p>
          ) : templates.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-6 text-center text-gray-400">
              <p className="text-2xl mb-1">🏷️</p>
              <p className="text-sm">Nessun template — clicca &quot;+ Nuovo&quot; per crearne uno</p>
            </div>
          ) : (
            templates.map(t => (
              <div key={t.id} onClick={() => setPreviewTarget(t)}
                className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${previewTarget?.id === t.id ? 'border-emerald-400 bg-emerald-50' : 'border-gray-100 bg-white hover:border-gray-300'}`}>
                <div>
                  <p className="text-sm font-medium text-gray-800">{t.nome}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{sizeLabel(t.visual_config)}</p>
                </div>
                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  {previewTarget?.id === t.id && <span className="text-emerald-500 text-sm mr-1">👁</span>}
                  <button onClick={() => openEdit(t)} className="text-blue-500 text-xs px-2.5 py-1 rounded-lg hover:bg-blue-50">Modifica</button>
                  <button onClick={() => handleDelete(t)} className="text-red-400 text-xs px-2.5 py-1 rounded-lg hover:bg-red-50">Elimina</button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Anteprima lista */}
        <div className="lg:col-span-2" style={{ height: '320px' }}>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm h-full p-4">
            <PreviewPanel
              config={previewConfig}
              data={esempioData}
              subtitle={previewTarget?.nome}
            />
          </div>
        </div>
      </div>

      {/* MODAL EDITOR */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-3 overflow-y-auto bg-black/50">
          <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl mt-4 mb-8" style={{ minHeight: '600px' }}>

            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-800">{editingId ? 'Modifica template' : 'Nuovo template'}</h3>
              <button onClick={() => !saving && setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {error && <div className="mx-5 mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>}

            <div className="flex flex-col lg:flex-row" style={{ minHeight: '540px' }}>

              {/* Config — colonna sinistra scrollabile */}
              <div className="w-full lg:w-64 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-100 overflow-y-auto p-4" style={{ maxHeight: '70vh' }}>

                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Nome template *</label>
                  <input value={config.nome} onChange={e => updateConfig('nome', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Es. Etichetta Sottovuoto" />
                </div>

                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Titolo fisso</label>
                  <input value={config.titoloPersonalizzato} onChange={e => updateConfig('titoloPersonalizzato', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Vuoto = nome piatto" />
                </div>

                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Formato</label>
                  <select value={config.printSize} onChange={e => updateConfig('printSize', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
                    {PRINT_SIZES.map(s => <option key={s.id} value={s.id}>{s.label} — {s.desc}</option>)}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Font</label>
                  <select value={config.font} onChange={e => updateConfig('font', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    {FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-6">A</span>
                    <input type="range" min={5} max={12} value={config.fontSize}
                      onChange={e => updateConfig('fontSize', parseInt(e.target.value))}
                      className="flex-1 accent-emerald-500" />
                    <span className="text-xs text-gray-400 w-6 text-right">A</span>
                    <span className="text-xs text-gray-500 w-8">{config.fontSize}pt</span>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Colori</label>
                  <div className="space-y-2">
                    {[
                      { key: 'titleColor', label: 'Testo' },
                      { key: 'accentColor', label: 'Scadenza' },
                      { key: 'bgColor', label: 'Sfondo' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2">
                        <input type="color" value={config[key]} onChange={e => updateConfig(key, e.target.value)}
                          className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer flex-shrink-0" />
                        <span className="text-sm text-gray-600">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">QR Tracciabilità</label>
                  <select value={config.qrPosition || 'none'} onChange={e => updateConfig('qrPosition', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
                    {QR_POSITIONS.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
                  </select>
                  {config.qrPosition !== 'none' && (
                    <p className="text-xs text-gray-400 mt-1.5 bg-blue-50 rounded-lg px-2.5 py-1.5">
                      📱 Scansionando si accede alla tracciabilità degli ingredienti
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Campi</label>
                  <div className="divide-y divide-gray-50">
                    {FIELDS.map(f => (
                      <Toggle key={f.id} label={f.label}
                        checked={config.fields[f.id] ?? false}
                        disabled={f.required}
                        onChange={v => updateField(f.id, v)} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Anteprima live — destra */}
              <div className="flex-1 p-4" style={{ minHeight: '400px' }}>
                <PreviewPanel
                  config={config}
                  data={esempioData}
                  title="👁 Anteprima live"
                  subtitle={`${getSizeById(config.printSize).w}×${getSizeById(config.printSize).h}mm`}
                />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => !saving && setModalOpen(false)} disabled={saving}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2 rounded-xl text-sm font-medium">
                Annulla
              </button>
              <button onClick={handleSave} disabled={saving || !config.nome?.trim()}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-medium">
                {saving ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
