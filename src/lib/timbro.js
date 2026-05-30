const wrapLines = (ctx, text, maxWidth) => {
  const words = String(text).split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

export function generaTimbroDataUrl({ nome, indirizzo, pivaCf, color = '#1d4ed8' } = {}) {
  const scale = 3
  const W = 360
  const H = 150
  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)

  ctx.clearRect(0, 0, W, H)

  ctx.strokeStyle = color
  ctx.fillStyle = color

  const drawRoundRect = (x, y, w, h, r, lw) => {
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
    ctx.stroke()
  }
  drawRoundRect(6, 6, W - 12, H - 12, 10, 3)
  drawRoundRect(12, 12, W - 24, H - 24, 7, 1)

  const cx = W / 2
  let y = 40

  ctx.textAlign = 'center'
  ctx.font = 'bold 22px Helvetica, Arial, sans-serif'
  const nomeLines = wrapLines(ctx, (nome || 'NOME LOCALE').toUpperCase(), W - 50).slice(0, 2)
  for (const l of nomeLines) {
    ctx.fillText(l, cx, y)
    y += 24
  }

  y += 2
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(40, y)
  ctx.lineTo(W - 40, y)
  ctx.stroke()
  y += 16

  ctx.font = '12px Helvetica, Arial, sans-serif'
  if (indirizzo) {
    const indLines = wrapLines(ctx, indirizzo, W - 50).slice(0, 2)
    for (const l of indLines) {
      ctx.fillText(l, cx, y)
      y += 15
    }
  }

  if (pivaCf) {
    ctx.font = 'bold 12px Helvetica, Arial, sans-serif'
    ctx.fillText(`P.IVA/CF: ${pivaCf}`, cx, y)
  }

  return canvas.toDataURL('image/png')
}

export function scaricaTimbro(dataUrl, nomeFile = 'timbro.png') {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = nomeFile
  document.body.appendChild(a)
  a.click()
  a.remove()
}
