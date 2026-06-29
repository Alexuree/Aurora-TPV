// =====================================================================
// Registro de clientes: listar, buscar, crear, editar y desactivar (baja
// lógica). Con validación y aviso de posible duplicado.
// =====================================================================

import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, UserCheck, UserX } from 'lucide-react';
import type { Customer } from '@/domain/types';
import { useCustomers, useSaveCustomer } from '@/hooks/data';
import { findDuplicate, validateCustomer } from '@/domain/customers';
import { Badge, Button, Field, Modal, PageHeader, Spinner, cn, inputClass } from '@/components/ui';

const empty: Customer = { id: '', name: '', active: true };

export function CustomersPage() {
  const { data: customers = [], isLoading } = useCustomers();
  const save = useSaveCustomer();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers
      .filter((c) => (showInactive ? true : c.active !== false))
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.taxId ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').includes(q) ||
          (c.email ?? '').toLowerCase().includes(q),
      );
  }, [customers, search, showInactive]);

  const toggleActive = (c: Customer) => save.mutate({ ...c, active: c.active === false });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Clientes"
        subtitle={`${customers.filter((c) => c.active !== false).length} clientes activos`}
        actions={<Button onClick={() => setEditing(empty)}><Plus size={18} /> Nuevo cliente</Button>}
      />

      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input placeholder="Buscar por nombre, NIF, teléfono o email" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} h-9 pl-10`} />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4" /> Ver inactivos
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-slate-400">No hay clientes que mostrar.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">NIF/CIF</th><th className="px-4 py-3">Contacto</th><th className="px-4 py-3">Población</th><th className="px-4 py-3 text-center">Estado</th><th></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className={cn('hover:bg-slate-50', c.active === false && 'opacity-50')}>
                    <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.taxId || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{c.phone || c.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{[c.city, c.province].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-center">{c.active === false ? <Badge color="red">Inactivo</Badge> : <Badge color="green">Activo</Badge>}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(c)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Editar"><Pencil size={16} /></button>
                        <button onClick={() => toggleActive(c)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" title={c.active === false ? 'Reactivar' : 'Desactivar'}>
                          {c.active === false ? <UserCheck size={16} className="text-emerald-500" /> : <UserX size={16} className="text-rose-500" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <CustomerFormModal
          customer={editing}
          all={customers}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={async (c) => { await save.mutateAsync(c); setEditing(null); }}
        />
      )}
    </div>
  );
}

function CustomerFormModal({ customer, all, onClose, onSave, saving }: {
  customer: Customer;
  all: Customer[];
  onClose: () => void;
  onSave: (c: Customer) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Customer>(customer);
  const [forced, setForced] = useState(false);
  const set = <K extends keyof Customer>(k: K, v: Customer[K]) => setForm((f) => ({ ...f, [k]: v }));

  const validation = validateCustomer(form);
  const duplicate = findDuplicate(all, form, customer.id || undefined);

  const submit = () => {
    if (!validation.ok) return;
    if (duplicate && !forced) { setForced(true); return; }
    onSave(form);
  };

  return (
    <Modal open onClose={onClose} size="lg" title={customer.id ? 'Editar cliente' : 'Nuevo cliente'} footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={!validation.ok || saving} onClick={submit}>
          {duplicate && !forced ? 'Guardar de todos modos' : saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </>
    }>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Field label="Nombre / Nombre fiscal *"><input autoFocus className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          {validation.errors.name && <p className="mt-1 text-xs text-rose-600">{validation.errors.name}</p>}
        </div>
        <Field label="NIF/CIF/NIE"><input className={inputClass} value={form.taxId ?? ''} onChange={(e) => set('taxId', e.target.value)} /></Field>
        <Field label="Teléfono"><input className={inputClass} value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <div className="col-span-2">
          <Field label="Email"><input className={inputClass} value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
          {validation.errors.email && <p className="mt-1 text-xs text-rose-600">{validation.errors.email}</p>}
        </div>
        <div className="col-span-2"><Field label="Dirección"><input className={inputClass} value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field></div>
        <Field label="Código postal"><input className={inputClass} value={form.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value)} /></Field>
        <Field label="Población"><input className={inputClass} value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="Provincia"><input className={inputClass} value={form.province ?? ''} onChange={(e) => set('province', e.target.value)} /></Field>
        <Field label="País"><input className={inputClass} value={form.country ?? ''} onChange={(e) => set('country', e.target.value)} /></Field>
        <div className="col-span-2"><Field label="Notas"><textarea className={`${inputClass} h-16 py-2`} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field></div>

        {duplicate && (
          <div className="col-span-2 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-700">
            Posible duplicado: ya existe <b>{duplicate.name}</b>{duplicate.taxId ? ` (${duplicate.taxId})` : ''}. Revisa antes de guardar.
          </div>
        )}
      </div>
    </Modal>
  );
}
