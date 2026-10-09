type Listener = () => void

const listeners = new Set<Listener>()
const MAX_REASONABLE_OFFSET_MS = 20 * 60 * 1000

let offsetMs = 0

function emit() {
  listeners.forEach((listener) => listener())
}

function toMillis(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return ((value as { toDate: () => Date }).toDate()).getTime()
  }

  return null
}

export function getServerNow() {
  return Date.now() + offsetMs
}

export function syncServerClock(value: unknown) {
  const serverMs = toMillis(value)

  if (serverMs === null) {
    return
  }

  const nextOffset = serverMs - Date.now()

  if (Math.abs(nextOffset) > MAX_REASONABLE_OFFSET_MS) {
    return
  }

  if (Math.abs(nextOffset - offsetMs) < 250) {
    return
  }

  offsetMs = nextOffset
  emit()
}

export function subscribeToServerClock(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
