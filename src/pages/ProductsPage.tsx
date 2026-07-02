// =====================================================================
// Panel de administración de productos (alta, edición, baja).
// Preparado para escalar a muchos productos: búsqueda y filtros.
// =====================================================================

import { useMemo, useState } from 'react';
import { History, Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react';
import type { Category, IvaRate, Product } from '@/domain/types';
import { useCategories, useDeleteCategory, useDeleteProduct, useProductPriceHistory, useProducts, useSaveCategory, useSaveProduct } from '@/hooks/data';
import { formatMoney, parseDecimal } from '@/domain/money';
import { formatDateTime } from '@/lib/format';
import { validateProduct } from '@/domain/products';
import { Button, Field, Modal, PageHeader, Spinner, cn, inputClass } from '@/components/ui';

const empty: Product = {
  id: '', name: '', brand: '', sku: '', barcode: '', categoryId: null,
  price: 0, cost: 0, ivaRate: 21, taxIncluded: true, active: true,
};

const emptyCategory: Category = { id: '', name: '', color: '#14b8a6', sortOrder: 0, active: true };

export function ProductsPage() {
  const { data: products = [], isLoading } = useProducts();
  const { data: categories = [] } = useCategories();
  const save = useSaveProduct();
  const del = useDeleteProduct();
  const saveCategory = useSaveCategory();
  const deleteCategory = useDeleteCategory();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [showCategories, setShowCategories] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => p.active !== false).filter(
      (p) => p.name.toLowerCase().includes(q) || (p.brand ?? '').toLowerCase().includes(q) || (p.barcode ?? '').includes(q) || (p.sku ?? '').toLowerCase().includes(q),
    );
  }, [products, search]);

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? '—';

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Productos"
        subtitle={`${products.filter((p) => p.active !== false).length} productos en catálogo`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCategories(true)}><Tags size={18} /> Categorías</Button>
            <Button onClick={() => setEditing(empty)}><Plus size={18} /> Nuevo producto</Button>
          </div>
        }
      />

      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input placeholder="Buscar por nombre, marca, código…" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} h-9 pl-10`} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3 text-right">PVP</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => {
                  return (
                    <tr key={p.id} className={cn('hover:bg-slate-50', !p.active && 'opacity-50')}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{p.name}</div>
                        {p.brand && <div className="text-xs text-brand-600">{p.brand}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{catName(p.categoryId)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{p.barcode || p.sku || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{formatMoney(p.price)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditing(p)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={16} /></button>
                          <button onClick={() => { if (confirm(`¿Dar de baja "${p.name}"?`)) del.mutate(p.id); }} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="py-12 text-center text-slate-400">Sin resultados.</p>}
          </div>
        )}
      </div>

      {editing && (
        <ProductFormModal
          product={editing}
          all={products}
          categories={categories}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={async (p) => { await save.mutateAsync(p); setEditing(null); }}
        />
      )}
      {showCategories && (
        <CategoriesModal
          categories={categories}
          saving={saveCategory.isPending}
          deleting={deleteCategory.isPending}
          onClose={() => setShowCategories(false)}
          onSave={(category) => saveCategory.mutateAsync(category)}
          onDelete={(id) => deleteCategory.mutateAsync(id)}
        />
      )}
    </div>
  );
}

function CategoriesModal({ categories, saving, deleting, onClose, onSave, onDelete }: {
  categories: Category[];
  saving: boolean;
  deleting: boolean;
  onClose: () => void;
  onSave: (category: Category) => Promise<Category>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Category>(emptyCategory);
  const canSave = editing.name.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    await onSave({ ...editing, name: editing.name.trim(), sortOrder: Number(editing.sortOrder) || 0, active: true });
    setEditing(emptyCategory);
  };

  return (
    <Modal open onClose={onClose} size="lg" title="Categorías" footer={<Button variant="outline" onClick={onClose}>Cerrar</Button>}>
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Categoría</th><th className="px-4 py-3 text-center">Orden</th><th></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((category) => (
                <tr key={category.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium text-slate-800">
                      <span className="h-3 w-3 rounded-full" style={{ background: category.color ?? '#94a3b8' }} />
                      {category.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500">{category.sortOrder}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditing(category)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={16} /></button>
                      <button disabled={deleting} onClick={() => { if (confirm(`¿Eliminar la categoría "${category.name}"?`)) void onDelete(category.id); }} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {categories.length === 0 && <p className="py-10 text-center text-slate-400">No hay categorías.</p>}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="mb-3 font-bold text-slate-800">{editing.id ? 'Editar categoría' : 'Nueva categoría'}</h4>
          <div className="space-y-3">
            <Field label="Nombre *"><input className={inputClass} value={editing.name} onChange={(e) => setEditing((c) => ({ ...c, name: e.target.value }))} /></Field>
            <Field label="Color"><input type="color" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-2" value={editing.color ?? '#14b8a6'} onChange={(e) => setEditing((c) => ({ ...c, color: e.target.value }))} /></Field>
            <Field label="Orden"><input type="number" className={inputClass} value={editing.sortOrder} onChange={(e) => setEditing((c) => ({ ...c, sortOrder: Number(e.target.value) || 0 }))} /></Field>
            <div className="flex gap-2">
              <Button block disabled={!canSave || saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar'}</Button>
              {editing.id && <Button variant="outline" onClick={() => setEditing(emptyCategory)}>Nuevo</Button>}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ProductFormModal({ product, all, categories, onClose, onSave, saving }: {
  product: Product;
  all: Product[];
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSave: (p: Product) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Product>(product);
  const [price, setPrice] = useState(String(product.price || ''));
  const [cost, setCost] = useState(product.cost != null ? String(product.cost) : '');
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isNew = !product.id;
  const productToSave: Product = {
    ...form,
    price: price.trim() === '' ? 0 : parseDecimal(price),
    cost: cost.trim() === '' ? undefined : parseDecimal(cost),
  };
  const validation = validateProduct(productToSave, all, product.id || undefined);
  const { data: priceHistory = [] } = useProductPriceHistory(product.id || undefined);

  return (
    <Modal open onClose={onClose} size="lg" title={isNew ? 'Nuevo producto' : 'Editar producto'} footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={!validation.ok || saving} onClick={() => onSave(productToSave)}>{saving ? 'Guardando…' : 'Guardar'}</Button>
      </>
    }>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Field label="Nombre *"><input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          {validation.errors.name && <p className="mt-1 text-xs text-rose-600">{validation.errors.name}</p>}
        </div>
        <Field label="Marca"><input className={inputClass} value={form.brand ?? ''} onChange={(e) => set('brand', e.target.value)} /></Field>
        <Field label="Categoría">
          <select className={inputClass} value={form.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || null)}>
            <option value="">— Sin categoría —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div>
          <Field label="Código de barras"><input className={inputClass} value={form.barcode ?? ''} onChange={(e) => set('barcode', e.target.value)} /></Field>
          {validation.errors.barcode && <p className="mt-1 text-xs text-rose-600">{validation.errors.barcode}</p>}
        </div>
        <Field label="SKU / Referencia"><input className={inputClass} value={form.sku ?? ''} onChange={(e) => set('sku', e.target.value)} /></Field>
        <div>
          <Field label="PVP (€, IVA incl.)"><input type="text" inputMode="decimal" placeholder="0,00" className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          {validation.errors.price && <p className="mt-1 text-xs text-rose-600">{validation.errors.price}</p>}
        </div>
        <Field label="Coste (€)"><input type="text" inputMode="decimal" placeholder="0,00" className={inputClass} value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
        <Field label="IVA">
          <select className={inputClass} value={form.ivaRate} onChange={(e) => set('ivaRate', Number(e.target.value) as IvaRate)}>
            {[21, 10, 4, 0].map((r) => <option key={r} value={r}>{r}%</option>)}
          </select>
        </Field>
        <div className="col-span-2 flex gap-6 pt-1">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="h-4 w-4" /> Activo
          </label>
        </div>

        {priceHistory.length > 0 && (
          <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><History size={14} /> Historial de precios</p>
            <ul className="space-y-1 text-xs">
              {priceHistory.slice(0, 6).map((h) => (
                <li key={h.id} className="flex justify-between text-slate-600">
                  <span>{formatDateTime(h.changedAt)}</span>
                  <span><span className="text-slate-400 line-through">{formatMoney(h.oldPrice)}</span> → <b className="text-slate-700">{formatMoney(h.newPrice)}</b></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
