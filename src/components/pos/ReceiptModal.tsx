// Modal tras finalizar la venta. En escritorio imprime el ticket por la
// impresora térmica (ESC/POS) y abre el cajón si el pago lleva efectivo;
// si la impresión falla, la venta NO se pierde y se puede reintentar.
// En navegador/dev sin Electron, ofrece imprimir con el diálogo del sistema.

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Inbox, Printer } from 'lucide-react';
import type { Sale, Settings } from '@/domain/types';
import { formatMoney } from '@/domain/money';
import { getPrinterService, isDesktopPrinting } from '@/lib/printing';
import { useSetSalePrintStatus } from '@/hooks/data';
import { useOpenCashDrawerManual, usePrinterConfig, usePrintSaleFlow } from '@/hooks/pos';
import { Button, Modal } from '@/components/ui';
import { Receipt } from './Receipt';

type PrintState = 'idle' | 'printing' | 'ok' | 'failed';

export function ReceiptModal({ sale, settings, onClose }: { sale: Sale; settings: Settings; onClose: () => void }) {
  const { data: config } = usePrinterConfig();
  const printFlow = usePrintSaleFlow();
  const setPrintStatus = useSetSalePrintStatus();
  const manualDrawer = useOpenCashDrawerManual();
  const desktop = isDesktopPrinting();

  const [state, setState] = useState<PrintState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [drawerOpened, setDrawerOpened] = useState(false);
  const ran = useRef(false);

  const hasCash = sale.payments.some((p) => p.method === 'cash');

  // Impresión automática del ticket original al abrir (solo escritorio).
  useEffect(() => {
    if (ran.current || !config || !desktop) return;
    ran.current = true;
    setState('printing');
    printFlow
      .mutateAsync({ sale, settings, config })
      .then((res) => {
        setState(res.print.ok ? 'ok' : 'failed');
        if (!res.print.ok) setError(res.print.error ?? null);
        if (res.print.ok && hasCash && config.openDrawerOnCashSale) setDrawerOpened(true);
      })
      .catch((e) => { setState('failed'); setError(e instanceof Error ? e.message : 'Error de impresión'); });
  }, [config, desktop, hasCash, printFlow, sale, settings]);

  const retry = async () => {
    if (!config) return;
    setState('printing');
    setError(null);
    const res = await printFlow.mutateAsync({ sale, settings, config, openDrawer: false });
    setState(res.print.ok ? 'ok' : 'failed');
    if (!res.print.ok) setError(res.print.error ?? null);
  };

  const browserPrint = async () => {
    setState('printing');
    const res = await getPrinterService().print();
    setState(res.ok ? 'ok' : 'failed');
    setPrintStatus.mutate({ id: sale.id, status: res.ok ? 'printed' : 'failed' });
  };

  const openDrawer = async () => {
    if (!config) return;
    const res = await manualDrawer.mutateAsync({ config, sessionId: sale.cashSessionId, reason: 'Apertura tras venta' });
    if (res.ok) setDrawerOpened(true);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      footer={
        <div className="no-print flex w-full gap-2">
          {desktop ? (
            state === 'failed' ? (
              <Button variant="outline" className="flex-1" onClick={retry} disabled={printFlow.isPending}>
                <Printer size={18} /> Reintentar
              </Button>
            ) : (
              <Button variant="outline" className="flex-1" onClick={openDrawer} disabled={manualDrawer.isPending || drawerOpened}>
                <Inbox size={18} /> {drawerOpened ? 'Cajón abierto' : 'Abrir cajón'}
              </Button>
            )
          ) : (
            <Button variant="outline" className="flex-1" onClick={browserPrint} disabled={state === 'printing'}>
              <Printer size={18} /> {state === 'printing' ? 'Imprimiendo…' : 'Imprimir'}
            </Button>
          )}
          <Button variant="primary" className="flex-1" onClick={onClose}>Nueva venta</Button>
        </div>
      }
    >
      <div className="no-print mb-3 flex flex-col items-center text-center">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <Check size={26} />
        </div>
        <p className="text-lg font-bold text-slate-800">Venta completada</p>
        <p className="text-sm text-slate-500">
          Ticket #{sale.number} · {formatMoney(sale.total)}
          {sale.changeGiven ? ` · Cambio ${formatMoney(sale.changeGiven)}` : ''}
        </p>

        {desktop && state === 'printing' && (
          <p className="mt-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">Imprimiendo ticket…</p>
        )}
        {desktop && state === 'ok' && (
          <p className="mt-2 flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            <Check size={14} /> Ticket impreso{drawerOpened ? ' · Cajón abierto' : ''}
          </p>
        )}
        {desktop && state === 'failed' && (
          <p className="mt-2 flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
            <AlertTriangle size={14} /> No se pudo imprimir{error ? `: ${error}` : ''}. La venta está guardada; reintenta.
          </p>
        )}
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
        <Receipt sale={sale} settings={settings} />
      </div>
    </Modal>
  );
}
