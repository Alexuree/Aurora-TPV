// Modal mostrado tras finalizar la venta: recibo + imprimir + nueva venta.

import { Check, Printer } from 'lucide-react';
import type { Sale, Settings } from '@/domain/types';
import { formatMoney } from '@/domain/money';
import { Button, Modal } from '@/components/ui';
import { Receipt } from './Receipt';

export function ReceiptModal({ sale, settings, onClose }: { sale: Sale; settings: Settings; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      footer={
        <div className="no-print flex w-full gap-2">
          <Button variant="outline" className="flex-1" onClick={() => window.print()}>
            <Printer size={18} /> Imprimir
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
      </div>
      <div className="rounded-xl border border-slate-200">
        <Receipt sale={sale} settings={settings} />
      </div>
    </Modal>
  );
}
