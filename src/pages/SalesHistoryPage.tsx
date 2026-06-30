// Historial de ventas con filtros por fecha y búsqueda. Ver/imprimir recibo.

import { useState } from 'react';
import { Ban, Eye, Printer, RotateCw, Search, UserRound } from 'lucide-react';
import type { Customer, Sale, SaleStatus } from '@/domain/types';
import { useAssignSaleCustomer, useSales, useSetSalePrintStatus, useSettings } from '@/hooks/data';
import { usePrinterConfig, useReprintTicket } from '@/hooks/pos';
import { useAuth } from '@/store/authStore';
import { snapshotFromCustomer } from '@/domain/customers';
import { formatMoney } from '@/domain/money';
import { formatDateTime, daysAgo, startOfToday } from '@/lib/format';
import { getPrinterService, isDesktopPrinting } from '@/lib/printing';
import { Badge, Button, Modal, PageHeader, Spinner, cn, inputClass } from '@/components/ui';
import { Receipt } from '@/components/pos/Receipt';
import { CancelTicketModal } from '@/components/pos/CancelTicketModal';
import { CustomerPickerModal } from '@/components/pos/CustomerPickerModal';

const STATUS: Record<SaleStatus, { label: string; color: string }> = {
  completed: { label: 'Completada', color: 'green' },
  cancelled: { label: 'Cancelada', color: 'red' },
  returned: { label: 'Devuelta', color: 'amber' },
  partially_returned: { label: 'Dev. parcial', color: 'amber' },
};

type Range = 'today' | 'week' | 'all';

export function SalesHistoryPage() {
  const [range, setRange] = useState<Range>('today');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Sale | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [customerTarget, setCustomerTarget] = useState<Sale | null>(null);
  const { data: settings } = useSettings();
  const { data: printerConfig } = usePrinterConfig();
  const setPrintStatus = useSetSalePrintStatus();
  const assignCustomer = useAssignSaleCustomer();
  const reprint = useReprintTicket();
  const can = useAuth((s) => s.can);
  const user = useAuth((s) => s.user);

  const filter = range === 'today' ? { from: startOfToday() } : range === 'week' ? { from: daysAgo(7) } : {};
  const { data: sales = [], isLoading } = useSales({ ...filter, search: search || undefined });

  const total = sales.filter((s) => s.status !== 'cancelled').reduce((a, s) => a + s.total, 0);
  const lastSale = sales.find((s) => s.status !== 'cancelled') ?? null;

  // Reimpresión: en escritorio imprime una COPIA por la térmica (ESC/POS) y
  // registra el PrintJob + auditoría; en navegador usa el diálogo del sistema.
  const printTicket = async (s: Sale) => {
    if (isDesktopPrinting() && printerConfig && settings) {
      const res = await reprint.mutateAsync({ sale: s, settings, config: printerConfig });
      setPrintStatus.mutate({ id: s.id, status: res.ok ? 'printed' : 'failed' });
      return;
    }
    const res = await getPrinterService().print();
    setPrintStatus.mutate({ id: s.id, status: res.ok ? 'printed' : 'failed' });
  };

  const assignCustomerToSale = async (customer: Customer | null) => {
    if (!customerTarget) return;
    const updated = await assignCustomer.mutateAsync({
      saleId: customerTarget.id,
      userId: user?.id,
      userName: user?.fullName,
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? 'Cliente mostrador',
      customerSnapshot: customer ? snapshotFromCustomer(customer) : null,
    });
    setCustomerTarget(null);
    setSelected(updated);
  };

  // Solo se puede anular: con permiso de venta, no anulada y del día actual.
  const canCancel = (s: Sale) => can('sell') && s.status !== 'cancelled' && s.createdAt >= startOfToday();
  const lastCancellable = sales.find(canCancel) ?? null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Ventas"
        subtitle={`${sales.length} tickets · ${formatMoney(total)}`}
        actions={
          <div className="flex items-center gap-2">
            {lastSale && (
              <Button variant="outline" onClick={() => setSelected(lastSale)}>
                <RotateCw size={16} /> Reimprimir último
              </Button>
            )}
            {lastCancellable && (
              <Button variant="danger" onClick={() => setCancelTarget(lastCancellable)}>
                <Ban size={16} /> Anular último
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {([['today', 'Hoy'], ['week', '7 días'], ['all', 'Todo']] as [Range, string][]).map(([r, label]) => (
            <button key={r} onClick={() => setRange(r)} className={cn('rounded-lg px-3 py-1.5 text-sm font-semibold', range === r ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500')}>{label}</button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input placeholder="Nº ticket o cliente" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} h-9 pl-10`} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
        ) : sales.length === 0 ? (
          <p className="py-16 text-center text-slate-400">No hay ventas en este periodo.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Ticket</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Cajero</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-center">Estado</th><th></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map((s) => (
                  <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(s)}>
                    <td className="px-4 py-3 font-bold text-slate-800">#{s.number}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(s.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-600">{s.customerName}</td>
                    <td className="px-4 py-3 text-slate-500">{s.cashierName}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{formatMoney(s.total)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-1">
                        <Badge color={STATUS[s.status].color}>{STATUS[s.status].label}</Badge>
                        {s.syncStatus === 'pending' && <Badge color="amber">Pendiente envío</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.status !== 'cancelled' && (
                        <button
                          title="Asignar cliente"
                          onClick={(e) => { e.stopPropagation(); setCustomerTarget(s); }}
                          className="mr-2 rounded-lg p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <UserRound size={18} />
                        </button>
                      )}
                      <Eye className="inline text-slate-300" size={18} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && settings && (
        <Modal open onClose={() => setSelected(null)} size="sm" title={`Ticket #${selected.number}`} footer={
          <div className="no-print flex w-full gap-2">
            {canCancel(selected) && (
              <Button variant="danger" className="flex-1" onClick={() => { setCancelTarget(selected); setSelected(null); }}>
                <Ban size={16} /> Anular
              </Button>
            )}
            {selected.status !== 'cancelled' && (
              <Button variant="outline" className="flex-1" onClick={() => setCustomerTarget(selected)} disabled={assignCustomer.isPending}>
                <UserRound size={16} /> Cliente
              </Button>
            )}
            <Button variant="outline" className="flex-1" onClick={() => printTicket(selected)}><Printer size={18} /> Imprimir</Button>
          </div>
        }>
          <div className="rounded-xl border border-slate-200"><Receipt sale={selected} settings={settings} /></div>
        </Modal>
      )}

      {cancelTarget && (
        <CancelTicketModal sale={cancelTarget} onClose={() => setCancelTarget(null)} onCancelled={() => setCancelTarget(null)} />
      )}

      {customerTarget && (
        <CustomerPickerModal onClose={() => setCustomerTarget(null)} onSelect={(customer) => void assignCustomerToSale(customer)} />
      )}
    </div>
  );
}
