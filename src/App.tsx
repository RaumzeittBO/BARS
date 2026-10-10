import { AlertCircle, BellRing, Clock3, PackageCheck, Printer, Sparkles, WalletCards } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AdminView } from './components/AdminView'
import { CajaView } from './components/CajaView'
import { CocinaView } from './components/CocinaView'
import { HistorialView } from './components/HistorialView'
import { InventarioView } from './components/InventarioView'
import { ArqueoView } from './components/ArqueoView'
import { LoginView } from './components/LoginView'
import { TopBar } from './components/TopBar'
import { UnauthorizedView } from './components/UnauthorizedView'
import { PrinterSettingsModal } from './components/PrinterSettingsModal'
import { BarsUpdaterModal } from './components/BarsUpdaterModal'
import { formatCurrency } from './lib/format'
import { formatOrderNumber } from './lib/orderNumber'
import { getOrderProductTotal } from './lib/orderReports'
import { useAuthStore } from './store/authStore'
import { useCatalogStore } from './store/catalogStore'
import { useOrdersStore } from './store/appStore'
import { barsPrinterService } from './services/printer/barsPrinterService'
import { barsInventoryService } from './services/inventory/barsInventoryService'
import type { CartItem, Order, OrderStatus, PaymentMethod, PaymentSummary, Product, UserRole, View } from './types'

function getDayKey(value: string | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getAllowedViews(role: UserRole | 'demo'): View[] {
  if (role === 'admin' || role === 'demo') {
    return ['caja', 'cocina', 'historial', 'inventario', 'arqueo', 'admin']
  }

  if (role === 'operador') {
    return ['caja', 'cocina', 'inventario', 'arqueo', 'admin']
  }

  if (role === 'caja') {
    return ['caja', 'historial', 'arqueo']
  }

  if (role === 'pedidos') {
    return ['caja']
  }

  return ['cocina']
}

function MainShell({
  mode,
  role,
  userName,
  userId,
  onSignOut,
}: {
  mode: 'firebase' | 'local'
  role: UserRole | 'demo'
  userName: string
  userId: string
  onSignOut: () => Promise<void>
}) {
  const availableViews = getAllowedViews(role)
  const [selectedView, setSelectedView] = useState<View>(availableViews[0] ?? 'caja')
  const isSidebarCollapsed = false
  const view = availableViews.includes(selectedView) ? selectedView : availableViews[0]
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Modales globales de sistema (Impresora y Actualizador)
  const [showPrinterSettings, setShowPrinterSettings] = useState(false)
  const [showUpdaterModal, setShowUpdaterModal] = useState(false)

  const {
    state: { orders, sequence },
    placeOrder,
    setOrderStatus,
    cancelOrder,
    confirmPayment,
    updateOrder,
    deleteOrder,
  } = useOrdersStore()

  const {
    state: { categories, products, quickExtras },
    createCategory,
    updateCategory,
    setCategoryVisibility,
    setCategoryActive,
    deleteCategory,
    moveCategory,
    createProduct,
    updateProduct,
    setProductVisibility,
    setProductActive,
    setProductAvailability,
    deleteProduct,
    moveProduct,
    saveQuickExtras,
  } = useCatalogStore()

  const todayKey = useMemo(() => getDayKey(), [])
  const todayOrders = useMemo(() => orders.filter((order: Order) => getDayKey(order.createdAt) === todayKey), [orders, todayKey])
  const dailyTotal = useMemo(
    () =>
      todayOrders.reduce(
        (sum: number, order: Order) =>
          order.status !== 'cancelled' && order.paymentStatus === 'paid'
            ? sum + getOrderProductTotal(order)
            : sum,
        0
      ),
    [todayOrders]
  )
  const activeTodayCount = useMemo(() => todayOrders.filter((order: Order) => order.status !== 'cancelled').length, [todayOrders])
  const pendingCount = useMemo(() => todayOrders.filter((order: Order) => order.status === 'pending').length, [todayOrders])
  const nextOrderNumber = formatOrderNumber(sequence + 1)

  useEffect(() => {
    if (!confirmation) return
    const timeout = window.setTimeout(() => setConfirmation(null), 2800)
    return () => window.clearTimeout(timeout)
  }, [confirmation])

  useEffect(() => {
    if (!errorMessage) return
    const timeout = window.setTimeout(() => setErrorMessage(null), 4200)
    return () => window.clearTimeout(timeout)
  }, [errorMessage])

  const handleSubmitOrder = async (input: {
    cartItems: CartItem[]
    productsById: Map<string, Product>
    payment: PaymentSummary
    paymentStatus: 'paid' | 'pending' | 'gift'
    paymentMethod: PaymentMethod | null
    expectedPaymentMethod: PaymentMethod | null
    orderSource: 'local' | 'whatsapp'
    fulfillmentType: 'table' | 'pickup' | 'delivery'
    tableInfo?: string
    customerName?: string
    customerPhone?: string
    deliveryAddress?: string
    createdBy?: string
    estimatedDelay?: number
  }) => {
    try {
      const placedOrder = await placeOrder(input)
      await setOrderStatus(placedOrder.id, 'preparing', input.estimatedDelay ?? 10)

      // Reconstruir objeto de pedido para autoimpresión y descuento de inventario
      const fullOrder: Order = {
        id: placedOrder.id,
        sequence: placedOrder.sequence,
        displayNumber: placedOrder.displayNumber,
        createdAt: new Date().toISOString(),
        status: 'preparing',
        estimatedDelay: input.estimatedDelay ?? 10,
        items: input.cartItems.map((item) => {
          const product = input.productsById.get(item.productId)
          const extrasTotal = item.modifiers.extras.reduce((sum, extra) => sum + extra.price, 0)
          return {
            id: item.lineId,
            name: product?.name || 'Producto',
            basePrice: product?.price || 0,
            quantity: item.quantity,
            lineTotal: ((product?.price || 0) + extrasTotal) * item.quantity,
            modifiers: item.modifiers,
          }
        }),
        total: input.cartItems.reduce((sum, item) => {
          const product = input.productsById.get(item.productId)
          const extrasTotal = item.modifiers.extras.reduce((eSum, extra) => eSum + extra.price, 0)
          return sum + ((product?.price || 0) + extrasTotal) * item.quantity
        }, 0),
        payment: input.payment,
        paymentStatus: input.paymentStatus,
        paymentMethod: input.paymentMethod,
        expectedPaymentMethod: input.expectedPaymentMethod,
        orderSource: input.orderSource,
        fulfillmentType: input.fulfillmentType,
        tableInfo: input.tableInfo,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        deliveryAddress: input.deliveryAddress,
        createdBy: input.createdBy || userId,
      }

      // 1. IMPRESIÓN AUTOMÁTICA OBLIGATORIA (Sin diálogo de confirmación)
      void barsPrinterService.printOrderAutomatically(fullOrder).then((printRes) => {
        if (!printRes.success && !printRes.skipped) {
          console.warn('Fallo en impresión automática BARS:', printRes.error)
        }
      })

      // 2. DESCUENTO AUTOMÁTICO DE INVENTARIO Y RECETAS
      void barsInventoryService.deductStockForOrder(fullOrder, userName)

      setErrorMessage(null)
      setConfirmation(placedOrder.displayNumber)
      return placedOrder
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo registrar la venta.'
      setErrorMessage(message)
      return null
    }
  }

  const handleAdvanceStatus = async (
    orderId: string,
    nextStatus: OrderStatus,
    estimatedDelay?: number
  ) => {
    try {
      await setOrderStatus(orderId, nextStatus, estimatedDelay)
      setErrorMessage(null)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar el estado.'
      setErrorMessage(message)
      return false
    }
  }

  const handleCancelOrder = async (orderId: string, cancelledBy: string, reason?: string) => {
    try {
      const order = orders.find((o) => o.id === orderId)
      await cancelOrder(orderId, cancelledBy, reason)
      // Restaurar inventario en caso de cancelación
      if (order) {
        void barsInventoryService.restoreStockForOrder(order, cancelledBy)
      }
      setErrorMessage(null)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo anular el pedido.'
      setErrorMessage(message)
      return false
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0B0B] px-3 py-4 text-white md:px-5 xl:px-6">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_15%,_rgba(255,106,0,0.04),_transparent_40%),radial-gradient(circle_at_85%_85%,_rgba(255,106,0,0.02),_transparent_40%)]" />

      {mode === 'local' && (
        <div className="relative z-40 mx-auto mb-3 max-w-[1680px] rounded-2xl border border-amber-900/40 bg-amber-950/20 px-4 py-2.5 text-xs font-semibold text-amber-300">
          Modo Local / Demo activo · Almacenamiento independiente en BARS.
        </div>
      )}

      {confirmation && (
        <div className="pointer-events-none fixed right-5 top-5 z-50 w-[min(380px,calc(100vw-2.5rem))] rounded-3xl border border-[#FF6A00]/30 bg-[#161616]/95 p-4 shadow-2xl backdrop-blur animate-slide-in">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF6A00] text-white shadow-glow">
              <PackageCheck size={22} />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#FF6A00]">Venta Confirmada</div>
              <div className="mt-0.5 text-2xl font-black text-white">Pedido #{confirmation}</div>
              <p className="mt-0.5 text-xs text-[#9E9E9E]">Guardado y enviado automáticamente a despacho.</p>
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(440px,calc(100vw-2.5rem))] rounded-3xl border border-red-900/60 bg-[#1A1A1A]/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-950/40 text-red-400 border border-red-800">
              <AlertCircle size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Operación no realizada</div>
              <p className="mt-0.5 text-xs text-[#9E9E9E]">{errorMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Modales de Hardware y Sistema */}
      <PrinterSettingsModal isOpen={showPrinterSettings} onClose={() => setShowPrinterSettings(false)} />
      <BarsUpdaterModal isOpen={showUpdaterModal} onClose={() => setShowUpdaterModal(false)} />

      <div className={`relative grid max-w-none gap-4 ${isSidebarCollapsed ? 'xl:grid-cols-[82px_minmax(0,1fr)]' : 'xl:grid-cols-[240px_minmax(0,1fr)]'}`}>
        <TopBar
          availableViews={availableViews}
          collapsed={isSidebarCollapsed}
          currentView={view}
          mode={mode}
          onChange={setSelectedView}
          onSignOut={onSignOut}
          pendingOrdersCount={pendingCount}
          rightSlot={
            <div className="space-y-3">
              {/* Tarjeta de Ventas del Día */}
              {role !== 'pedidos' ? (
                <div className="rounded-2xl border border-[#262626] bg-[#161616] p-3.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9E9E9E]">
                    <WalletCards size={13} className="text-[#FF6A00]" />
                    Ventas de Hoy
                  </div>
                  <div className="mt-1 text-2xl font-black tracking-tight text-white">{formatCurrency(dailyTotal)}</div>
                  <div className="mt-0.5 text-[11px] text-[#777777]">
                    {activeTodayCount} ventas registradas
                  </div>
                </div>
              ) : null}

              {/* Accesos rápidos de Hardware y Sistema */}
              <div className="space-y-1.5">
                <button
                  onClick={() => setShowPrinterSettings(true)}
                  className="w-full flex items-center justify-between rounded-xl border border-[#262626] bg-[#161616] px-3 py-2 text-xs font-semibold text-[#CCCCCC] hover:border-[#FF6A00] hover:text-white transition"
                >
                  <span className="flex items-center gap-2">
                    <Printer size={14} className="text-[#FF6A00]" />
                    Impresora Térmica
                  </span>
                  <span className="text-[10px] text-[#777777]">Configurar</span>
                </button>

                <button
                  onClick={() => setShowUpdaterModal(true)}
                  className="w-full flex items-center justify-between rounded-xl border border-[#262626] bg-[#161616] px-3 py-2 text-xs font-semibold text-[#CCCCCC] hover:border-[#FF6A00] hover:text-white transition"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles size={14} className="text-[#FF6A00]" />
                    Actualizaciones
                  </span>
                  <span className="text-[10px] text-[#777777]">Buscar</span>
                </button>
              </div>

              {/* Indicadores compactos */}
              <div className="grid gap-2 grid-cols-2">
                <div className="rounded-xl border border-[#262626] bg-[#161616] p-2.5">
                  <div className="flex items-center gap-1.5 text-xs text-[#9E9E9E]">
                    <BellRing size={13} className="text-[#FF6A00]" />
                    <span>Activos</span>
                  </div>
                  <div className="mt-1 text-lg font-black text-white">{pendingCount}</div>
                </div>
                <div className="rounded-xl border border-[#262626] bg-[#161616] p-2.5">
                  <div className="flex items-center gap-1.5 text-xs text-[#9E9E9E]">
                    <Clock3 size={13} className="text-[#FF6A00]" />
                    <span>Próximo</span>
                  </div>
                  <div className="mt-1 text-lg font-black text-white font-mono">{nextOrderNumber}</div>
                </div>
              </div>
            </div>
          }
          userName={userName}
          userRole={role}
        />

        <main className="min-w-0 rounded-[1.75rem] border border-[#E6DCD2] bg-[#FFF9F4] p-3 text-[#201C19] shadow-card [color-scheme:light] md:p-5">
          {view === 'caja' ? (
            <CajaView
              categories={categories}
              nextOrderNumber={nextOrderNumber}
              onSubmitOrder={handleSubmitOrder}
              products={products}
              orders={orders}
              quickExtras={quickExtras ?? []}
              userRole={role}
              userId={userId}
              userName={userName}
              onConfirmPayment={confirmPayment}
              onCancelOrder={handleCancelOrder}
              onDeleteOrder={deleteOrder}
              onUpdateOrder={updateOrder}
              onSetOrderStatus={handleAdvanceStatus}
            />
          ) : null}

          {view === 'cocina' ? (
            <CocinaView orders={orders} onAdvanceStatus={handleAdvanceStatus} />
          ) : null}

          {view === 'historial' ? (
            <HistorialView
              onAdvanceStatus={handleAdvanceStatus}
              onDeleteOrder={deleteOrder}
              orders={orders}
              userName={userName}
              userRole={role}
            />
          ) : null}

          {view === 'inventario' ? (
            <InventarioView products={products} userName={userName} userRole={role} />
          ) : null}

          {view === 'arqueo' ? (
            <ArqueoView orders={orders} userName={userName} userRole={role} />
          ) : null}

          {view === 'admin' ? (
            <AdminView
              categories={categories}
              onCreateCategory={createCategory}
              onCreateProduct={createProduct}
              onDeleteCategory={deleteCategory}
              onDeleteProduct={deleteProduct}
              onMoveCategory={moveCategory}
              onMoveProduct={moveProduct}
              onSetCategoryActive={setCategoryActive}
              onSetCategoryVisibility={setCategoryVisibility}
              onSetProductActive={setProductActive}
              onSetProductAvailability={setProductAvailability}
              onSetProductVisibility={setProductVisibility}
              onUpdateCategory={updateCategory}
              onUpdateProduct={updateProduct}
              products={products}
              quickExtras={quickExtras ?? []}
              onSaveQuickExtras={saveQuickExtras}
            />
          ) : null}
        </main>
      </div>
    </div>
  )
}

function App() {
  const auth = useAuthStore()

  if (auth.mode === 'local') {
    return (
      <MainShell
        mode="local"
        onSignOut={auth.signOut}
        role={auth.role ?? 'admin'}
        userName={auth.userDisplayName ?? 'Administrador BARS'}
        userId={auth.member?.uid || `mock-${auth.role || 'admin'}`}
      />
    )
  }

  if (auth.status === 'loading' && auth.userEmail === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0B0B] text-sm font-semibold text-[#9E9E9E]">
        Validando credenciales BARS...
      </div>
    )
  }

  if (auth.status === 'signed_out') {
    return <LoginView error={auth.error} isLoading={false} onSubmit={auth.signIn} />
  }

  if (auth.status === 'authenticating' || auth.status === 'loading') {
    return <LoginView error={auth.error} isLoading={true} onSubmit={auth.signIn} />
  }

  if (auth.status === 'unauthorized') {
    return (
      <UnauthorizedView
        email={auth.userEmail}
        message={auth.error ?? 'Acceso no autorizado en BARS.'}
        onSignOut={auth.signOut}
      />
    )
  }

  return (
    <MainShell
      mode="firebase"
      onSignOut={auth.signOut}
      role={auth.role ?? 'caja'}
      userName={auth.userDisplayName ?? auth.userEmail ?? 'Usuario'}
      userId={auth.member?.uid ?? ''}
    />
  )
}

export default App
