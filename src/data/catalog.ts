import type { CatalogCategory, CatalogState, Product, ProductExtra } from '../types'

// Carta BARS recibida el 9 de octubre de 2026. Cada importe es un SKU propio.
export const demoCategories: CatalogCategory[] = [
  { id: 'hamburguesas', name: 'Hamburguesas', subtitle: 'Solo, con papas o en combo', emoji: '🍔', sortOrder: 0, isActive: true, isVisible: true },
  { id: 'sandwiches', name: 'Sándwiches', subtitle: 'Sándwich de pollo', emoji: '🥪', sortOrder: 1, isActive: true, isVisible: true },
  { id: 'fries', name: 'Papas', subtitle: 'Papas y acompañamientos', emoji: '🍟', sortOrder: 2, isActive: true, isVisible: true },
  { id: 'bebidas', name: 'Bebidas', subtitle: 'Gaseosas, jugos y agua', emoji: '🥤', sortOrder: 3, isActive: true, isVisible: true },
  { id: 'extras', name: 'Extras', subtitle: 'Agregados para el pedido', emoji: '➕', sortOrder: 4, isActive: true, isVisible: true },
  { id: 'postres', name: 'Postres', subtitle: 'Dulces BARS', emoji: '🍰', sortOrder: 5, isActive: true, isVisible: true },
]

export const demoQuickExtras: ProductExtra[] = [
  { id: 'carne-m', name: 'Carne M', price: 9 },
  { id: 'carne-g', name: 'Carne G', price: 13 },
  { id: 'tocino', name: 'Tocino', price: 7 },
  { id: 'topping', name: 'Topping', price: 5 },
]

type MenuSize = { label: 'M' | 'G'; prices: [number, number, number] }
type BurgerSpec = { id: string; name: string; sizes: MenuSize[]; categoryId?: string }

const burgers: BurgerSpec[] = [
  { id: 'clasica', name: 'Clásica', sizes: [{ label: 'M', prices: [22, 29, 35] }, { label: 'G', prices: [33, 42, 49] }] },
  { id: 'napo-grill', name: 'Napo Grill', sizes: [{ label: 'M', prices: [22, 29, 35] }, { label: 'G', prices: [33, 43, 49] }] },
  { id: 'cheese-n-bacon', name: "Cheese N'Bacon", sizes: [{ label: 'M', prices: [26, 33, 39] }, { label: 'G', prices: [37, 46, 53] }] },
  { id: 'heart-attack', name: 'Heart Attack', sizes: [{ label: 'G', prices: [36, 45, 53] }] },
  { id: 'hawaiian-kick', name: 'Hawaiian Kick', sizes: [{ label: 'G', prices: [34, 43, 50] }] },
  { id: 'bars-king', name: 'BARS King', sizes: [{ label: 'G', prices: [35, 44, 51] }] },
  { id: 'btl', name: 'BTL', sizes: [{ label: 'G', prices: [34, 43, 50] }] },
  { id: 'bbq-burger', name: 'BBQ Burger', sizes: [{ label: 'M', prices: [23, 30, 34] }] },
  { id: 'cheese-burger', name: 'Cheese Burger', sizes: [{ label: 'M', prices: [23, 30, 34] }] },
  { id: 'chicken-sandwich', name: 'Chicken Sandwich', categoryId: 'sandwiches', sizes: [{ label: 'G', prices: [28, 37, 42] }] },
]

const presentations = [
  { id: 'solo', label: 'Solo' },
  { id: 'papas', label: 'Con papas' },
  { id: 'combo', label: 'Combo' },
] as const

function menuProduct(id: string, categoryId: string, name: string, price: number, image: string, sortOrder: number, description = ''): Product {
  return { id, categoryId, name, description, price, image, availability: 'available', sortOrder, isActive: true, isVisible: true }
}

const burgerProducts: Product[] = burgers.flatMap((burger, burgerIndex) =>
  burger.sizes.flatMap((size, sizeIndex) =>
    presentations.map((presentation, presentationIndex) => ({
      ...menuProduct(
        `${burger.id}-${size.label.toLowerCase()}-${presentation.id}`,
        burger.categoryId ?? 'hamburguesas',
        `${burger.name} ${size.label} · ${presentation.label}`,
        size.prices[presentationIndex],
        burger.categoryId === 'sandwiches' ? '🥪' : '🍔',
        burgerIndex * 6 + sizeIndex * 3 + presentationIndex,
        `Preparación ${burger.name} según la carta BARS. ${presentation.id === 'combo' ? 'Incluye papas y bebida; indicar bebida en la nota del pedido.' : presentation.id === 'papas' ? 'Incluye papas fritas.' : 'Solo producto.'}`,
      ),
      badge: `${size.label} · ${presentation.label}`,
      extras: demoQuickExtras,
    })),
  ),
)

export const demoProducts: Product[] = [
  ...burgerProducts,
  menuProduct('wild-style', 'fries', 'Wild Style', 28, '🍟', 0),
  menuProduct('wild-style-carnivora', 'fries', 'Wild Style Carnívora', 39, '🍟', 1),
  menuProduct('cheese-n-jam', 'fries', "Cheese N' Jam", 25, '🍟', 2),
  menuProduct('porcion-papas-12', 'fries', 'Porción de papas · Bs 12', 12, '🍟', 3),
  menuProduct('porcion-papas-20', 'fries', 'Porción de papas · Bs 20', 20, '🍟', 4),
  menuProduct('gaseosa-o-jugo-500', 'bebidas', 'Gaseosa o jugo 500 ml', 10, '🥤', 0, 'Indicar el sabor en la nota del pedido.'),
  menuProduct('cerveza-huari', 'bebidas', 'Cerveza Huari', 15, '🍺', 1),
  menuProduct('agua', 'bebidas', 'Agua', 9, '💧', 2),
  menuProduct('extra-carne-m', 'extras', 'Carne M', 9, '🥩', 0),
  menuProduct('extra-carne-g', 'extras', 'Carne G', 13, '🥩', 1),
  menuProduct('extra-tocino', 'extras', 'Tocino', 7, '🥓', 2),
  menuProduct('extra-topping', 'extras', 'Topping', 5, '➕', 3),
  menuProduct('brownie-con-chips', 'postres', 'Brownie con chips', 19, '🍫', 0),
  menuProduct('apple-pie', 'postres', 'Apple Pie', 19, '🥧', 1),
]

export function buildDemoCatalogState(): CatalogState {
  return { categories: demoCategories, products: demoProducts, quickExtras: demoQuickExtras, lastUpdatedAt: Date.now() }
}
