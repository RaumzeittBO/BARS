interface BarsLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showSubtitle?: boolean
}

export function BarsLogo({ className = '', size = 'md', showSubtitle = true }: BarsLogoProps) {
  const dimensions = {
    sm: { height: 28, fontSize: 'text-lg', badgeSize: 'w-7 h-7', barsStroke: 2.5 },
    md: { height: 36, fontSize: 'text-2xl', badgeSize: 'w-9 h-9', barsStroke: 3.5 },
    lg: { height: 48, fontSize: 'text-3xl', badgeSize: 'w-12 h-12', barsStroke: 4 },
    xl: { height: 64, fontSize: 'text-5xl', badgeSize: 'w-16 h-16', barsStroke: 5 },
  }[size]

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Icon Badge */}
      <div className={`relative flex items-center justify-center rounded-2xl bg-[#141414] border border-[#2E2E2E] shadow-md shrink-0 ${dimensions.badgeSize}`}>
        <div className="flex flex-col gap-1 items-center justify-center w-full px-2">
          <div className="w-full h-1 bg-[#FF6A00] rounded-full" />
          <div className="w-full h-1 bg-white rounded-full" />
          <div className="w-full h-1 bg-[#FF6A00] rounded-full" />
        </div>
      </div>

      {/* Brand Text */}
      <div className="flex flex-col leading-none">
        <div className={`font-black tracking-widest text-white flex items-center ${dimensions.fontSize}`}>
          <span>BAR</span>
          <span className="text-[#FF6A00]">S</span>
        </div>
        {showSubtitle && (
          <span className="text-[9px] font-bold tracking-[0.25em] text-[#9E9E9E] uppercase mt-0.5">
            PACHAX
          </span>
        )}
      </div>
    </div>
  )
}
