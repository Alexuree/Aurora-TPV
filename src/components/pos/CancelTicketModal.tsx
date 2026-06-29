// =====================================================================
// Anulación segura de un ticket: muestra el ticket, pide motivo y doble
// confirmación, y opcionalmente reintegra el stock. No borra el ticket.
// =====================================================================

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Sale } from '@/domain/types';
import { useAuth } from '@/store/authStore';
import { useCancelSale } from '@/hooks/data';
import { formatMoney } from '@/domain/money';
import { formatDateTime } from '@/lib/format';
import { PAYMENT_LABELS } from '@/domain/payments';
import { Button, Field, Modal, inputClass } from '@/components/ui';

export function CancelTicketModal({ sale, onClose, onCancelled }: { sale: Sale; onClose: () => void; onCancelled: () => void }) {
  const user = useAuth((s) => s.user)!;
  const cancel = useCancelSale();
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doCancel = async () => {
    setError(null);
    try {
      await cancel.mutateAsync({ saleId: sale.id, userId: user.id, userName: user.fullName, reason: reason.trim(), restock });
      onCancelled();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular el ticket');
      setConfirming(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2 text-rose-700">
          <AlertTriangle size={20} /> Anular ticket #{sale.number}
        </span>
      }
      footer={
        !confirming ? (
          <>
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button variant="danger" disabled={!reason.trim()} onClick={() => setConfirming(true)}>
              Anular ticket
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => setConfirming(false)}>Volver</Button>
            <Button variant="danger" disabled={cancel.isPending} onClick={doCancel}>
              {cancel.isPending ? 'Anulando…' : 'Sí, anular definitivamente'}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {/* Resumen del ticket */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Fecha</span><span className="font-medium">{formatDateTime(sale.createdAt)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Cliente</span><span className="font-medium">{sale.customerName}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Pago</span><span className="font-medium">{sale.payments.map((p) => PAYMENT_LABELS[p.method]).join(' + ')}</span></div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-base font-bold"><span>Total</span><span>{formatMoney(sale.total)}</span></div>
          <p className="mt-1 text-xs text-slate-400">{sale.items.length} líneas · {sale.items.reduce((a, i) => a + i.quantity, 0)} uds</p>
        </div>

        {!confirming ? (
          <>
            <Field label="Motivo de la anulación *" hint="Quedará registrado en el historial de anulaciones.">
              <input autoFocus className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: error del dependiente, cliente se arrepiente…" />
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="h-4 w-4" /> Reintegrar productos al stock
            </label>
          </>
        ) : (
          <div className="rounded-xl border-2 border-rose-200 bg-rose-50 p-4 text-center">
            <AlertTriangle className="mx-auto mb-2 text-rose-500" size={28} />
            <p className="font-bold text-rose-700">¿Confirmas la anulación?</p>
            <p className="mt-1 text-sm text-rose-600">
              El ticket se marcará como ANULADO y dejará de contar en las ventas del día.
              Esta acción queda registrada y no se puede deshacer.
            </p>
          </div>
        )}

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{error}</p>}
      </div>
    </Modal>
  );
}
