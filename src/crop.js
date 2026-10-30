// Instagram portrait export: center crop to 4:5, 1080×1350 JPEG.

export function cropRect(w, h, ratio = 4 / 5) {
  if (w / h > ratio) {
    const sw = Math.round(h * ratio)
    return { sx: Math.round((w - sw) / 2), sy: 0, sw, sh: h }
  }
  const sh = Math.round(w / ratio)
  return { sx: 0, sy: Math.round((h - sh) / 2), sw: w, sh }
}

export async function cropToJpeg(blob, { width = 1080, height = 1350, quality = 0.9 } = {}) {
  const bitmap = await createImageBitmap(blob)
  const { sx, sy, sw, sh } = cropRect(bitmap.width, bitmap.height, width / height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height)
  bitmap.close?.()
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make JPEG'))), 'image/jpeg', quality)
  })
}
