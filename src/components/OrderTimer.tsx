import { useEffect, useMemo, useState } from 'react'
import { formatElapsed } from '../lib/format'
import { getServerNow, subscribeToServerClock } from '../lib/serverClock'

export function OrderTimer({ createdAt, stoppedAt }: { createdAt: string; stoppedAt?: string }) {
  const [now, setNow] = useState(() => getServerNow())
  const frozenAt = useMemo(() => (stoppedAt ? new Date(stoppedAt).getTime() : null), [stoppedAt])

  useEffect(() => {
    if (frozenAt) {
      return
    }

    const timer = window.setInterval(() => setNow(getServerNow()), 1000)
    const unsubscribe = subscribeToServerClock(() => setNow(getServerNow()))

    return () => {
      window.clearInterval(timer)
      unsubscribe()
    }
  }, [frozenAt])

  return <span>{formatElapsed(createdAt, frozenAt ?? now)}</span>
}
