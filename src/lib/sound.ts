let alertInterval: number | null = null
let audioInstance: HTMLAudioElement | null = null
let activeAudioContext: AudioContext | null = null
let muted = false

function destroyAudioInstance() {
  if (audioInstance) {
    try {
      audioInstance.pause()
    } catch {}
    try {
      audioInstance.currentTime = 0
    } catch {}
    try {
      audioInstance.src = ''
      audioInstance.removeAttribute('src')
      audioInstance.load()
    } catch {}
    audioInstance = null
  }
}

export function playLoudOrderAlert() {
  if (muted) return
  try {
    // Always create a fresh Audio element to avoid stale state
    destroyAudioInstance()
    audioInstance = new Audio('/notificacion.mp3')
    audioInstance.volume = 1.0
    audioInstance.play().catch(() => {
      playWebAudioTone()
    })
  } catch {
    playWebAudioTone()
  }
}

function playWebAudioTone() {
  if (muted) return
  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  if (!AudioContextCtor) return

  try {
    if (activeAudioContext) {
      try {
        activeAudioContext.close()
      } catch {}
    }
    activeAudioContext = new AudioContextCtor()
    const context = activeAudioContext

    const playTone = (freq: number, startTime: number, duration: number, volume = 0.45) => {
      const osc = context.createOscillator()
      const gain = context.createGain()

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, startTime)
      gain.gain.setValueAtTime(0.0001, startTime)
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration - 0.01)

      osc.connect(gain)
      gain.connect(context.destination)
      osc.start(startTime)
      osc.stop(startTime + duration)
    }

    const t = context.currentTime
    playTone(587.33, t, 0.16, 0.45)
    playTone(880, t + 0.12, 0.2, 0.5)
    playTone(1174.66, t + 0.28, 0.32, 0.55)
  } catch {}
}

export function playKitchenNotification() {
  playLoudOrderAlert()
}

export function startContinuousOrderAlert() {
  muted = false
  if (alertInterval !== null) return
  playLoudOrderAlert()
  alertInterval = window.setInterval(() => {
    playLoudOrderAlert()
  }, 2500)
}

export function stopContinuousOrderAlert() {
  // 1. Set muted flag FIRST to block any in-flight or queued playback
  muted = true

  // 2. Kill the repeating interval
  if (alertInterval !== null) {
    clearInterval(alertInterval)
    alertInterval = null
  }

  // 3. Destroy the Audio element completely
  destroyAudioInstance()

  // 4. Close any WebAudio context
  if (activeAudioContext) {
    try {
      activeAudioContext.close()
    } catch {}
    activeAudioContext = null
  }
}
