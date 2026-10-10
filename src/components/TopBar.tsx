import { Archive, ChefHat, CreditCard, Menu, Package, Settings2, WalletCards, X, LogOut, User, Users } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { UserRole, View } from '../types'
import { BarsLogo } from './BarsLogo'

const items: Array<{ id: View; label: string; subtitle: string; icon: typeof CreditCard }> = [
  { id: 'caja', label: 'Punto de Venta', subtitle: 'POS y cobros', icon: CreditCard },
  { id: 'cocina', label: 'Cocina & Pedidos', subtitle: 'Despacho en vivo', icon: ChefHat },
  { id: 'historial', label: 'Ventas & Reportes', subtitle: 'Historial detallado', icon: Archive },
  { id: 'inventario', label: 'Inventario & Recetas', subtitle: 'Control de insumos', icon: Package },
  { id: 'clientes', label: 'Clientes', subtitle: 'Historial y ranking', icon: Users },
  { id: 'arqueo', label: 'Caja & Arqueo', subtitle: 'Turnos y efectivo', icon: WalletCards },
  { id: 'admin', label: 'Configuración', subtitle: 'Catálogo y sistema', icon: Settings2 },
]

export function TopBar({
  availableViews,
  collapsed,
  currentView,
  onChange,
  rightSlot,
  userName,
  userRole,
  onSignOut,
  pendingOrdersCount = 0,
}: {
  availableViews: View[]
  collapsed: boolean
  currentView: View
  onChange: (view: View) => void
  rightSlot?: ReactNode
  userName: string
  userRole: UserRole | 'demo'
  mode: 'firebase' | 'local'
  onSignOut: () => Promise<void>
  pendingOrdersCount?: number
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!mobileMenuOpen) return
    const oldOverflow = document.body.style.overflow
    const oldHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = oldOverflow
      document.documentElement.style.overflow = oldHtmlOverflow
    }
  }, [mobileMenuOpen])

  return (
    <aside
      className={`sticky top-3 z-50 flex flex-col rounded-3xl border border-[#262626] bg-[#121212]/95 p-3 shadow-card xl:h-full xl:sticky xl:top-3 xl:backdrop-blur ${
        collapsed ? 'xl:px-3 xl:py-4' : ''
      }`}
    >
      {/* Cabecera Móvil (sólo visible en pantallas pequeñas) */}
      <div className="relative z-[60] flex items-center justify-between xl:hidden">
        <BarsLogo size="sm" />

        <div className="flex items-center gap-2">
          {pendingOrdersCount > 0 && (
            <span className="flex h-6 items-center rounded-full bg-[#FF6A00] px-2 text-[11px] font-black text-white shadow-glow">
              {pendingOrdersCount}
            </span>
          )}
          <button
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#2E2E2E] bg-[#1C1C1E] text-[#9E9E9E] transition hover:border-[#FF6A00] hover:text-white"
            onClick={() => setMobileMenuOpen((open) => !open)}
            title={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen ? <button type="button" aria-label="Cerrar menú" className="fixed inset-0 z-40 bg-black/70 xl:hidden" onClick={() => setMobileMenuOpen(false)} /> : null}

      {/* En móvil se desplaza el menú, mientras la página queda inmóvil. */}
      <div className={`${mobileMenuOpen ? 'fixed inset-x-3 bottom-3 top-24 z-50 flex flex-col gap-4 overflow-y-auto overscroll-contain rounded-3xl border border-[#333] bg-[#121212] p-4 shadow-2xl touch-pan-y' : 'hidden'} xl:static xl:inset-auto xl:flex xl:flex-1 xl:flex-col xl:gap-4 xl:overflow-visible xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none`}>
        {/* Logo Desktop */}
        <div className={`hidden rounded-2xl border border-[#262626] bg-[#171717] xl:block ${collapsed ? 'p-2.5' : 'p-3.5'}`}>
          <BarsLogo size={collapsed ? 'sm' : 'md'} showSubtitle={!collapsed} />
          {!collapsed && (
            <p className="mt-2 text-[11px] leading-4 text-[#9E9E9E]">
              Sistema integral de gestión gastronómica.
            </p>
          )}
        </div>

        {/* Navegación */}
        <nav className="mt-3 space-y-1.5">
          {items.filter((item) => availableViews.includes(item.id)).map((item) => {
            const Icon = item.icon
            const isActive = currentView === item.id

            return (
              <button
                key={item.id}
                className={`flex w-full items-center rounded-2xl border text-left transition duration-150 ${
                  isActive
                    ? 'border-[#FF6A00]/40 bg-[#FF6A00] text-white shadow-glow'
                    : 'border-transparent bg-[#171717] text-[#9E9E9E] hover:border-[#333333] hover:bg-[#1E1E1E] hover:text-white'
                } ${collapsed ? 'justify-center gap-0 px-3 py-3' : 'gap-3 px-3.5 py-2.5'}`}
                onClick={() => {
                  onChange(item.id)
                  setMobileMenuOpen(false)
                }}
                title={item.label}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                    isActive ? 'bg-black/25 text-white' : 'bg-[#222222] text-[#FF6A00]'
                  }`}
                >
                  <Icon size={17} />
                </div>
                <div className={`min-w-0 flex-1 flex items-center justify-between ${collapsed ? 'hidden' : ''}`}>
                  <div>
                    <div className="text-sm font-bold tracking-tight">{item.label}</div>
                    <div className={`truncate text-[11px] ${isActive ? 'text-white/80' : 'text-[#777777]'}`}>{item.subtitle}</div>
                  </div>
                  {item.id === 'caja' && pendingOrdersCount > 0 ? (
                    <span className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-black/40 px-1.5 text-[10px] font-black text-white shadow-md shrink-0">
                      {pendingOrdersCount}
                    </span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </nav>

        {/* Slot derecho / extras */}
        {!collapsed ? <div className="mt-3 flex-1">{rightSlot}</div> : <div className="mt-4 flex-1" />}

        {/* Caja de usuario y sesión */}
        <div className={`rounded-2xl border border-[#262626] bg-[#171717] text-sm text-[#9E9E9E] ${collapsed ? 'p-2.5 text-center' : 'p-3'}`}>
          <div className="flex items-center gap-2 text-white">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#242424] text-[#FF6A00]">
              <User size={15} />
            </div>
            <span className={`min-w-0 break-all font-bold text-xs ${collapsed ? 'hidden' : ''}`}>{userName}</span>
          </div>
          {!collapsed && (
            <p className="mt-1.5 text-[11px] text-[#777777]">
              Rol: <span className="font-semibold text-[#CCCCCC] uppercase">{userRole}</span> · BARS PACHAX
            </p>
          )}
          <button
            className={`mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-[#333333] bg-[#202020] px-3 py-1.5 text-xs font-semibold text-[#FF6A00] hover:bg-[#2A2A2A] hover:text-white transition ${
              collapsed ? 'w-full' : 'w-full'
            }`}
            onClick={() => void onSignOut()}
          >
            <LogOut size={13} />
            {!collapsed ? 'Cerrar sesión' : ''}
          </button>
        </div>
      </div>
    </aside>
  )
}
