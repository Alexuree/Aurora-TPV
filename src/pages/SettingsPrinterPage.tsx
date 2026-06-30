// Configuración de la impresora térmica y del cajón registrador.
// Ruta /ajustes/impresora (permiso manage_settings).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Save } from 'lucide-react';
import type { PrinterConfig, PrinterConnectionType, PrinterEncoding } from '@/domain/types';
import { usePrinterConfig, usePrinters, useSavePrinterConfig } from '@/hooks/pos';
import { useSettings } from '@/hooks/data';
import { isDesktopPrinting } from '@/lib/printing';
import { Button, Field, PageHeader, inputClass } from '@/components/ui';
import { PrinterTestPanel } from '@/components/pos/PrinterTestPanel';

const CONNECTION_LABELS: Record<PrinterConnectionType, string> = {
  'windows-printer': 'Impresora de Windows (USB/instalada)',
  usb: 'USB (impresora instalada)',
  network: 'Red (IP / Ethernet)',
  serial: 'Puerto serie (COM)',
};

const ENCODING_LABELS: Record<PrinterEncoding, string> = {
  cp858: 'CP858 (Europa occidental, €)',
  cp850: 'CP850 (MS-DOS Latin-1)',
  utf8: 'UTF-8',
};

export function SettingsPrinterPage() {
  const { data } = usePrinterConfig();
  const { data: settings } = useSettings();
  const save = useSavePrinterConfig();
  const printers = usePrinters();
  const [form, setForm] = useState<PrinterConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);
  if (!form) return <div className="p-6 text-slate-400">Cargando…</div>;

  const set = <K extends keyof PrinterConfig>(k: K, v: PrinterConfig[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const usesWindowsPrinter = form.connectionType === 'windows-printer' || form.connectionType === 'usb';

  const onSave = async () => {
    setSaveError(null);
    try {
      const savedConfig = await save.mutateAsync(form);
      setForm(savedConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No se pudo guardar la configuración de impresora');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Impresora y cajón"
        subtitle="Configura la impresora térmica ESC/POS y el cajón registrador."
        actions={
          <div className="flex gap-2">
            <Link to="/ajustes"><Button variant="outline"><ArrowLeft size={18} /> Ajustes</Button></Link>
            <Button onClick={onSave} disabled={save.isPending}>
              <Save size={18} /> {save.isPending ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar'}
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {saveError && (
          <div className="mx-auto mb-4 max-w-5xl rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {saveError}
          </div>
        )}
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            {/* Conexión */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-4 font-bold text-slate-800">Conexión</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Field label="Tipo de conexión">
                    <select className={inputClass} value={form.connectionType} onChange={(e) => set('connectionType', e.target.value as PrinterConnectionType)}>
                      {(Object.keys(CONNECTION_LABELS) as PrinterConnectionType[]).map((t) => (
                        <option key={t} value={t}>{CONNECTION_LABELS[t]}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                {usesWindowsPrinter && (
                  <div className="col-span-2">
                    <Field label="Impresora">
                      <div className="flex gap-2">
                        {isDesktopPrinting() && (printers.data?.length ?? 0) > 0 ? (
                          <select className={inputClass} value={form.printerName ?? ''} onChange={(e) => set('printerName', e.target.value || undefined)}>
                            <option value="">— Selecciona —</option>
                            {printers.data!.map((p) => <option key={p.name} value={p.name}>{p.name}{p.port ? ` (${p.port})` : ''}</option>)}
                          </select>
                        ) : (
                          <input className={inputClass} value={form.printerName ?? ''} placeholder="Nombre exacto de la impresora" onChange={(e) => set('printerName', e.target.value || undefined)} />
                        )}
                        <Button variant="outline" onClick={() => printers.refetch()} disabled={printers.isFetching || !isDesktopPrinting()} title="Buscar impresoras">
                          <RefreshCw size={16} className={printers.isFetching ? 'animate-spin' : ''} />
                        </Button>
                      </div>
                    </Field>
                  </div>
                )}

                {form.connectionType === 'network' && (
                  <>
                    <Field label="Dirección IP"><input className={inputClass} value={form.ipAddress ?? ''} placeholder="192.168.1.50" onChange={(e) => set('ipAddress', e.target.value || undefined)} /></Field>
                    <Field label="Puerto"><input type="number" className={inputClass} value={form.port ?? 9100} onChange={(e) => set('port', parseInt(e.target.value) || 9100)} /></Field>
                  </>
                )}

                {form.connectionType === 'serial' && (
                  <>
                    <Field label="Puerto COM"><input className={inputClass} value={form.serialPort ?? ''} placeholder="COM1" onChange={(e) => set('serialPort', e.target.value || undefined)} /></Field>
                    <Field label="Baudios"><input type="number" className={inputClass} value={form.baudRate ?? 9600} onChange={(e) => set('baudRate', parseInt(e.target.value) || 9600)} /></Field>
                  </>
                )}
              </div>
            </section>

            {/* Papel y ticket */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-4 font-bold text-slate-800">Papel e impresión</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Ancho de papel">
                  <select className={inputClass} value={form.paperWidth} onChange={(e) => set('paperWidth', e.target.value as PrinterConfig['paperWidth'])}>
                    <option value="80">80 mm</option>
                    <option value="58">58 mm</option>
                  </select>
                </Field>
                <Field label="Codificación">
                  <select className={inputClass} value={form.encoding} onChange={(e) => set('encoding', e.target.value as PrinterEncoding)}>
                    {(Object.keys(ENCODING_LABELS) as PrinterEncoding[]).map((enc) => <option key={enc} value={enc}>{ENCODING_LABELS[enc]}</option>)}
                  </select>
                </Field>
                <Field label="Copias por ticket"><input type="number" min={1} max={5} className={inputClass} value={form.copies} onChange={(e) => set('copies', Math.max(1, parseInt(e.target.value) || 1))} /></Field>
                <Toggle label="Cortar papel automáticamente" checked={form.autoCut} onChange={(v) => set('autoCut', v)} />
                <Toggle label="Imprimir QR fiscal" checked={form.printQr} onChange={(v) => set('printQr', v)} />
              </div>
            </section>

            {/* Cajón */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-4 font-bold text-slate-800">Cajón registrador</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Pin del cajón (RJ11)">
                  <select className={inputClass} value={form.drawerPin} onChange={(e) => set('drawerPin', (parseInt(e.target.value) === 5 ? 5 : 2))}>
                    <option value={2}>Pin 2 (lo más habitual)</option>
                    <option value={5}>Pin 5</option>
                  </select>
                </Field>
                <Toggle label="Abrir cajón en ventas en efectivo" checked={form.openDrawerOnCashSale} onChange={(v) => set('openDrawerOnCashSale', v)} />
              </div>
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                El cajón se conecta por RJ11 a la impresora; se abre con un pulso ESC/POS por el mismo cable de datos.
              </p>
            </section>
          </div>

          <div className="space-y-4">
            <PrinterTestPanel config={form} settings={settings} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="col-span-2 flex items-start gap-2 text-sm font-medium text-slate-600">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4" />
      <span>
        {label}
        {hint && <span className="block text-xs font-normal text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}
