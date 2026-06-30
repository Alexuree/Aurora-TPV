// Configuración de la tienda y de la PLANTILLA DE TICKET, con vista previa.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Printer, Save, Upload, X } from 'lucide-react';
import type { FiscalMode, InvoiceType, Sale, Settings, TicketWidth } from '@/domain/types';
import { useSaveSettings, useSettings } from '@/hooks/data';
import { dataMode } from '@/config/env';
import { Button, Field, PageHeader, inputClass } from '@/components/ui';
import { Receipt } from '@/components/pos/Receipt';
import { FISCAL_MODE_LABELS, INVOICE_TYPE_LABELS } from '@/domain/fiscal';

const sampleSale: Sale = {
  id: 'preview',
  number: 1042,
  createdAt: new Date().toISOString(),
  cashierId: 'u',
  cashierName: 'María',
  cashSessionId: null,
  customerId: null,
  customerName: 'Cliente mostrador',
  status: 'completed',
  items: [
    { id: '1', productId: 'a', name: 'Sauvage EDT 100ml', quantity: 1, unitPrice: 99.9, discountPct: 0, ivaRate: 21, taxBase: 82.56, taxAmount: 17.34, lineTotal: 99.9, returnedQty: 0 },
    { id: '2', productId: 'b', name: 'Carrete 35mm Color', quantity: 2, unitPrice: 11.95, discountPct: 0, ivaRate: 21, taxBase: 19.75, taxAmount: 4.15, lineTotal: 23.9, returnedQty: 0 },
  ],
  payments: [{ method: 'cash', amount: 123.8 }],
  subtotal: 102.31,
  taxTotal: 21.49,
  discountTotal: 0,
  total: 123.8,
  cashGiven: 130,
  changeGiven: 6.2,
  invoiceType: 'simplified',
  series: 'FS',
  fiscalNumber: 'FS-1042',
  fiscalMode: 'no_verifactu',
  previousFiscalHash: null,
  fiscalHash: 'demo-hash-preview',
};

export function SettingsPage() {
  const { data } = useSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);
  const preview = useMemo(() => form, [form]);

  if (!form || !preview) return <div className="p-6 text-slate-400">Cargando…</div>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const onLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    if (!file.type.startsWith('image/')) { setLogoError('El logo debe ser una imagen.'); return; }
    if (file.size > 250 * 1024) { setLogoError('El logo debe pesar menos de 250 KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => set('logoUrl', String(reader.result));
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    setSaveError(null);
    try {
      const savedSettings = await save.mutateAsync(form);
      setForm(savedSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No se pudo guardar la configuración');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Ajustes" subtitle="Datos de la tienda y plantilla del ticket." actions={
        <div className="flex gap-2">
          <Link to="/ajustes/impresora"><Button variant="outline"><Printer size={18} /> Impresora y cajón</Button></Link>
          <Button variant="outline" onClick={downloadLocalBackup}><Download size={18} /> Backup</Button>
          <Button onClick={onSave} disabled={save.isPending}>
            <Save size={18} /> {save.isPending ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar'}
          </Button>
        </div>
      } />

      <div className="flex-1 overflow-y-auto p-6">
        {saveError && (
          <div className="mx-auto mb-4 max-w-5xl rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {saveError}
          </div>
        )}
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_340px]">
          {/* Formulario */}
          <div className="space-y-6">
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
              <h3 className="mb-4 font-bold text-slate-800">Plantilla de ticket</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Ancho de ticket">
                  <select className={inputClass} value={form.ticketWidth} onChange={(e) => set('ticketWidth', e.target.value as TicketWidth)}>
                    <option value="80">80 mm</option>
                    <option value="58">58 mm</option>
                  </select>
                </Field>
                <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-600">
                  <input type="checkbox" checked={form.showTaxBreakdown} onChange={(e) => set('showTaxBreakdown', e.target.checked)} className="h-4 w-4" /> Mostrar desglose de IVA
                </label>

                <div className="col-span-2">
                  <Field label="Logo del ticket">
                    <div className="flex items-center gap-3">
                      {form.logoUrl ? (
                        <div className="relative">
                          <img src={form.logoUrl} alt="logo" className="h-12 w-12 rounded-lg border border-slate-200 object-contain" />
                          <button onClick={() => set('logoUrl', undefined)} className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-500 p-0.5 text-white"><X size={12} /></button>
                        </div>
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-300"><Upload size={18} /></div>
                      )}
                      <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Subir imagen
                        <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
                      </label>
                    </div>
                  </Field>
                  {logoError && <p className="mt-1 text-xs font-medium text-rose-600">{logoError}</p>}
                </div>

                <div className="col-span-2"><Field label="Texto de cabecera"><input className={inputClass} value={form.headerText} onChange={(e) => set('headerText', e.target.value)} /></Field></div>
                <div className="col-span-2"><Field label="Pie del ticket"><input className={inputClass} value={form.ticketFooter} onChange={(e) => set('ticketFooter', e.target.value)} /></Field></div>
                <div className="col-span-2"><Field label="Mensaje legal"><textarea className={`${inputClass} h-16 py-2`} value={form.legalText} onChange={(e) => set('legalText', e.target.value)} /></Field></div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-4 font-bold text-slate-800">Fiscalidad</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Modo fiscal">
                  <select className={inputClass} value={form.fiscalMode} onChange={(e) => set('fiscalMode', e.target.value as FiscalMode)}>
                    {(Object.keys(FISCAL_MODE_LABELS) as FiscalMode[]).map((mode) => <option key={mode} value={mode}>{FISCAL_MODE_LABELS[mode]}</option>)}
                  </select>
                </Field>
                <Field label="Tipo por defecto">
                  <select className={inputClass} value={form.defaultInvoiceType} onChange={(e) => set('defaultInvoiceType', e.target.value as InvoiceType)}>
                    {(Object.keys(INVOICE_TYPE_LABELS) as InvoiceType[]).map((type) => <option key={type} value={type}>{INVOICE_TYPE_LABELS[type]}</option>)}
                  </select>
                </Field>
                <Field label="Serie factura simplificada"><input className={inputClass} value={form.simplifiedInvoiceSeries} onChange={(e) => set('simplifiedInvoiceSeries', e.target.value.toUpperCase())} /></Field>
                <Field label="Serie factura completa"><input className={inputClass} value={form.completeInvoiceSeries} onChange={(e) => set('completeInvoiceSeries', e.target.value.toUpperCase())} /></Field>
                <label className="col-span-2 flex items-center gap-2 text-sm font-medium text-slate-600">
                  <input type="checkbox" checked={form.enableFiscalQr} onChange={(e) => set('enableFiscalQr', e.target.checked)} className="h-4 w-4" /> Imprimir QR fiscal en tickets/facturas
                </label>
                <p className="col-span-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Actualmente se trabaja en modo NO-VERIFACTU. El modo VERI*FACTU queda preparado para activarse cuando sea obligatorio.
                </p>
              </div>
            </section>

            <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-500">
              Modo de datos actual: <span className="font-semibold text-slate-700">{dataMode === 'supabase' ? 'Supabase (nube)' : 'Local (este equipo)'}</span>.
            </div>
          </div>

          {/* Vista previa */}
          <div>
            <div className="sticky top-0">
              <p className="mb-2 text-sm font-semibold text-slate-500">Vista previa ({form.ticketWidth} mm)</p>
              <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3">
                <Receipt sale={sampleSale} settings={preview} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function downloadLocalBackup() {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('aurora-tpv')) data[key] = localStorage.getItem(key) ?? '';
  }
  const blob = new Blob([JSON.stringify({ createdAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aurora_tpv_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
