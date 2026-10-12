import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Boxes,
  CheckCircle2,
  ChevronRight,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Utensils,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '../lib/format'
import { barsInventoryService } from '../services/inventory/barsInventoryService'
import type { Product, RawMaterial, RecipeIngredient, StockMovement, UnitOfMeasure, UserRole } from '../types'
import { Button } from './ui/Button'
import { Panel } from './ui/Panel'

export function InventarioView({
  products,
  userName,
  userRole: _userRole,
}: {
  products: Product[]
  userName: string
  userRole: UserRole | 'demo'
}) {
  const [materials, setMaterials] = useState<RawMaterial[]>(() => barsInventoryService.getRawMaterials())
  const [movements, setMovements] = useState<StockMovement[]>(() => barsInventoryService.getMovements())
  const [activeTab, setActiveTab] = useState<'stock' | 'recipes' | 'movements'>('stock')
  const [searchQuery, setSearchQuery] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  // Modales
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [targetMaterial, setTargetMaterial] = useState<RawMaterial | null>(null)
  const [adjustType, setAdjustType] = useState<'in' | 'adjustment' | 'waste'>('in')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('')

  // Form material
  const [matName, setMatName] = useState('')
  const [matUnit, setMatUnit] = useState<UnitOfMeasure>('u')
  const [matStock, setMatStock] = useState('0')
  const [matMin, setMatMin] = useState('10')
  const [matCost, setMatCost] = useState('0')
  const [matCat, setMatCat] = useState('General')

  // Recetas
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '')
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([])

  useEffect(() => {
    setRecipeIngredients(selectedProductId ? barsInventoryService.getRecipe(selectedProductId)?.ingredients || [] : [])
  }, [selectedProductId, materials])

  const saveSelectedRecipe = () => {
    if (!selectedProductId) return
    barsInventoryService.saveRecipe({
      productId: selectedProductId,
      ingredients: recipeIngredients.filter((ingredient) => ingredient.rawMaterialId && ingredient.quantity > 0),
    })
    setFeedback('Receta guardada. Las próximas ventas descontarán estos insumos.')
    setTimeout(() => setFeedback(null), 3000)
  }

  useEffect(() => {
    const unsub = barsInventoryService.subscribe(() => {
      setMaterials(barsInventoryService.getRawMaterials())
      setMovements(barsInventoryService.getMovements())
    })
    return unsub
  }, [])

  const lowStockMaterials = useMemo(() => {
    return materials.filter((m) => m.currentStock <= m.minStock)
  }, [materials])

  const filteredMaterials = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return materials
    return materials.filter(
      (m) => m.name.toLowerCase().includes(q) || (m.category && m.category.toLowerCase().includes(q))
    )
  }, [materials, searchQuery])

  const openNewMaterial = () => {
    setEditingMaterial(null)
    setMatName('')
    setMatUnit('u')
    setMatStock('0')
    setMatMin('10')
    setMatCost('0')
    setMatCat('Insumos')
    setShowMaterialModal(true)
  }

  const openEditMaterial = (m: RawMaterial) => {
    setEditingMaterial(m)
    setMatName(m.name)
    setMatUnit(m.unit)
    setMatStock(String(m.currentStock))
    setMatMin(String(m.minStock))
    setMatCost(String(m.costPerUnit || 0))
    setMatCat(m.category || 'Insumos')
    setShowMaterialModal(true)
  }

  const handleSaveMaterial = (e: React.FormEvent) => {
    e.preventDefault()
    if (!matName.trim()) return

    barsInventoryService.saveRawMaterial({
      id: editingMaterial?.id,
      name: matName.trim(),
      unit: matUnit,
      currentStock: Number(matStock) || 0,
      minStock: Number(matMin) || 0,
      costPerUnit: Number(matCost) || 0,
      category: matCat.trim(),
    })

    setShowMaterialModal(false)
    setFeedback(`Insumo ${matName} guardado correctamente.`)
    setTimeout(() => setFeedback(null), 3000)
  }

  const handleDeleteMaterial = (id: string, name: string) => {
    if (!window.confirm(`¿Eliminar el insumo "${name}" del inventario?`)) return
    barsInventoryService.deleteRawMaterial(id)
    setFeedback(`Insumo eliminado.`)
    setTimeout(() => setFeedback(null), 3000)
  }

  const openAdjust = (m: RawMaterial, type: 'in' | 'adjustment' | 'waste') => {
    setTargetMaterial(m)
    setAdjustType(type)
    setAdjustQty('')
    setAdjustReason(type === 'in' ? 'Entrada por compra' : type === 'waste' ? 'Merma / daño' : 'Ajuste de inventario físico')
    setShowAdjustModal(true)
  }

  const handleSaveAdjust = (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetMaterial) return
    const qty = Number(adjustQty) || 0
    if (qty <= 0) return

    barsInventoryService.registerMovement(
      targetMaterial.id,
      adjustType,
      qty,
      adjustReason || 'Ajuste manual',
      userName
    )

    setShowAdjustModal(false)
    setFeedback(`Stock de ${targetMaterial.name} actualizado.`)
    setTimeout(() => setFeedback(null), 3000)
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#262626]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FF6A00]/15 text-[#FF6A00] border border-[#FF6A00]/30 shadow-glow">
              <Boxes size={22} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-ink tracking-tight">Inventario & Recetas</h2>
              <p className="text-xs text-muted">Control de materias primas, recetas por producto y descuento automático.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {lowStockMaterials.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-2xl bg-amber-950/40 border border-amber-800/80 px-3 py-1.5 text-xs text-amber-300">
              <AlertTriangle size={14} className="text-amber-400" />
              <span className="font-bold">{lowStockMaterials.length} con stock bajo</span>
            </div>
          )}

          <div className="flex rounded-2xl bg-[#1A1A1A] p-1 border border-[#2E2E2E]">
            <button
              onClick={() => setActiveTab('stock')}
              className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                activeTab === 'stock' ? 'bg-[#FF6A00] text-white' : 'text-[#9E9E9E] hover:text-white'
              }`}
            >
              Insumos & Stock
            </button>
            <button
              onClick={() => setActiveTab('recipes')}
              className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                activeTab === 'recipes' ? 'bg-[#FF6A00] text-white' : 'text-[#9E9E9E] hover:text-white'
              }`}
            >
              Recetas
            </button>
            <button
              onClick={() => setActiveTab('movements')}
              className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                activeTab === 'movements' ? 'bg-[#FF6A00] text-white' : 'text-[#9E9E9E] hover:text-white'
              }`}
            >
              Movimientos
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-950/50 border border-emerald-800 p-3 text-xs font-semibold text-emerald-300">
          <CheckCircle2 size={16} />
          {feedback}
        </div>
      )}

      {/* PESTAÑA 1: INSUMOS & STOCK */}
      {activeTab === 'stock' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#777777]" size={16} />
              <input
                type="text"
                placeholder="Buscar insumo por nombre o categoría..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-[#2E2E2E] bg-[#141414] py-2.5 pl-10 pr-4 text-xs text-white placeholder-[#AFA69E] outline-none focus:border-[#FF6A00]"
              />
            </div>
            <Button size="sm" onClick={openNewMaterial} className="gap-2">
              <PackagePlus size={16} />
              Nuevo Insumo
            </Button>
          </div>

          <Panel className="p-4 border-[#262626] bg-[#141414] text-[#E8E2DC]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#262626] text-[#C3BAB2] font-semibold">
                    <th className="pb-3 pl-2">Insumo / Materia Prima</th>
                    <th className="pb-3">Categoría</th>
                    <th className="pb-3 text-right">Stock Actual</th>
                    <th className="pb-3 text-right">Stock Mínimo</th>
                    <th className="pb-3 text-right">Costo Unit.</th>
                    <th className="pb-3 text-center">Estado</th>
                    <th className="pb-3 text-right pr-2">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F1F1F]">
                  {filteredMaterials.map((m) => {
                    const isLow = m.currentStock <= m.minStock
                    return (
                      <tr key={m.id} className="hover:bg-[#1A1A1A] transition">
                        <td className="py-3.5 pl-2 font-bold text-white">
                          <div>{m.name}</div>
                          <span className="text-[10px] text-[#777777]">Unidad: {m.unit}</span>
                        </td>
                        <td className="py-3.5 text-[#CCCCCC]">
                          <span className="rounded-lg bg-[#202020] px-2 py-0.5 text-[11px] border border-[#2E2E2E]">
                            {m.category || 'General'}
                          </span>
                        </td>
                        <td className="py-3.5 text-right font-mono font-bold text-sm">
                          <span className={isLow ? 'text-amber-400' : 'text-emerald-400'}>
                            {m.currentStock} {m.unit}
                          </span>
                        </td>
                        <td className="py-3.5 text-right font-mono text-[#888888]">
                          {m.minStock} {m.unit}
                        </td>
                        <td className="py-3.5 text-right font-mono text-[#CCCCCC]">
                          {m.costPerUnit ? formatCurrency(m.costPerUnit) : '-'}
                        </td>
                        <td className="py-3.5 text-center">
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/40 border border-amber-800/60 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                              <AlertTriangle size={10} /> Bajo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                              Óptimo
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 text-right pr-2">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openAdjust(m, 'in')}
                              title="Sumar stock (compra/entrada)"
                              className="rounded-lg bg-emerald-950/30 border border-emerald-800/50 p-1.5 text-emerald-400 hover:bg-emerald-900/50 transition"
                            >
                              <Plus size={13} />
                            </button>
                            <button
                              onClick={() => openAdjust(m, 'adjustment')}
                              title="Ajuste manual"
                              className="rounded-lg bg-[#242424] border border-[#333333] p-1.5 text-[#CCCCCC] hover:text-white transition"
                            >
                              <SlidersHorizontal size={13} />
                            </button>
                            <button
                              onClick={() => openEditMaterial(m)}
                              title="Editar datos"
                              className="rounded-lg bg-[#242424] border border-[#333333] p-1.5 text-[#FF6A00] hover:bg-[#FF6A00] hover:text-white transition"
                            >
                              <ChevronRight size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteMaterial(m.id, m.name)}
                              title="Eliminar insumo"
                              className="rounded-lg bg-rose-950/30 border border-rose-800/50 p-1.5 text-rose-400 hover:bg-rose-900/50 transition"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* PESTAÑA 2: RECETAS Y RELACIÓN PRODUCTOS-INSUMOS */}
      {activeTab === 'recipes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Selector de Producto */}
          <Panel className="lg:col-span-5 p-4 border-[#262626] bg-[#141414]">
            <h3 className="font-bold text-sm text-white mb-3 flex items-center gap-2">
              <Utensils size={16} className="text-[#FF6A00]" />
              Catálogo de Productos ({products.length})
            </h3>
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              {products.map((p) => {
                const isSelected = selectedProductId === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProductId(p.id)}
                    className={`w-full text-left rounded-2xl p-3 border transition flex items-center justify-between ${
                      isSelected
                        ? 'border-[#FF6A00] bg-[#FF6A00]/10 text-white shadow-glow'
                        : 'border-[#262626] bg-[#18181A] text-[#9E9E9E] hover:border-[#383838] hover:text-white'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs truncate">{p.name}</p>
                      <p className="text-[10px] text-[#777777] font-mono mt-0.5">{formatCurrency(p.price)}</p>
                    </div>
                    <ChevronRight size={16} className={isSelected ? 'text-[#FF6A00]' : 'text-[#444444]'} />
                  </button>
                )
              })}
            </div>
          </Panel>

          {/* Configuración de Receta para el Producto Seleccionado */}
          <Panel className="lg:col-span-7 p-6 border-[#262626] bg-[#141414]">
            {selectedProductId ? (
              (() => {
                const prod = products.find((p) => p.id === selectedProductId)
                return (
                  <div className="space-y-4">
                    <div className="border-b border-[#262626] pb-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-base text-white">{prod?.name}</h3>
                        <span className="font-mono text-xs font-bold text-[#FF6A00]">{prod ? formatCurrency(prod.price) : ''}</span>
                      </div>
                      <p className="text-xs text-[#9E9E9E] mt-1">
                        Define los insumos que se descuentan automáticamente cada vez que se vende una unidad de este producto.
                      </p>
                    </div>

                    <div className="rounded-2xl bg-[#18181A] p-4 border border-[#2E2E2E] space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Editar receta conectada</h4>
                        <button onClick={() => setRecipeIngredients((current) => [...current, { rawMaterialId: materials[0]?.id || '', quantity: 1, unit: materials[0]?.unit }])} disabled={!materials.length} className="rounded-xl bg-[#FF6A00] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40">+ Insumo</button>
                      </div>
                      <p className="text-[11px] text-[#AAAAAA]">Solo se descontarán los insumos y cantidades que guardes aquí para este producto.</p>
                      {recipeIngredients.map((ingredient, index) => (
                        <div key={`${ingredient.rawMaterialId}-${index}`} className="flex items-center gap-2">
                          <select value={ingredient.rawMaterialId} onChange={(event) => setRecipeIngredients((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, rawMaterialId: event.target.value } : item))} className="min-w-0 flex-1 rounded-xl border border-[#333] bg-[#101010] p-2 text-xs text-white">
                            {materials.map((mat) => <option key={mat.id} value={mat.id}>{mat.name} ({mat.unit})</option>)}
                          </select>
                          <input type="number" min="0.01" step="0.01" value={ingredient.quantity} onChange={(event) => setRecipeIngredients((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) || 0 } : item))} className="w-20 rounded-xl border border-[#333] bg-[#101010] p-2 text-xs text-white" />
                          <select value={ingredient.unit || materials.find((mat) => mat.id === ingredient.rawMaterialId)?.unit || 'u'} onChange={(event) => setRecipeIngredients((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value as UnitOfMeasure } : item))} className="w-20 rounded-xl border border-[#333] bg-[#101010] p-2 text-xs text-white">
                            {(['u', 'kg', 'g', 'l', 'ml', 'porcion'] as UnitOfMeasure[]).map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                          </select>
                          <button onClick={() => setRecipeIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-xl border border-rose-800/50 px-2 py-2 text-xs text-rose-300">Quitar</button>
                        </div>
                      ))}
                      <button onClick={saveSelectedRecipe} className="w-full rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Guardar receta</button>
                    </div>
                  </div>
                )
              })()
            ) : (
              <div className="text-center py-12 text-xs text-[#666666]">
                Selecciona un producto a la izquierda para ver su receta.
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* PESTAÑA 3: HISTORIAL DE MOVIMIENTOS */}
      {activeTab === 'movements' && (
        <Panel className="p-4 border-[#262626] bg-[#141414]">
          <h3 className="font-bold text-base text-white mb-4 flex items-center gap-2">
            <RefreshCw size={18} className="text-[#FF6A00]" />
            Movimientos y Auditoría de Stock ({movements.length})
          </h3>

          {movements.length === 0 ? (
            <div className="text-center py-12 text-xs text-[#666666]">
              Aún no hay movimientos registrados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#262626] text-[#777777] font-semibold">
                    <th className="pb-3 pl-2">Fecha/Hora</th>
                    <th className="pb-3">Insumo</th>
                    <th className="pb-3">Tipo</th>
                    <th className="pb-3 text-right">Cantidad</th>
                    <th className="pb-3 text-right">Stock Anterior</th>
                    <th className="pb-3 text-right">Stock Nuevo</th>
                    <th className="pb-3 pl-4">Motivo / Venta</th>
                    <th className="pb-3 text-right pr-2">Usuario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F1F1F]">
                  {movements.slice(0, 50).map((mov) => {
                    const isOut = mov.type === 'out_sale' || mov.type === 'waste'
                    return (
                      <tr key={mov.id} className="hover:bg-[#1A1A1A] transition">
                        <td className="py-3 pl-2 text-[#777777] whitespace-nowrap">
                          {new Date(mov.timestamp).toLocaleDateString()} {new Date(mov.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 font-bold text-white">{mov.rawMaterialName}</td>
                        <td className="py-3">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              mov.type === 'out_sale'
                                ? 'bg-orange-950/40 text-orange-300 border border-orange-800/40'
                                : mov.type === 'in'
                                  ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40'
                                  : mov.type === 'waste'
                                    ? 'bg-rose-950/40 text-rose-300 border border-rose-800/40'
                                    : 'bg-blue-950/40 text-blue-300 border border-blue-800/40'
                            }`}
                          >
                            {mov.type === 'out_sale'
                              ? 'Venta'
                              : mov.type === 'in'
                                ? 'Entrada'
                                : mov.type === 'waste'
                                  ? 'Merma'
                                  : 'Ajuste'}
                          </span>
                        </td>
                        <td className={`py-3 text-right font-mono font-bold ${isOut ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {isOut ? `-${mov.quantity}` : `+${mov.quantity}`}
                        </td>
                        <td className="py-3 text-right font-mono text-[#777777]">{mov.previousStock}</td>
                        <td className="py-3 text-right font-mono font-bold text-white">{mov.newStock}</td>
                        <td className="py-3 pl-4 text-[#CCCCCC]">{mov.reason}</td>
                        <td className="py-3 text-right pr-2 text-[#777777]">{mov.createdBy}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* MODAL: CREAR / EDITAR INSUMO */}
      {showMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Panel className="w-full max-w-md p-6 border-[#333333] bg-[#141414] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#262626] pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <PackagePlus size={18} className="text-[#FF6A00]" />
                {editingMaterial ? 'Editar Insumo' : 'Nuevo Insumo'}
              </h3>
              <button onClick={() => setShowMaterialModal(false)} className="text-[#777777] hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveMaterial} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#CCCCCC] mb-1">Nombre del Insumo / Materia Prima</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Pan Brioche, Queso Cheddar..."
                  value={matName}
                  onChange={(e) => setMatName(e.target.value)}
                  className="w-full rounded-2xl border border-[#333333] bg-[#1A1A1A] p-3 text-sm text-white outline-none focus:border-[#FF6A00]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#CCCCCC] mb-1">Unidad de Medida</label>
                  <select
                    value={matUnit}
                    onChange={(e) => setMatUnit(e.target.value as UnitOfMeasure)}
                    className="w-full rounded-2xl border border-[#333333] bg-[#1A1A1A] p-3 text-sm text-white outline-none focus:border-[#FF6A00]"
                  >
                    <option value="u">Unidad (u)</option>
                    <option value="porcion">Porción</option>
                    <option value="kg">Kilogramo (kg)</option>
                    <option value="g">Gramo (g)</option>
                    <option value="l">Litro (l)</option>
                    <option value="ml">Mililitro (ml)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#CCCCCC] mb-1">Categoría</label>
                  <input
                    type="text"
                    placeholder="Ej: Panadería, Carnes"
                    value={matCat}
                    onChange={(e) => setMatCat(e.target.value)}
                    className="w-full rounded-2xl border border-[#333333] bg-[#1A1A1A] p-3 text-sm text-white outline-none focus:border-[#FF6A00]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#CCCCCC] mb-1">Stock Actual</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={matStock}
                    onChange={(e) => setMatStock(e.target.value)}
                    className="w-full rounded-2xl border border-[#333333] bg-[#1A1A1A] p-3 text-sm text-white outline-none focus:border-[#FF6A00]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#CCCCCC] mb-1">Alerta Stock Mínimo</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={matMin}
                    onChange={(e) => setMatMin(e.target.value)}
                    className="w-full rounded-2xl border border-[#333333] bg-[#1A1A1A] p-3 text-sm text-white outline-none focus:border-[#FF6A00]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#CCCCCC] mb-1">Costo Estimado por Unidad (Bs)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={matCost}
                  onChange={(e) => setMatCost(e.target.value)}
                  className="w-full rounded-2xl border border-[#333333] bg-[#1A1A1A] p-3 text-sm text-white outline-none focus:border-[#FF6A00]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button type="button" tone="secondary" onClick={() => setShowMaterialModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" tone="primary">
                  {editingMaterial ? 'Guardar Cambios' : 'Crear Insumo'}
                </Button>
              </div>
            </form>
          </Panel>
        </div>
      )}

      {/* MODAL: AJUSTE / ENTRADA DE STOCK */}
      {showAdjustModal && targetMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Panel className="w-full max-w-md p-6 border-[#333333] bg-[#141414] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#262626] pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                {adjustType === 'in' ? (
                  <>
                    <ArrowUp size={18} className="text-emerald-400" /> Entrada de Stock
                  </>
                ) : adjustType === 'waste' ? (
                  <>
                    <ArrowDown size={18} className="text-rose-400" /> Registro de Merma
                  </>
                ) : (
                  <>
                    <SlidersHorizontal size={18} className="text-blue-400" /> Ajuste de Stock
                  </>
                )}
              </h3>
              <button onClick={() => setShowAdjustModal(false)} className="text-[#777777] hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAdjust} className="mt-4 space-y-4">
              <div className="rounded-xl bg-[#1A1A1A] p-3 border border-[#282828] text-xs">
                <p className="font-bold text-white">{targetMaterial.name}</p>
                <p className="text-[#9E9E9E] mt-0.5">
                  Stock actual: <strong className="text-emerald-400">{targetMaterial.currentStock} {targetMaterial.unit}</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#CCCCCC] mb-1">
                  {adjustType === 'in'
                    ? `Cantidad a Sumar (${targetMaterial.unit})`
                    : adjustType === 'adjustment'
                      ? `Nuevo Stock Físico (${targetMaterial.unit})`
                      : `Cantidad Descartada (${targetMaterial.unit})`}
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  placeholder="0"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full rounded-2xl border border-[#333333] bg-[#1A1A1A] p-3 text-lg font-bold text-white outline-none focus:border-[#FF6A00]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#CCCCCC] mb-1">Motivo o Justificación</label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full rounded-2xl border border-[#333333] bg-[#1A1A1A] p-3 text-sm text-white outline-none focus:border-[#FF6A00]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button type="button" tone="secondary" onClick={() => setShowAdjustModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" tone="primary">
                  Aplicar Movimiento
                </Button>
              </div>
            </form>
          </Panel>
        </div>
      )}
    </div>
  )
}
