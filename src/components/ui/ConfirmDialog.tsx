import type { ReactNode } from 'react'
import { Button } from './Button'
import { Panel } from './Panel'

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'primary',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'primary' | 'success'
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <Panel className="w-full max-w-lg border-white/90 bg-white/96 p-6 shadow-float">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">Confirmacion</div>
        <h3 className="mt-2 text-2xl font-semibold text-ink">{title}</h3>
        <div className="mt-3 text-sm leading-7 text-muted">{body}</div>
        <div className="mt-6 flex justify-end gap-3">
          <Button tone="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button tone={tone} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </Panel>
    </div>
  )
}
