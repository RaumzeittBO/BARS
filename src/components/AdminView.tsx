import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Power, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '../lib/format'
import { createRestaurantMember, deleteRestaurantMemberAccess, listRestaurantMembers, sendRestaurantMemberPasswordReset, updateRestaurantMember } from '../lib/firebase'
import type { CatalogCategory, CatalogCategoryInput, CatalogProductInput, Product, ProductExtra, ProductOption, RestaurantMember, UserRole } from '../types'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { ResetSalesPanel } from './ResetSalesPanel'
import { Button } from './ui/Button'
import { Panel } from './ui/Panel'

function isImageUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')
}

function parseExtras(raw: string): ProductExtra[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [name, priceRaw] = line.split('|').map((segment) => segment.trim())
      return {
        id: crypto.randomUUID() + index,
        name,
        price: Number(priceRaw ?? 0) || 0,
      }
    })
}

function parseOptions(raw: string): ProductOption[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label, index) => ({
      id: `${label}-${index}`,
      label,
    }))
}

function extrasToText(extras?: ProductExtra[]) {
  return (extras ?? []).map((extra) => `${extra.name}|${extra.price}`).join('\n')
}

function optionsToText(options?: ProductOption[]) {
  return (options ?? []).map((option) => option.label).join('\n')
}

function emptyCategoryForm(): CatalogCategoryInput {
  return { name: '', subtitle: '', emoji: 'TAG' }
}

function emptyProductForm(categoryId = '') {
  return {
    categoryId,
    name: '',
    description: '',
    price: '',
    image: '🍔',
    badge: '',
    extrasText: '',
    optionsText: '',
  }
}

export function AdminView({
  categories,
  products,
  quickExtras,
  onSaveQuickExtras,
  onCreateCategory,
  onUpdateCategory,
  onSetCategoryVisibility,
  onSetCategoryActive,
  onDeleteCategory,
  onMoveCategory,
  onCreateProduct,
  onUpdateProduct,
  onSetProductVisibility,
  onSetProductActive,
  onSetProductAvailability,
  onDeleteProduct,
  onMoveProduct,
}: {
  categories: CatalogCategory[]
  products: Product[]
  quickExtras: ProductExtra[]
  onSaveQuickExtras: (list: ProductExtra[]) => Promise<void>
  onCreateCategory: (input: CatalogCategoryInput) => Promise<void>
  onUpdateCategory: (categoryId: string, updates: Partial<CatalogCategoryInput>) => Promise<void>
  onSetCategoryVisibility: (categoryId: string, isVisible: boolean) => Promise<void>
  onSetCategoryActive: (categoryId: string, isActive: boolean) => Promise<void>
  onDeleteCategory: (categoryId: string) => Promise<void>
  onMoveCategory: (categoryId: string, direction: 'up' | 'down') => Promise<void>
  onCreateProduct: (input: CatalogProductInput) => Promise<void>
  onUpdateProduct: (productId: string, updates: Partial<CatalogProductInput>) => Promise<void>
  onSetProductVisibility: (productId: string, isVisible: boolean) => Promise<void>
  onSetProductActive: (productId: string, isActive: boolean) => Promise<void>
  onSetProductAvailability: (productId: string, availability: Product['availability']) => Promise<void>
  onDeleteProduct: (productId: string) => Promise<void>
  onMoveProduct: (productId: string, direction: 'up' | 'down') => Promise<void>
}) {
  if (false as boolean) {
    console.log(onSetProductActive)
  }

  const orderedCategories = useMemo(() => [...categories].sort((left, right) => left.sortOrder - right.sortOrder), [categories])
  const orderedProducts = useMemo(() => [...products].sort((left, right) => left.sortOrder - right.sortOrder), [products])
  const [categoryForm, setCategoryForm] = useState<CatalogCategoryInput>(emptyCategoryForm())
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [productForm, setProductForm] = useState(() => emptyProductForm(orderedCategories[0]?.id ?? ''))
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  
  // Estados para pestañas y formularios
  const [activeAdminTab, setActiveAdminTab] = useState<'products' | 'categories' | 'users' | 'quick_extras'>('products')
  const [members, setMembers] = useState<RestaurantMember[]>([])
  const [memberForm, setMemberForm] = useState({ email: '', password: '', displayName: '', role: 'caja' as UserRole })
  const [memberNotice, setMemberNotice] = useState('')
  const [showProductForm, setShowProductForm] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)

  useEffect(() => {
    if (!productForm.categoryId && orderedCategories.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProductForm((current) => ({
        ...current,
        categoryId: orderedCategories[0].id,
      }))
    }
  }, [orderedCategories, productForm.categoryId])
  const [confirmState, setConfirmState] = useState<null | {
    title: string
    body: string
    confirmLabel: string
    tone?: 'primary' | 'success'
    onConfirm: () => Promise<void>
  }>(null)

  const groupedProducts = orderedCategories.map((category) => ({
    category,
    products: orderedProducts.filter((product) => product.categoryId === category.id),
  }))

  const resetCategoryForm = () => {
    setCategoryForm(emptyCategoryForm())
    setEditingCategoryId(null)
  }

  const resetProductForm = () => {
    setProductForm(emptyProductForm(orderedCategories[0]?.id ?? ''))
    setEditingProductId(null)
  }

  const openConfirm = (config: NonNullable<typeof confirmState>) => setConfirmState(config)
  const refreshMembers = async () => {
    try {
      setMembers(await listRestaurantMembers())
    } catch {
      setMembers([])
    }
  }

  useEffect(() => {
    if (activeAdminTab === 'users') void refreshMembers()
  }, [activeAdminTab])

  return (
    <section className="space-y-5">
      <Panel className="border-white/80 bg-white/70 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">Administracion</p>
            <h2 className="mt-2 font-serif text-4xl text-ink">Catálogo BARS</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
              Crea, ordena, oculta y reactiva categorías o productos. Los cambios se reflejan en el Punto de Venta y Cocina.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-[#f1caca] bg-white p-4 shadow-card">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Resumen</div>
            <div className="mt-2 text-lg font-semibold text-ink">{products.length} productos</div>
            <div className="mt-1 text-sm text-muted">{categories.length} categorias en el menu.</div>
          </div>
        </div>
      </Panel>      {/* Selector de Pestañas de Administración */}
      <div className="flex gap-2 bg-white/60 p-1.5 rounded-2xl border border-white/80 shadow-insetSoft max-w-2xl">
        <button
          type="button"
          className={`flex-1 py-2.5 rounded-xl text-xs font-black tracking-wider transition ${
            activeAdminTab === 'products'
              ? 'bg-ink text-white shadow-card'
              : 'text-muted hover:text-ink'
          }`}
          onClick={() => {
            setActiveAdminTab('products')
            resetProductForm()
            setShowProductForm(false)
          }}
        >
          PRODUCTOS
        </button>
        <button
          type="button"
          className={`flex-1 py-2.5 rounded-xl text-xs font-black tracking-wider transition ${
            activeAdminTab === 'categories'
              ? 'bg-ink text-white shadow-card'
              : 'text-muted hover:text-ink'
          }`}
          onClick={() => {
            setActiveAdminTab('categories')
            resetCategoryForm()
            setShowCategoryForm(false)
          }}
        >
          CATEGORÍAS
        </button>
        <button
          type="button"
          className={`flex-1 py-2.5 rounded-xl text-xs font-black tracking-wider transition ${
            activeAdminTab === 'quick_extras'
              ? 'bg-ink text-white shadow-card'
              : 'text-muted hover:text-ink'
          }`}
          onClick={() => {
            setActiveAdminTab('quick_extras')
          }}
        >
          EXTRAS RÁPIDOS
        </button>
      </div>

      <button
        type="button"
        className={`rounded-2xl border px-4 py-2 text-xs font-black tracking-wider transition ${
          activeAdminTab === 'users'
            ? 'border-ink bg-ink text-white'
            : 'border-line bg-white/70 text-muted hover:text-ink'
        }`}
        onClick={() => setActiveAdminTab('users')}
      >
        USUARIOS
      </button>

      {activeAdminTab === 'users' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
          <Panel className="bg-white p-5 border border-line rounded-2xl space-y-4 shadow-sm">
            <div>
              <h3 className="text-lg font-bold text-ink">Crear usuario</h3>
              <p className="text-xs text-muted">Crea accesos para caja, cocina, pedidos, operador o administracion.</p>
            </div>
            <div className="grid gap-3">
              <input className="rounded-xl border border-line bg-canvas/30 px-3 py-2 text-sm outline-none focus:border-accent" placeholder="Email" value={memberForm.email} onChange={(event) => setMemberForm((curr) => ({ ...curr, email: event.target.value }))} />
              <input className="rounded-xl border border-line bg-canvas/30 px-3 py-2 text-sm outline-none focus:border-accent" placeholder="Nombre visible" value={memberForm.displayName} onChange={(event) => setMemberForm((curr) => ({ ...curr, displayName: event.target.value }))} />
              <input className="rounded-xl border border-line bg-canvas/30 px-3 py-2 text-sm outline-none focus:border-accent" placeholder="Contrasena temporal" type="password" value={memberForm.password} onChange={(event) => setMemberForm((curr) => ({ ...curr, password: event.target.value }))} />
              <select className="rounded-xl border border-line bg-canvas/30 px-3 py-2 text-sm outline-none focus:border-accent" value={memberForm.role} onChange={(event) => setMemberForm((curr) => ({ ...curr, role: event.target.value as UserRole }))}>
                <option value="caja">Caja</option>
                <option value="cocina">Cocina</option>
                <option value="pedidos">Pedidos</option>
                <option value="operador">Operador</option>
                <option value="admin">Administracion</option>
              </select>
            </div>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  setMemberNotice('')
                  await createRestaurantMember(memberForm)
                  setMemberForm({ email: '', password: '', displayName: '', role: 'caja' })
                  setMemberNotice('Usuario creado correctamente.')
                  await refreshMembers()
                } catch (error) {
                  setMemberNotice(error instanceof Error ? error.message : 'No se pudo crear el usuario.')
                }
              }}
            >
              <Plus size={14} />
              Crear usuario
            </Button>
            {memberNotice ? <div className="text-xs font-semibold text-success">{memberNotice}</div> : null}
          </Panel>

          <Panel className="bg-white p-5 border border-line rounded-2xl space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-ink">Usuarios</h3>
              <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-bold text-ink" onClick={() => void refreshMembers()}>
                <Users size={14} />
                Actualizar
              </button>
            </div>
            <div className="divide-y divide-line">
              {members.map((member) => (
                <div key={member.uid} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink">{member.displayName}</div>
                    <div className="break-all text-xs text-muted">{member.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select className="rounded-xl border border-line bg-canvas/30 px-2 py-2 text-xs font-semibold" value={member.role} onChange={async (event) => {
                      await updateRestaurantMember(member.uid, { role: event.target.value as UserRole })
                      await refreshMembers()
                    }}>
                      <option value="caja">Caja</option>
                      <option value="cocina">Cocina</option>
                      <option value="pedidos">Pedidos</option>
                      <option value="operador">Operador</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button type="button" className={`rounded-xl px-3 py-2 text-xs font-bold ${member.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`} onClick={async () => {
                      await updateRestaurantMember(member.uid, { active: !member.active })
                      await refreshMembers()
                    }}>
                      {member.active ? 'Activo' : 'Inactivo'}
                    </button>
                    <button type="button" className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700" onClick={async () => {
                      await sendRestaurantMemberPasswordReset(member.email)
                      setMemberNotice(`Se envio un enlace de contrasena a ${member.email}.`)
                    }}>
                      Contrasena
                    </button>
                    <button type="button" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700" onClick={async () => {
                      if (!window.confirm(`Quitar acceso a ${member.email}?`)) return
                      await deleteRestaurantMemberAccess(member.uid)
                      setMemberNotice('Acceso eliminado del restaurante.')
                      await refreshMembers()
                    }}>
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* Borrado de ventas: va en la pestaña de usuarios, que es la de administracion pura y
          solo la ve el admin. */}
      {activeAdminTab === 'users' && <ResetSalesPanel />}

      {/* PESTAÑA: PRODUCTOS */}
      {activeAdminTab === 'products' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-bold text-ink">Catálogo de Productos</h3>
              <p className="text-xs text-muted">Añade, edita, ordena y cambia la disponibilidad del menú.</p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                resetProductForm()
                setShowProductForm(!showProductForm)
              }}
            >
              <Plus size={14} />
              {showProductForm ? 'Cerrar Formulario' : 'Nuevo Producto'}
            </Button>
          </div>

          {/* Formulario de Producto (Crear / Editar) */}
          {(showProductForm || editingProductId) && (
            <Panel className="bg-white p-5 border border-line rounded-2xl max-w-2xl space-y-4 shadow-sm animate-fadeIn">
              <h4 className="text-sm font-black text-ink uppercase tracking-wider">
                {editingProductId ? 'Editar Producto' : 'Crear Nuevo Producto'}
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] font-black uppercase text-muted tracking-wider">Nombre</span>
                  <input
                    className="mt-1 w-full rounded-xl border border-line bg-canvas/30 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                    placeholder="Ej. Classic Cheese"
                    value={productForm.name}
                    onChange={(event) => setProductForm((curr) => ({ ...curr, name: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase text-muted tracking-wider">Precio (Bs)</span>
                  <input
                    className="mt-1 w-full rounded-xl border border-line bg-canvas/30 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                    placeholder="Ej. 45"
                    value={productForm.price}
                    onChange={(event) => setProductForm((curr) => ({ ...curr, price: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase text-muted tracking-wider">Categoría</span>
                  <select
                    className="mt-1 w-full rounded-xl border border-line bg-canvas/30 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                    value={productForm.categoryId}
                    onChange={(event) => setProductForm((curr) => ({ ...curr, categoryId: event.target.value }))}
                  >
                    {orderedCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase text-muted tracking-wider">Visual (Emoji o Imagen URL)</span>
                  <input
                    className="mt-1 w-full rounded-xl border border-line bg-canvas/30 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                    placeholder="Ej. 🍔 o http://..."
                    value={productForm.image}
                    onChange={(event) => setProductForm((curr) => ({ ...curr, image: event.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[10px] font-black uppercase text-muted tracking-wider">Descripción Corta</span>
                  <input
                    className="mt-1 w-full rounded-xl border border-line bg-canvas/30 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                    placeholder="Ej. Doble carne, doble queso cheddar fundido"
                    value={productForm.description}
                    onChange={(event) => setProductForm((curr) => ({ ...curr, description: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase text-muted tracking-wider">Etiqueta (Badge - Opcional)</span>
                  <input
                    className="mt-1 w-full rounded-xl border border-line bg-canvas/30 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                    placeholder="Ej. Recomendado, Hot"
                    value={productForm.badge}
                    onChange={(event) => setProductForm((curr) => ({ ...curr, badge: event.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[10px] font-black uppercase text-muted tracking-wider">Ingredientes Adicionales / Extras (Uno por línea)</span>
                  <textarea
                    className="mt-1 w-full min-h-16 rounded-xl border border-line bg-canvas/30 px-3 py-2 text-xs text-ink outline-none focus:border-accent font-mono"
                    placeholder="Formato: Nombre|Precio (ej: Bacon|5 o Queso Cheddar|3)"
                    value={productForm.extrasText}
                    onChange={(event) => setProductForm((curr) => ({ ...curr, extrasText: event.target.value }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[10px] font-black uppercase text-muted tracking-wider">Opciones de Preparación / Modificadores (Uno por línea)</span>
                  <textarea
                    className="mt-1 w-full min-h-16 rounded-xl border border-line bg-canvas/30 px-3 py-2 text-xs text-ink outline-none focus:border-accent font-mono"
                    placeholder="Formato: Nombre opción (ej: Sin Cebolla o Té de Limón)"
                    value={productForm.optionsText}
                    onChange={(event) => setProductForm((curr) => ({ ...curr, optionsText: event.target.value }))}
                  />
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!productForm.name.trim() || !productForm.price.trim()) return

                    const payload = {
                      categoryId: productForm.categoryId,
                      name: productForm.name.trim(),
                      description: productForm.description.trim(),
                      price: Number(productForm.price) || 0,
                      image: productForm.image || '🍔',
                      badge: productForm.badge,
                      extras: parseExtras(productForm.extrasText),
                      options: parseOptions(productForm.optionsText),
                    }

                    if (editingProductId) {
                      await onUpdateProduct(editingProductId, payload)
                    } else {
                      await onCreateProduct(payload)
                    }

                    resetProductForm()
                    setShowProductForm(false)
                  }}
                >
                  {editingProductId ? 'Guardar Cambios' : 'Crear Producto'}
                </Button>
                <Button
                  size="sm"
                  tone="secondary"
                  onClick={() => {
                    resetProductForm()
                    setShowProductForm(false)
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </Panel>
          )}

          {/* Listado de Productos agrupados por Categoría */}
          <div className="space-y-4">
            {groupedProducts.map(({ category, products: groupProducts }) => (
              <div key={category.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm space-y-3">
                <div className="flex justify-between items-center border-b border-line pb-2">
                  <span className="text-sm font-black text-ink">{category.emoji} {category.name.toUpperCase()}</span>
                  <span className="text-[10px] text-muted font-bold bg-panel px-2 py-0.5 rounded">{groupProducts.length} productos</span>
                </div>

                <div className="divide-y divide-line">
                  {groupProducts.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted font-medium">No hay productos en esta categoría.</div>
                  ) : (
                    groupProducts.map((product) => (
                      <div key={product.id} className="py-3 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                        <div className="flex items-center gap-3">
                          {isImageUrl(product.image) ? (
                            <img alt={product.name} className="h-11 w-11 rounded-lg object-cover shrink-0" src={product.image} />
                          ) : (
                            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accentWash text-xl shrink-0">{product.image}</div>
                          )}
                          <div>
                            <div className="text-xs font-bold text-ink">{product.name}</div>
                            <div className="text-[10px] text-muted line-clamp-1">{product.description || 'Sin descripción'}</div>
                            <div className="text-xs font-black text-amber-500 mt-0.5">{formatCurrency(product.price)}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 ml-auto">
                          <button
                            type="button"
                            className="p-1.5 border border-line rounded-lg text-muted hover:text-ink transition hover:bg-panel"
                            onClick={() => onMoveProduct(product.id, 'up')}
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            type="button"
                            className="p-1.5 border border-line rounded-lg text-muted hover:text-ink transition hover:bg-panel"
                            onClick={() => onMoveProduct(product.id, 'down')}
                          >
                            <ArrowDown size={12} />
                          </button>
                          <button
                            type="button"
                            className="p-1.5 border border-line rounded-lg text-muted hover:text-ink transition hover:bg-panel"
                            onClick={() => {
                              setEditingProductId(product.id)
                              setProductForm({
                                categoryId: product.categoryId,
                                name: product.name,
                                description: product.description ?? '',
                                price: String(product.price),
                                image: product.image,
                                badge: product.badge ?? '',
                                extrasText: extrasToText(product.extras),
                                optionsText: optionsToText(product.options),
                              })
                              setShowProductForm(true)
                            }}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            className="p-1.5 border border-line rounded-lg text-muted hover:text-ink transition hover:bg-panel"
                            onClick={() => onSetProductVisibility(product.id, !product.isVisible)}
                          >
                            {product.isVisible ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button
                            type="button"
                            className={`p-1.5 border rounded-lg transition ${
                              product.availability === 'soldout'
                                ? 'bg-red-50 border-red-200 text-red-600'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                            }`}
                            onClick={() =>
                              openConfirm({
                                title: product.availability === 'soldout' ? 'Marcar disponible' : 'Marcar agotado',
                                body: `El producto ${product.name} cambiará su disponibilidad inmediata.`,
                                confirmLabel: product.availability === 'soldout' ? 'Habilitar' : 'Agotar',
                                onConfirm: () => onSetProductAvailability(product.id, product.availability === 'soldout' ? 'available' : 'soldout'),
                              })
                            }
                          >
                            <Power size={12} />
                          </button>
                          <button
                            type="button"
                            className="p-1.5 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg transition"
                            onClick={() =>
                              openConfirm({
                                title: 'Eliminar producto',
                                body: `¿Está seguro de eliminar ${product.name}?`,
                                confirmLabel: 'Eliminar',
                                onConfirm: () => onDeleteProduct(product.id),
                              })
                            }
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PESTAÑA: CATEGORÍAS */}
      {activeAdminTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-bold text-ink">Categorías de Menú</h3>
              <p className="text-xs text-muted">Añade, edita, ordena y controla la visualización de las categorías.</p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                resetCategoryForm()
                setShowCategoryForm(!showCategoryForm)
              }}
            >
              <Plus size={14} />
              {showCategoryForm ? 'Cerrar Formulario' : 'Nueva Categoría'}
            </Button>
          </div>

          {/* Formulario de Categoría */}
          {(showCategoryForm || editingCategoryId) && (
            <Panel className="bg-white p-5 border border-line rounded-2xl max-w-md space-y-4 shadow-sm animate-fadeIn">
              <h4 className="text-sm font-black text-ink uppercase tracking-wider">
                {editingCategoryId ? 'Editar Categoría' : 'Crear Nueva Categoría'}
              </h4>
              <div className="grid gap-3">
                <label className="block">
                  <span className="text-[10px] font-black uppercase text-muted tracking-wider">Nombre</span>
                  <input
                    className="mt-1 w-full rounded-xl border border-line bg-canvas/30 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                    placeholder="Ej. Raza Brangus"
                    value={categoryForm.name}
                    onChange={(event) => setCategoryForm((curr) => ({ ...curr, name: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase text-muted tracking-wider">Subtítulo</span>
                  <input
                    className="mt-1 w-full rounded-xl border border-line bg-canvas/30 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                    placeholder="Ej. Hamburguesas premium de raza"
                    value={categoryForm.subtitle}
                    onChange={(event) => setCategoryForm((curr) => ({ ...curr, subtitle: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase text-muted tracking-wider">Emoji o Clave de Icono</span>
                  <input
                    className="mt-1 w-full rounded-xl border border-line bg-canvas/30 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                    placeholder="Ej. 🍔"
                    value={categoryForm.emoji}
                    onChange={(event) => setCategoryForm((curr) => ({ ...curr, emoji: event.target.value || 'TAG' }))}
                  />
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!categoryForm.name.trim()) return

                    if (editingCategoryId) {
                      await onUpdateCategory(editingCategoryId, categoryForm)
                    } else {
                      await onCreateCategory(categoryForm)
                    }

                    resetCategoryForm()
                    setShowCategoryForm(false)
                  }}
                >
                  {editingCategoryId ? 'Guardar Cambios' : 'Crear Categoría'}
                </Button>
                <Button
                  size="sm"
                  tone="secondary"
                  onClick={() => {
                    resetCategoryForm()
                    setShowCategoryForm(false)
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </Panel>
          )}

          {/* Listado de Categorías */}
          <div className="space-y-3">
            {orderedCategories.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line p-8 text-center text-xs text-muted font-semibold bg-white/40">
                No hay categorías de menú creadas.
              </div>
            ) : (
              orderedCategories.map((category) => (
                <div key={category.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accentWash text-xl shrink-0">
                      {category.emoji}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-ink">{category.name}</div>
                      <div className="text-[10px] text-muted">{category.subtitle || 'Sin subtítulo'}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      type="button"
                      className="p-1.5 border border-line rounded-lg text-muted hover:text-ink transition hover:bg-panel"
                      onClick={() => onMoveCategory(category.id, 'up')}
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 border border-line rounded-lg text-muted hover:text-ink transition hover:bg-panel"
                      onClick={() => onMoveCategory(category.id, 'down')}
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 border border-line rounded-lg text-muted hover:text-ink transition hover:bg-panel"
                      onClick={() => {
                        setEditingCategoryId(category.id)
                        setCategoryForm({
                          name: category.name,
                          subtitle: category.subtitle ?? '',
                          emoji: category.emoji,
                        })
                        setShowCategoryForm(true)
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 border border-line rounded-lg text-muted hover:text-ink transition hover:bg-panel"
                      onClick={() => onSetCategoryVisibility(category.id, !category.isVisible)}
                    >
                      {category.isVisible ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button
                      type="button"
                      className={`p-1.5 border rounded-lg transition ${
                        category.isActive
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                          : 'bg-red-50 border-red-200 text-red-600'
                      }`}
                      onClick={() =>
                        openConfirm({
                          title: category.isActive ? 'Desactivar categoría' : 'Activar categoría',
                          body: `La categoría ${category.name} cambiará su estado operativo.`,
                          confirmLabel: category.isActive ? 'Desactivar' : 'Activar',
                          onConfirm: () => onSetCategoryActive(category.id, !category.isActive),
                        })
                      }
                    >
                      <Power size={12} />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg transition"
                      onClick={() =>
                        openConfirm({
                          title: 'Eliminar categoría',
                          body: `Se eliminará ${category.name} junto con sus productos asociados.`,
                          confirmLabel: 'Eliminar',
                          onConfirm: () => onDeleteCategory(category.id),
                        })
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeAdminTab === 'quick_extras' && (
        <QuickExtrasConfig
          quickExtras={quickExtras}
          onSaveQuickExtras={onSaveQuickExtras}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title ?? ''}
        body={confirmState?.body ?? ''}
        confirmLabel={confirmState?.confirmLabel ?? 'Confirmar'}
        tone={confirmState?.tone ?? 'primary'}
        onCancel={() => setConfirmState(null)}
        onConfirm={async () => {
          if (!confirmState) {
            return
          }

          await confirmState.onConfirm()
          setConfirmState(null)
        }}
      />
    </section>
  )
}

function QuickExtrasConfig({
  quickExtras,
  onSaveQuickExtras,
}: {
  quickExtras: ProductExtra[]
  onSaveQuickExtras: (list: ProductExtra[]) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingExtraId, setEditingExtraId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const parsedPrice = parseFloat(price) || 0
    if (parsedPrice < 0) return

    setIsSubmitting(true)
    try {
      const newExtra: ProductExtra = {
        id: `extra-${Date.now()}`,
        name: name.trim(),
        price: parsedPrice,
      }
      await onSaveQuickExtras([...quickExtras, newExtra])
      setName('')
      setPrice('')
    } catch (err) {
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await onSaveQuickExtras(quickExtras.filter((x) => x.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  const startEdit = (extra: ProductExtra) => {
    setEditingExtraId(extra.id)
    setEditName(extra.name)
    setEditPrice(String(extra.price))
  }

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return
    const parsedPrice = parseFloat(editPrice) || 0
    if (parsedPrice < 0) return

    try {
      const updatedList = quickExtras.map((x) =>
        x.id === id ? { ...x, name: editName.trim(), price: parsedPrice } : x
      )
      await onSaveQuickExtras(updatedList)
      setEditingExtraId(null)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <Panel className="border-white/80 bg-white/70 p-5 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-ink">Extras Rápidos Globales</h3>
          <p className="text-xs text-muted">Configura ingredientes o agregados rápidos que se podrán sumar con cantidad (+/-) a cualquier producto en el carrito.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr] items-start">
        {/* Formulario de creación */}
        <form onSubmit={handleAdd} className="bg-white p-5 border border-line rounded-2xl space-y-4 shadow-sm">
          <h4 className="text-sm font-black text-ink uppercase tracking-wider">Nuevo Extra Rápido</h4>
          
          <div className="space-y-3">
            <label className="block">
              <span className="text-[10px] font-black uppercase text-muted tracking-wider">Nombre del extra</span>
              <input
                className="mt-1 w-full rounded-xl border border-line bg-canvas/30 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                placeholder="Ej. Tocineta, Huevo, Queso Extra"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-black uppercase text-muted tracking-wider">Precio (Bs. o $)</span>
              <input
                type="number"
                step="any"
                className="mt-1 w-full rounded-xl border border-line bg-canvas/30 px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                placeholder="Ej. 5"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </label>
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            <Plus size={14} />
            {isSubmitting ? 'Guardando...' : 'Agregar Extra'}
          </Button>
        </form>

        {/* Listado de extras */}
        <div className="bg-white p-5 border border-line rounded-2xl shadow-sm space-y-4">
          <h4 className="text-sm font-black text-ink uppercase tracking-wider">Listado de Extras ({quickExtras.length})</h4>
          
          {quickExtras.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted border border-dashed border-line rounded-xl bg-canvas/20">
              No hay extras rápidos configurados todavía.
            </div>
          ) : (
            <div className="grid gap-2 max-h-[400px] overflow-y-auto pr-1">
              {quickExtras.map((extra) => {
                const isEditing = editingExtraId === extra.id

                if (isEditing) {
                  return (
                    <div
                      key={extra.id}
                      className="flex items-center gap-3 rounded-xl border border-accent bg-accentWash/20 px-3 py-2 transition"
                    >
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <input
                          className="rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink outline-none focus:border-accent"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                        <input
                          type="number"
                          step="any"
                          className="rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink outline-none focus:border-accent"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="px-2 py-1 h-7 text-[10px] rounded-lg"
                          onClick={() => handleSaveEdit(extra.id)}
                        >
                          Guardar
                        </Button>
                        <Button
                          size="sm"
                          tone="secondary"
                          className="px-2 py-1 h-7 text-[10px] rounded-lg"
                          onClick={() => setEditingExtraId(null)}
                        >
                          X
                        </Button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={extra.id}
                    className="flex items-center justify-between rounded-xl border border-line bg-canvas/20 px-4 py-2.5 hover:bg-canvas/40 transition"
                  >
                    <div>
                      <div className="font-semibold text-xs text-ink">{extra.name}</div>
                      <div className="text-[10px] text-muted font-medium">Precio: {formatCurrency(extra.price)}</div>
                    </div>
                    
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className="p-1.5 border border-line bg-white text-muted hover:text-ink rounded-lg transition"
                        onClick={() => startEdit(extra)}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg transition"
                        onClick={() => handleDelete(extra.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}
