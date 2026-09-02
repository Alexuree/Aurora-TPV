// Selector de cliente para asociar (opcional) a la venta.

import { useState } from 'react';
import { Plus, Search, UserCheck } from 'lucide-react';
import type { Customer } from '@/domain/types';
import { useCustomers, useSaveCustomer } from '@/hooks/data';
import { Button, Field, Modal, inputClass } from '@/components/ui';

interface Props {
  onClose: () => void;
  onSelect: (customer: Customer | null) => void;
}

export function CustomerPickerModal({ onClose, onSelect }: Props) {
  const { data: customers = [] } = useCustomers();
  const saveCustomer = useSaveCustomer();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    taxId: '',
    address: '',
    postalCode: '',
    city: '',
    province: '',
    country: '',
  });

  const filtered = customers.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone ?? '').includes(search),
  );

  const create = async () => {
    if (!form.name.trim()) return;
    const saved = await saveCustomer.mutateAsync({
      id: '',
      name: form.name.trim(),
      phone: form.phone || undefined,
      email: form.email || undefined,
      taxId: form.taxId || undefined,
      address: form.address || undefined,
      postalCode: form.postalCode || undefined,
      city: form.city || undefined,
      province: form.province || undefined,
      country: form.country || undefined,
    });
    onSelect(saved);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Cliente de la venta" size="md">
      {!creating ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input
              autoFocus
              placeholder="Buscar por nombre o teléfono"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} pl-10`}
            />
          </div>

          <button
            onClick={() => { onSelect(null); onClose(); }}
            className="flex w-full items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50"
          >
            <UserCheck className="text-slate-400" size={18} />
            <span className="font-medium text-slate-700">Cliente mostrador (anónimo)</span>
          </button>

          <div className="max-h-60 space-y-1 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => { onSelect(c); onClose(); }}
                className="flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-left hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">{c.name}</span>
                <span className="text-sm text-slate-400">{c.phone}</span>
              </button>
            ))}
          </div>

          <Button variant="outline" block onClick={() => setCreating(true)}>
            <Plus size={18} /> Nuevo cliente
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Nombre *"><input autoFocus className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="NIF/CIF"><input className={inputClass} value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} /></Field>
          </div>
          <Field label="Email"><input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Dirección"><input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código postal"><input className={inputClass} value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} /></Field>
            <Field label="Población"><input className={inputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Provincia"><input className={inputClass} value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} /></Field>
            <Field label="País"><input className={inputClass} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" block onClick={() => setCreating(false)}>Volver</Button>
            <Button block onClick={create} disabled={!form.name.trim() || saveCustomer.isPending}>Crear y asociar</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
