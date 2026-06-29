// Configuración de la tienda (aparece en el ticket) y datos fiscales.

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import type { Settings } from '@/domain/types';
import { useSaveSettings, useSettings } from '@/hooks/data';
import { dataMode } from '@/config/env';
import { Button, Field, PageHeader, inputClass } from '@/components/ui';

export function SettingsPage() {
  const { data } = useSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (data) setForm(data); }, [data]);
  if (!form) return <div className="p-6 text-slate-400">Cargando…</div>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Ajustes" subtitle="Datos de la tienda que aparecen en el ticket." actions={
        <Button onClick={async () => { await save.mutateAsync(form); setSaved(true); setTimeout(() => setSaved(false), 2000); }} disabled={save.isPending}>
          <Save size={18} /> {saved ? 'Guardado ✓' : 'Guardar'}
        </Button>
      } />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 font-bold text-slate-800">Datos del negocio</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Field label="Nombre comercial"><input className={inputClass} value={form.storeName} onChange={(e) => set('storeName', e.target.value)} /></Field></div>
              <Field label="Razón social"><input className={inputClass} value={form.legalName} onChange={(e) => set('legalName', e.target.value)} /></Field>
              <Field label="NIF/CIF"><input className={inputClass} value={form.taxId} onChange={(e) => set('taxId', e.target.value)} /></Field>
              <div className="col-span-2"><Field label="Dirección"><input className={inputClass} value={form.address} onChange={(e) => set('address', e.target.value)} /></Field></div>
              <Field label="Teléfono"><input className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Email"><input className={inputClass} value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 font-bold text-slate-800">Ticket</h3>
            <Field label="Pie del ticket"><textarea className={`${inputClass} h-24 py-2`} value={form.ticketFooter} onChange={(e) => set('ticketFooter', e.target.value)} /></Field>
          </section>

          <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-500">
            Modo de datos actual: <span className="font-semibold text-slate-700">{dataMode === 'supabase' ? 'Supabase (nube)' : 'Local (este equipo)'}</span>.
          </div>
        </div>
      </div>
    </div>
  );
}
