import type { HTMLAttributes, PropsWithChildren } from 'react'

export function Panel({ children, className = '', ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={`rounded-3xl border border-[#262626] bg-[#141414] shadow-card backdrop-blur ${className}`} {...props}>
      {children}
    </div>
  )
}

