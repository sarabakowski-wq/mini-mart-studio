// Camera, photo grabs, and video/audio recording. Thin wrappers over browser APIs.

const CANDIDATES = {
  video: ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'],
  audio: ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'],
}

export function pickMime(kind) {
  if (typeof MediaRecorder === 'undefined') return null
  return CANDIDATES[kind].find((m) => MediaRecorder.isTypeSupported?.(m)) || ''
}

export async function startCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
    audio: false,
  })
  videoEl.srcObject = stream
  videoEl.muted = true
  videoEl.playsInline = true
  await videoEl.play().catch(() => {})
  return stream
}

export async function openMic() {
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
}

// Opening the mic can take a while (and may show a permission prompt). If the finger
// lifted in the meantime, don't start a recording that nobody is holding.
export async function startIfStillHeld(prepare, start, isHeld, release) {
  const resource = await prepare()
  if (!isHeld()) {
    release(resource)
    return null
  }
  return start(resource)
}

export function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop())
}

export function grabPhoto(videoEl) {
  const w = videoEl.videoWidth
  const h = videoEl.videoHeight
  if (!w || !h) return Promise.reject(new Error('Camera not ready yet'))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(videoEl, 0, 0, w, h)
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Photo failed'))), 'image/jpeg', 0.92)
  })
}

// Records the given tracks. Data is collected every second so an interrupted
// recording (phone locked, app backgrounded) still has everything up to that point.
export function startRecording(tracks, kind) {
  const mimeType = pickMime(kind)
  const stream = new MediaStream(tracks)
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks = []
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
  recorder.start(1000)
  const startedAt = Date.now()
  let done = null

  return {
    startedAt,
    get active() { return recorder.state === 'recording' },
    stopAndSave() {
      if (done) return done
      done = new Promise((resolve) => {
        const finish = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || `${kind}/mp4` }))
        if (recorder.state === 'inactive') return finish()
        recorder.onstop = finish
        recorder.stop()
      })
      return done
    },
  }
}
