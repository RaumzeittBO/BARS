import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: 'primary' | 'secondary' | 'ghost' | 'success'
    size?: 'sm' | 'md' | 'lg'
    fullWidth?: boolean
  }
>

const toneClasses = {
  primary: 'bg-[#FF6A00] text-white shadow-lg shadow-[#FF6A00]/20 hover:bg-[#E55F00] active:translate-y-px',
  secondary: 'bg-[#1E1E1E] text-white ring-1 ring-[#333333] hover:bg-[#282828] active:translate-y-px',
  ghost: 'bg-transparent text-[#9E9E9E] hover:bg-[#1C1C1E] hover:text-white active:translate-y-px',
  success: 'bg-[#10B981] text-white shadow-lg shadow-[#10B981]/20 hover:bg-[#059669] active:translate-y-px',
}

const sizeClasses = {
  sm: 'h-10 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-14 px-5 text-base',
}

export function Button({
  children,
  className = '',
  tone = 'primary',
  size = 'md',
  fullWidth,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50',
        toneClasses[tone],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}
