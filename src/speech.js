// Best-effort speech-to-text for voice notes. Never throws; unsupported or failed = ''.

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export function isSpeechSupported() {
  return Boolean(Recognition)
}

// Starts listening. Returns stop(): Promise<string> with the final transcript.
export function startTranscribe() {
  if (!Recognition) return () => Promise.resolve('')
  let finalText = ''
  let interim = ''
  let rec
  let ended = false
  let resolveEnd

  const endPromise = new Promise((r) => { resolveEnd = r })

  try {
    rec = new Recognition()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = navigator.language || 'en-US'
    rec.onresult = (e) => {
      interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interim += r[0].transcript
      }
    }
    rec.onerror = () => {}
    rec.onend = () => { ended = true; resolveEnd() }
    rec.start()
  } catch {
    return () => Promise.resolve('')
  }

  return async function stop() {
    if (!ended) {
      try { rec.stop() } catch { /* already stopped */ }
      // Give the recognizer a moment to deliver the last result.
      await Promise.race([endPromise, new Promise((r) => setTimeout(r, 1500))])
    }
    return (finalText + interim).trim()
  }
}
