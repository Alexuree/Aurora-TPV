// Modal mostrado tras finalizar la venta: vista previa del ticket + imprimir
// (vía servicio de impresión) + estado de impresión + reimprimir + nueva venta.

import { useState } from 'react';
import { AlertTriangle, Check, Printer } from 'lucide-react';
import type { Sale, Settings } from '@/domain/types';
import { formatMoney } from '@/domain/money';
import { getPrinterService } from '@/lib/printing';
import { useSetSalePrintStatus } from '@/hooks/data';
import { Button, Modal } from '@/components/ui';
import { Receipt } from './Receipt';

export function ReceiptModal({ sale, settings, onClose }: { sale: Sale; settings: Settings; onClose: () => void }) {
  const setPrintStatus = useSetSalePrintStatus();
  const [printing, setPrinting] = useState(false);
  const [failed, setFailed] = useState(false);

  const handlePrint = async () => {
    setPrinting(true);
    setFailed(false);
    const res = await getPrinterService().print();
    setPrinting(false);
    setFailed(!res.ok);
    setPrintStatus.mutate({ id: sale.id, status: res.ok ? 'printed' : 'failed' });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      footer={
        <div className="no-print flex w-full gap-2">
          <Button variant="outline" className="flex-1" onClick={handlePrint} disabled={printing}>
            <Printer size={18} /> {printing ? 'Imprimiendo…' : failed ? 'Reintentar' : 'Imprimir'}
          </Button>
          <Button variant="primary" className="flex-1" onClick={onClose}>
            Nueva venta
          </Button>
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
        {failed && (
          <p className="mt-2 flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
            <AlertTriangle size={14} /> La impresión pudo fallar. La venta está guardada; puedes reimprimir.
          </p>
        )}
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
        <Receipt sale={sale} settings={settings} />
      </div>
    </Modal>
  );
}
