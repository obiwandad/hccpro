/**
 * LabelPreview — renderizza un'etichetta come componente React.
 * Usato sia per l'anteprima (scalato) che per la stampa (dimensioni reali).
 *
 * Props:
 *   config     — visualConfig (dal template)
 *   data       — buildEtichettaContext(etichetta)
 *   scale      — numero (es. 0.5 per metà dimensione)
 *   forPrint   — bool, se true usa mm reali e mostra QR reale
 */

import { useEffect, useRef } from 'react'
import { getSizeById } from '../lib/labelTemplates'

const MM_TO_PX = 3.7795 // 1mm = ~3.78px a 96dpi

export default function LabelPreview({ config, data, scale = 1, forPrint = false }) {
  const size = getSizeById(config?.printSize)
  const wMm = size.w
  const hMm = size.h
  const wPx = Math.round(wMm * MM_TO_PX)
  const hPx = Math.round(hMm * MM_TO_PX)

  const ptToScaled = (pt) => Math.round(pt * 1.333 * scale)

  const c = config || {}
  const d = data || {}

  const font = c.font || 'Arial, sans-serif'
  const titleColor = c.titleColor || '#000'
  const accentColor = c.accentColor || '#dc2626'
  const bgColor = c.bgColor || '#fff'
  const basePt = c.fontSize || 7
  const smallPt = Math.max(5, basePt - 1)
  const titlePt = Math.round(basePt * 1.35)

  const hasQr = c.qrPosition && c.qrPosition !== 'none'
  const qrRight = c.qrPosition === 'right'
  const qrBottom = c.qrPosition === 'bottom'

  const QrBox = () => {
    const ref = useRef(null)
    useEffect(() => {
      if (!forPrint || !d.qrUrl || !ref.current) return
      ref.current.innerHTML = ''
      if (typeof window !== 'undefined' && window.QRCode) {
        new window.QRCode(ref.current, {
          text: d.qrUrl,
          width: Math.round(12 * MM_TO_PX),
          height: Math.round(12 * MM_TO_PX),
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M,
        })
      }
    }, [d.qrUrl, forPrint])

    const sizePx = Math.round(12 * MM_TO_PX * scale)

    if (forPrint) {
      return (
        <div ref={ref}
          style={{ width: Math.round(12 * MM_TO_PX), height: Math.round(12 * MM_TO_PX), flexShrink: 0 }} />
      )
    }

    // Anteprima: placeholder grigio con pattern QR finto
    return (
      <div style={{
        width: sizePx, height: sizePx, flexShrink: 0,
        background: '#f0f0f0', border: `${Math.max(1, scale * 0.5)}px solid #ccc`,
        borderRadius: 1 * scale,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width={sizePx * 0.7} height={sizePx * 0.7} viewBox="0 0 10 10" fill="none">
          <rect x="0" y="0" width="4" height="4" fill="#aaa"/>
          <rect x="1" y="1" width="2" height="2" fill="#f0f0f0"/>
          <rect x="6" y="0" width="4" height="4" fill="#aaa"/>
          <rect x="7" y="1" width="2" height="2" fill="#f0f0f0"/>
          <rect x="0" y="6" width="4" height="4" fill="#aaa"/>
          <rect x="1" y="7" width="2" height="2" fill="#f0f0f0"/>
          <rect x="5" y="5" width="1" height="1" fill="#aaa"/>
          <rect x="7" y="5" width="1" height="1" fill="#aaa"/>
          <rect x="6" y="6" width="1" height="1" fill="#aaa"/>
          <rect x="8" y="6" width="2" height="2" fill="#aaa"/>
          <rect x="5" y="8" width="2" height="1" fill="#aaa"/>
          <rect x="9" y="9" width="1" height="1" fill="#aaa"/>
        </svg>
      </div>
    )
  }

  const s = (pt) => ptToScaled(pt) // shorthand
  const gap = Math.round(0.6 * MM_TO_PX * scale)
  const pad = Math.round(1.5 * MM_TO_PX * scale)
  const sepH = Math.max(1, Math.round(scale * 0.5))

  const Sep = () => <div style={{ borderTop: `${sepH}px solid #ddd`, margin: `${gap}px 0` }} />

  const Label = ({ children }) => (
    <p style={{
      fontSize: s(smallPt), color: '#888', textTransform: 'uppercase',
      letterSpacing: '0.02em', lineHeight: 1.2, marginBottom: 1 * scale,
    }}>{children}</p>
  )

  const Value = ({ children, accent }) => (
    <p style={{
      fontSize: s(basePt), color: accent ? accentColor : titleColor,
      fontWeight: 500, lineHeight: 1.2,
    }}>{children}</p>
  )

  const Field = ({ label, value, accent }) => {
    if (!value) return null
    return (
      <div style={{ marginBottom: gap * 0.6 }}>
        <Label>{label}</Label>
        <Value accent={accent}>{value}</Value>
      </div>
    )
  }

  const AllergeniBox = () => {
    if (!d.allergeniText) return null
    return (
      <div style={{
        background: '#fff8e1',
        border: `${sepH}px solid #f59e0b`,
        padding: `${gap * 0.6}px ${gap}px`,
        borderRadius: 2 * scale,
        marginBottom: gap * 0.6,
      }}>
        <p style={{ fontSize: s(smallPt), fontWeight: 'bold', color: '#92400e' }}>⚠️ ALLERGENI:</p>
        <p style={{ fontSize: s(smallPt), color: '#92400e' }}>{d.allergeniText}</p>
      </div>
    )
  }

  const Footer = ({ children }) => (
    <p style={{ fontSize: s(smallPt), color: '#888', lineHeight: 1.3 }}>{children}</p>
  )

  // Date block (condiviso tra landscape e portrait)
  const DateBlock = () => (
    <div>
      {c.fields?.dataProduzione && d.dataProduzione && <Field label="Prodotto il" value={d.dataProduzione} />}
      {c.fields?.dataScadenza && d.dataScadenza && <Field label="Scade il" value={d.dataScadenza} accent />}
    </div>
  )

  const isLandscape = wMm > hMm

  const content = isLandscape ? (
    // Layout orizzontale: due colonne
    <div style={{ display: 'flex', gap: pad, flex: 1, minHeight: 0 }}>
      <div style={{ flex: '1.3', minWidth: 0, overflow: 'hidden' }}>
        <p style={{ fontSize: s(titlePt), fontWeight: 'bold', color: titleColor, lineHeight: 1.15, marginBottom: gap }}>
          {c.titoloPersonalizzato || d.ricettaNome}
        </p>
        {c.fields?.ingredienti && d.ingredientiText && (
          <div style={{ marginBottom: gap * 0.6 }}>
            <Label>Ingredienti</Label>
            <Value>{d.ingredientiText}</Value>
          </div>
        )}
        {c.fields?.allergeni && <AllergeniBox />}
      </div>
      <div style={{ flex: 1, minWidth: 0, borderLeft: `${sepH}px solid #eee`, paddingLeft: pad * 0.6, overflow: 'hidden' }}>
        <DateBlock />
        {c.fields?.lotto && d.lotto && <Footer>Lotto: {d.lotto}</Footer>}
        {c.fields?.peso && d.peso && <Footer>{d.peso}g</Footer>}
        {c.fields?.quantita && d.quantita && <Footer>{d.quantita} pz</Footer>}
        {c.fields?.operatore && d.operatore && <Footer>Op: {d.operatore}</Footer>}
        {c.fields?.locale && d.locale && <Footer>{d.locale}</Footer>}
        {hasQr && qrRight && <div style={{ marginTop: gap }}><QrBox /></div>}
      </div>
    </div>
  ) : (
    // Layout verticale
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <p style={{ fontSize: s(titlePt), fontWeight: 'bold', color: titleColor, lineHeight: 1.15, marginBottom: gap }}>
        {c.titoloPersonalizzato || d.ricettaNome}
      </p>

      {c.fields?.ingredienti && d.ingredientiText && (
        <div style={{ marginBottom: gap * 0.6 }}>
          <Label>Ingredienti</Label>
          <Value>{d.ingredientiText}</Value>
        </div>
      )}

      {c.fields?.allergeni && <AllergeniBox />}

      {/* Date */}
      {(c.fields?.dataProduzione || c.fields?.dataScadenza) && (
        <div style={{ display: 'flex', gap: pad }}>
          {c.fields?.dataProduzione && d.dataProduzione && (
            <div style={{ flex: 1 }}>
              <Label>Prodotto il</Label>
              <Value>{d.dataProduzione}</Value>
            </div>
          )}
          {c.fields?.dataScadenza && d.dataScadenza && (
            <div style={{ flex: 1 }}>
              <Label>Scade il</Label>
              <Value accent>{d.dataScadenza}</Value>
            </div>
          )}
          {hasQr && qrRight && <QrBox />}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: gap }}>
        <Sep />
        {c.fields?.lotto && d.lotto && <Footer>Lotto: <strong>{d.lotto}</strong></Footer>}
        {c.fields?.peso && d.peso && <Footer>{d.peso}g</Footer>}
        {c.fields?.quantita && d.quantita && <Footer>{d.quantita} pz</Footer>}
        {c.fields?.operatore && d.operatore && <Footer>Op: {d.operatore}</Footer>}
        {c.fields?.locale && d.locale && <Footer>{d.locale}</Footer>}
        {hasQr && qrBottom && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: gap }}>
            <QrBox />
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div style={{
      width: wPx * scale,
      height: hPx * scale,
      background: bgColor,
      fontFamily: font,
      padding: pad,
      boxSizing: 'border-box',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {content}
    </div>
  )
}
