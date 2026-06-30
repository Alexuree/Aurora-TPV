// Panel de pruebas de impresora y cajón (usado en /ajustes/impresora).

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Inbox, Printer, Scissors, XCircle } from 'lucide-react';
import type { PrinterConfig, Settings } from '@/domain/types';
import { useCutPaper, useTestCashDrawer, useTestFullReceipt, useTestPrinter } from '@/hooks/pos';
import { isDesktopPrinting } from '@/lib/printing';
import type { PosResult } from '@/electron';
import { Button } from '@/components/ui';

export function PrinterTestPanel({ config, settings }: { config: PrinterConfig; settings?: Settings }) {
  const testPrinter = useTestPrinter();
  const testFull = useTestFullReceipt();
  const cut = useCutPaper();
  const testDrawer = useTestCashDrawer();
  const [result, setResult] = useState<{ ok: boolean; label: string; error?: string } | null>(null);
  const desktop = isDesktopPrinting();
  const busy = testPrinter.isPending || testFull.isPending || cut.isPending || testDrawer.isPending;

  const run = async (label: string, fn: () => Promise<PosResult>) => {
    setResult(null);
    const res = await fn();
    setResult({ ok: res.ok, label, error: res.error });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="mb-1 font-bold text-slate-800">Pruebas</h3>
      <p className="mb-3 text-sm text-slate-500">Comprueba la impresora y el cajón con la configuración actual.</p>

      {!desktop && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Las pruebas requieren la app de escritorio (Aurora TPV.exe). En el navegador no hay acceso al hardware.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={busy} onClick={() => run('Ticket de prueba', () => testPrinter.mutateAsync({ config, settings }))}>
          <Printer size={18} /> Probar ticket
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => run('Ticket completo', () => testFull.mutateAsync({ config, settings }))}>
          <FileText size={18} /> Ticket completo
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => run('Corte de papel', () => cut.mutateAsync(config))}>
          <Scissors size={18} /> Probar corte
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => run('Apertura de cajón', () => testDrawer.mutateAsync(config))}>
          <Inbox size={18} /> Probar cajón
        </Button>
      </div>

      {result && (
        <div className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {result.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {result.ok ? `${result.label}: enviado correctamente` : `${result.label}: ${result.error ?? 'falló'}`}
        </div>
      )}
    </div>
  );
}
