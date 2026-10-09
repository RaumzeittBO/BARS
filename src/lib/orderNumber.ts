export const MAX_VISIBLE_ORDER_NUMBER = 50

export function formatOrderNumber(sequence: number) {
  const safeSequence = Math.max(1, Math.trunc(sequence))
  const visibleNumber = ((safeSequence - 1) % MAX_VISIBLE_ORDER_NUMBER) + 1
  return `#${String(visibleNumber).padStart(3, '0')}`
}
