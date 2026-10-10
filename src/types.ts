export type CategoryId = string

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'ready_for_pickup' | 'ready_for_dispatch' | 'out_for_delivery' | 'delivered' | 'cancelled'
export type PaymentMethod = 'cash' | 'qr' | 'mixed'
export type OrderSource = 'local' | 'whatsapp'
export type FulfillmentType = 'table' | 'pickup' | 'delivery'
export type ProductAvailability = 'available' | 'soldout'
export type UserRole = 'admin' | 'operador' | 'caja' | 'cocina' | 'pedidos'

export type RepositoryConnectionMode = 'connected' | 'connecting' | 'local' | 'offline'

export interface RepositoryStatus {
  mode: RepositoryConnectionMode
  label: string
  detail: string
  source: 'firebase' | 'local'
  hasPendingWrites: boolean
  isOnline: boolean
}

export interface RestaurantMember {
  uid: string
  email: string
  displayName: string
  role: UserRole
  active: boolean
  createdAt?: string
}

export interface ProductExtra {
  id: string
  name: string
  price: number
}

export interface ProductOption {
  id: string
  label: string
}

export interface CatalogCategory {
  id: string
  name: string
  subtitle?: string
  emoji: string
  sortOrder: number
  isActive: boolean
  isVisible: boolean
}

export interface Product {
  id: string
  categoryId: CategoryId
  name: string
  description?: string
  price: number
  image: string
  badge?: string
  availability: ProductAvailability
  sortOrder: number
  isActive: boolean
  isVisible: boolean
  extras?: ProductExtra[]
  options?: ProductOption[]
}

export interface CatalogState {
  categories: CatalogCategory[]
  products: Product[]
  quickExtras?: ProductExtra[]
  lastUpdatedAt: number
}

export interface CatalogCategoryInput {
  name: string
  subtitle?: string
  emoji: string
}

export interface CatalogProductInput {
  categoryId: string
  name: string
  description?: string
  price: number
  image: string
  badge?: string
  extras?: ProductExtra[]
  options?: ProductOption[]
}

export interface CartItemModifier {
  extras: ProductExtra[]
  options: string[]
  note: string
}

export interface CartItem {
  lineId: string
  productId: string
  quantity: number
  modifiers: CartItemModifier
}

export interface PaymentSummary {
  method: PaymentMethod
  cashAmount: number
  qrAmount: number
  cashReceived: number
  change: number
  /**
   * Cuanto puso cada cuenta cuando el QR se pago entre varias personas. Solo existe si en caja se
   * eligio "QR multiple"; en un pago normal la clave ni se guarda.
   *
   * Es un detalle AGREGADO: `qrAmount` sigue siendo el total cobrado por QR y la suma de esta
   * lista tiene que darlo exacto, para que el cierre de caja y los reportes no cambien en nada.
   */
  qrCuentas?: number[]
}

export interface OrderItem {
  id: string
  /** Identificador estable del producto del catálogo, distinto al id de la línea del pedido. */
  productId?: string
  name: string
  basePrice: number
  quantity: number
  modifiers: CartItemModifier
  lineTotal: number
}

export interface Order {
  id: string
  sequence: number
  displayNumber: string
  createdAt: string
  readyAt?: string
  deliveredAt?: string
  cancelledAt?: string
  cancelledBy?: string
  cancelledReason?: string
  status: OrderStatus
  estimatedDelay?: number
  items: OrderItem[]
  total: number
  productSubtotal?: number
  deliveryFee?: number
  deliveryDistanceKm?: number | null
  deliveryQuoteStatus?: 'not_needed' | 'quoted' | 'missing_location' | 'manual_review'
  deliveryQuoteNote?: string
  payment: PaymentSummary
  paymentStatus: 'paid' | 'pending' | 'gift'
  paymentMethod: PaymentMethod | null
  expectedPaymentMethod: PaymentMethod | null
  qrProofReceived?: boolean
  paymentReviewNote?: string
  suppressWhatsappDispatchNotice?: boolean
  forceWhatsappDispatchNotice?: boolean
  paidAt?: string
  paidBy?: string
  orderSource: OrderSource
  fulfillmentType: FulfillmentType
  /** @deprecated Use fulfillmentType instead. Kept for backward compat reads. */
  orderType?: 'table' | 'delivery'
  tableInfo?: string
  customerName?: string
  customerPhone?: string
  customerId?: string
  deliveryAddress?: string
  createdBy?: string
  dayKey?: string
  /** Lo escribe el bot al crear el pedido. Si falta, el pedido se cargo a mano desde caja. */
  whatsappChatId?: string
}

export interface CreateOrderInput {
  items: OrderItem[]
  total: number
  payment: PaymentSummary
  paymentStatus: 'paid' | 'pending' | 'gift'
  paymentMethod: PaymentMethod | null
  expectedPaymentMethod: PaymentMethod | null
  orderSource: OrderSource
  fulfillmentType: FulfillmentType
  tableInfo?: string
  customerName?: string
  customerPhone?: string
  customerId?: string
  whatsappChatId?: string
  deliveryAddress?: string
  createdBy?: string
  suppressWhatsappDispatchNotice?: boolean
  forceWhatsappDispatchNotice?: boolean
}

export interface PlacedOrderResult {
  id: string
  sequence: number
  displayNumber: string
}

export interface ConfirmPaymentInput {
  paymentStatus: 'paid'
  paymentMethod: PaymentMethod
  payment: PaymentSummary
  paidBy: string
}

export interface AppState {
  orders: Order[]
  sequence: number
  lastUpdatedAt: number
}

export type View = 'caja' | 'cocina' | 'historial' | 'inventario' | 'clientes' | 'arqueo' | 'admin'

export interface BarsCustomer {
  id: string
  firstName: string
  lastName?: string
  phone: string
  normalizedPhone: string
  address?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export type UnitOfMeasure = 'u' | 'kg' | 'g' | 'l' | 'ml' | 'porcion'

export interface RawMaterial {
  id: string
  name: string
  unit: UnitOfMeasure
  currentStock: number
  minStock: number
  costPerUnit?: number
  category?: string
  updatedAt: string
}

export interface RecipeIngredient {
  rawMaterialId: string
  quantity: number
  /** Unidad en la que se expresa la receta; permite, por ejemplo, 180 g de un stock en kg. */
  unit?: UnitOfMeasure
  isOptional?: boolean
  modifierOption?: string
}

export interface ProductRecipe {
  productId: string
  ingredients: RecipeIngredient[]
}

export type StockMovementType = 'in' | 'out_sale' | 'adjustment' | 'waste'

export interface StockMovement {
  id: string
  rawMaterialId: string
  rawMaterialName: string
  type: StockMovementType
  quantity: number
  previousStock: number
  newStock: number
  reason: string
  orderId?: string
  timestamp: string
  createdBy: string
}

export interface CashExpense {
  id: string
  shiftId: string
  amount: number
  motive: string
  responsible: string
  timestamp: string
}

export interface CashShift {
  id: string
  openedAt: string
  openedBy: string
  initialCash: number
  branch?: string
  closedAt?: string
  closedBy?: string
  cashSales: number
  qrSales: number
  mixedSales: number
  cashIn: number
  expenses: number
  cashReturns: number
  expectedCash: number
  actualCash?: number
  difference?: number
  notes?: string
  status: 'open' | 'closed'
}

export interface PrinterConfig {
  enabled: boolean
  autoPrint: boolean
  paperWidth: '58mm' | '80mm'
  deviceAddress: string
  deviceName: string
  connectionType: 'bluetooth' | 'system'
}

