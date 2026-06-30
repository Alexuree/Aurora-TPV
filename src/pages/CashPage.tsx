// =====================================================================
// Gestión de caja: apertura con fondo, movimientos manuales (entradas/
// salidas), cierre diario con descuadre y resumen por método de pago.
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';
import { useAuth } from '@/store/authStore';
import {
  useAddCashMovement,
  useCashMovements,
  useCashSessions,
  useCloseCash,
  useOpenCash,
  useOpenCashSession,
  useSales,
} from '@/hooks/data';
import type { CashSession, PaymentMethod, Sale } from '@/domain/types';
import { formatMoney, round2 } from '@/domain/money';
import { formatDateTime } from '@/lib/format';
import { getPrinterService } from '@/lib/printing';
import { PAYMENT_LABELS } from '@/domain/payments';
import { Button, Field, Modal, PageHeader, inputClass } from '@/components/ui';
import { CashDrawerButton } from '@/components/pos/CashDrawerButton';

function paymentSummary(sales: Sale[]): Record<PaymentMethod, number> {
  const acc: Record<PaymentMethod, number> = { cash: 0, card: 0 };
  for (const s of sales) for (const p of s.payments) {
    const method = p.method === 'cash' ? 'cash' : 'card';
    acc[method] = round2(acc[method] + p.amount);
  }
  return acc;
}

interface ClosingPrintState {
  session: CashSession;
  sales: Sale[];
}

export function CashPage() {
  const user = useAuth((s) => s.user)!;
  const { data: openSession, isLoading } = useOpenCashSession();
  const { data: sessions = [] } = useCashSessions();
  const { data: movements = [] } = useCashMovements(openSession?.id);
  const { data: allSales = [] } = useSales();
  const openCash = useOpenCash();
  const closeCash = useCloseCash();
  const addMovement = useAddCashMovement();

  const [openingFloat, setOpeningFloat] = useState('');
  const [showClose, setShowClose] = useState(false);
  const [closingPrint, setClosingPrint] = useState<ClosingPrintState | null>(null);

  useEffect(() => {
    if (!closingPrint) return;
    const timer = window.setTimeout(() => {
      void getPrinterService().print();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [closingPrint]);

  const sessionAllSales = useMemo(
    () => allSales.filter((s) => openSession && s.cashSessionId === openSession.id),
    [allSales, openSession],
  );
  const sessionSales = useMemo(() => sessionAllSales.filter((s) => s.status !== 'cancelled'), [sessionAllSales]);
  const summary = paymentSummary(sessionSales);
  const totalSold = round2(summary.cash + summary.card);

  if (isLoading) return <div className="p-6 text-slate-400">Cargando…</div>;

  /* ----------- Caja cerrada: formulario de apertura ----------- */
  if (!openSession) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="Caja" subtitle="No hay ninguna caja abierta." />
        <div className="mx-auto max-w-md p-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-slate-700">
              <Wallet className="text-brand-600" /> <h2 className="text-lg font-bold">Abrir caja</h2>
            </div>
            <Field label="Saldo inicial en efectivo (opcional)">
              <input type="number" min={0} step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} className={inputClass} />
            </Field>
            <Button
              block
              size="lg"
              className="mt-4"
              disabled={openCash.isPending}
              onClick={() => openCash.mutate({ userId: user.id, userName: user.fullName, openingFloat: parseFloat(openingFloat) || 0 })}
            >
              Abrir caja
            </Button>
          </div>
          <SessionHistory sessions={sessions} />
        </div>
        {closingPrint && <ClosingSummaryModal session={closingPrint.session} sales={closingPrint.sales} onClose={() => setClosingPrint(null)} />}
      </div>
    );
  }

  /* ----------- Caja abierta ----------- */
  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="Caja abierta"
        subtitle={`Abierta por ${openSession.openedByName} · ${formatDateTime(openSession.openedAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <CashDrawerButton sessionId={openSession.id} />
            <Button variant="danger" onClick={() => setShowClose(true)}>Cerrar caja</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-3">
        {/* Resumen */}
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Fondo inicial" value={formatMoney(openSession.openingFloat)} />
            <Stat label="Ventas" value={formatMoney(totalSold)} accent />
            <Stat label="Nº tickets" value={String(sessionSales.length)} />
            <Stat label="Efectivo previsto" value={formatMoney(round2(openSession.openingFloat + summary.cash + movementsNet(movements)))} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 font-bold text-slate-800">Resumen por método de pago</h3>
            <div className="space-y-2">
              {(Object.keys(summary) as PaymentMethod[]).map((m) => (
                <div key={m} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                  <span className="font-medium text-slate-600">{PAYMENT_LABELS[m]}</span>
                  <span className="font-bold tabular-nums text-slate-900">{formatMoney(summary[m])}</span>
                </div>
              ))}
            </div>
          </div>

          <MovementsList movements={movements} />
        </div>

        {/* Movimientos manuales */}
        <MovementForm sessionId={openSession.id} userId={user.id} onAdd={(t, amount, reason) => addMovement.mutate({ cashSessionId: openSession.id, type: t, amount, reason, userId: user.id })} pending={addMovement.isPending} />
      </div>

      {showClose && (
        <CloseCashModal
          session={openSession}
          expectedPreview={round2(openSession.openingFloat + summary.cash + movementsNet(movements))}
          onClose={() => setShowClose(false)}
          onConfirm={(counted, note) => {
            closeCash
              .mutateAsync({ sessionId: openSession.id, userId: user.id, countedCash: counted, note })
              .then((closed) => {
                setShowClose(false);
                setClosingPrint({ session: closed, sales: sessionAllSales });
              });
          }}
          pending={closeCash.isPending}
        />
      )}
      {closingPrint && <ClosingSummaryModal session={closingPrint.session} sales={closingPrint.sales} onClose={() => setClosingPrint(null)} />}
    </div>
  );
}

function movementsNet(movements: { type: 'in' | 'out'; amount: number }[]): number {
  return round2(movements.reduce((acc, m) => acc + (m.type === 'in' ? m.amount : -m.amount), 0));
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${accent ? 'text-brand-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function MovementForm({ onAdd, pending }: { sessionId: string; userId: string; onAdd: (t: 'in' | 'out', amount: number, reason: string) => void; pending: boolean }) {
  const [type, setType] = useState<'in' | 'out'>('out');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const submit = () => {
    const a = parseFloat(amount);
    if (!a || a <= 0 || !reason.trim()) return;
    onAdd(type, a, reason.trim());
    setAmount(''); setReason('');
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="mb-3 font-bold text-slate-800">Movimiento de caja</h3>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button onClick={() => setType('in')} className={`flex items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-sm font-semibold ${type === 'in' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
          <ArrowDownCircle size={18} /> Entrada
        </button>
        <button onClick={() => setType('out')} className={`flex items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-sm font-semibold ${type === 'out' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500'}`}>
          <ArrowUpCircle size={18} /> Salida
        </button>
      </div>
      <div className="space-y-3">
        <Field label="Importe (€)"><input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} /></Field>
        <Field label="Concepto"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: pago proveedor, retirada…" className={inputClass} /></Field>
        <Button block onClick={submit} disabled={pending}>Registrar movimiento</Button>
      </div>
    </div>
  );
}

function MovementsList({ movements }: { movements: { id: string; type: 'in' | 'out'; amount: number; reason: string; createdAt: string }[] }) {
  if (movements.length === 0) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="mb-3 font-bold text-slate-800">Movimientos manuales</h3>
      <ul className="space-y-1.5">
        {movements.map((m) => (
          <li key={m.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50">
            <div>
              <span className="text-sm font-medium text-slate-700">{m.reason}</span>
              <span className="ml-2 text-xs text-slate-400">{formatDateTime(m.createdAt)}</span>
            </div>
            <span className={`font-bold tabular-nums ${m.type === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {m.type === 'in' ? '+' : '−'}{formatMoney(m.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CloseCashModal({ session, expectedPreview, onClose, onConfirm, pending }: { session: CashSession; expectedPreview: number; onClose: () => void; onConfirm: (counted: number | null, note?: string) => void; pending: boolean }) {
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const countedNum = counted.trim() === '' ? null : parseFloat(counted) || 0;
  const diff = countedNum == null ? null : round2(countedNum - expectedPreview);
  return (
    <Modal open onClose={onClose} title="Cerrar caja" footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button variant="danger" disabled={pending} onClick={() => onConfirm(countedNum, note || undefined)}>Confirmar cierre</Button>
      </>
    }>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Puedes cerrar sin introducir efectivo contado. Si lo rellenas, el sistema calculará el descuadre.</p>
        <Field label="Efectivo contado (€) opcional"><input autoFocus type="number" min={0} step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} className={`${inputClass} text-lg font-bold`} /></Field>
        {counted !== '' && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-slate-50 px-4 py-3"><p className="text-slate-400">Previsto</p><p className="text-lg font-bold tabular-nums text-slate-700">{formatMoney(expectedPreview)}</p></div>
            <div className={`rounded-xl px-4 py-3 ${diff === 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
              <p className="text-slate-400">Descuadre</p>
              <p className={`text-lg font-bold tabular-nums ${diff === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{diff != null && diff > 0 ? '+' : ''}{formatMoney(diff ?? 0)}</p>
            </div>
          </div>
        )}
        <Field label="Observaciones (opcional)"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} /></Field>
        <p className="text-xs text-slate-400">Fondo inicial: {formatMoney(session.openingFloat)}</p>
      </div>
    </Modal>
  );
}

function SessionHistory({ sessions }: { sessions: CashSession[] }) {
  const closed = sessions.filter((s) => s.status === 'closed');
  const [summary, setSummary] = useState<CashSession | null>(null);
  if (closed.length === 0) return null;
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-sm font-semibold text-slate-500">Cierres anteriores</h3>
      <div className="space-y-2">
        {closed.slice(0, 8).map((s) => (
          <button
            key={s.id}
            onClick={() => setSummary(s)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm hover:bg-slate-50"
          >
            <div>
              <p className="font-medium text-slate-700">{formatDateTime(s.closedAt)}</p>
              <p className="text-xs text-slate-400">
                {s.openedByName}
                {s.salesTotal != null && ` · Ventas ${formatMoney(s.salesTotal)}`}
                {s.cardTotal != null && ` · Tarjeta ${formatMoney(s.cardTotal)}`}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold tabular-nums text-slate-800">{formatMoney(s.countedCash ?? 0)}</p>
              <p className={`text-xs font-semibold ${(s.difference ?? 0) === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                Descuadre {(s.difference ?? 0) > 0 ? '+' : ''}{formatMoney(s.difference ?? 0)}
              </p>
            </div>
          </button>
        ))}
      </div>
      {summary && <ClosingSummaryModal session={summary} sales={[]} onClose={() => setSummary(null)} />}
    </div>
  );
}

function ClosingSummaryModal({ session, sales, onClose }: { session: CashSession; sales: Sale[]; onClose: () => void }) {
  const validSales = sales.filter((s) => s.status !== 'cancelled');
  const payments = paymentSummary(validSales);
  const cashCollected = sales.length > 0 ? payments.cash : Math.max(0, (session.expectedCash ?? 0) - session.openingFloat);
  const cardCollected = sales.length > 0 ? payments.card : (session.cardTotal ?? 0);
  const salesTotal = session.salesTotal ?? round2(payments.cash + payments.card);
  return (
    <Modal open onClose={onClose} size="sm" title={`Cierre de caja · ${formatDateTime(session.closedAt)}`} footer={
      <Button variant="outline" className="no-print w-full" onClick={() => window.print()}>Imprimir resumen</Button>
    }>
      <div id="print-area" className="mx-auto w-[300px] font-mono text-[12px] text-black">
        <p className="text-center text-base font-bold">RESUMEN DE CIERRE</p>
        <p className="text-center">{formatDateTime(session.closedAt)}</p>
        <div className="my-2 border-t border-dashed border-black" />
        <Row k="Abierta por" v={session.openedByName} />
        <Row k="Fondo inicial" v={formatMoney(session.openingFloat)} />
        <Row k="Tickets válidos" v={sales.length > 0 ? String(validSales.length) : '—'} />
        <Row k="Ventas netas" v={formatMoney(salesTotal)} />
        <Row k="Efectivo cobrado" v={formatMoney(cashCollected)} />
        <Row k="Tarjeta cobrada" v={formatMoney(cardCollected)} />
        <Row k="Anulado" v={formatMoney(session.cancellationsTotal ?? 0)} />
        <div className="my-2 border-t border-dashed border-black" />
        <Row k="Efectivo previsto" v={formatMoney(session.expectedCash ?? 0)} />
        <Row k="Efectivo contado" v={session.countedCash == null ? 'No contado' : formatMoney(session.countedCash)} />
        <Row k="Descuadre" v={session.difference == null ? 'No calculado' : `${session.difference > 0 ? '+' : ''}${formatMoney(session.difference)}`} />
        {sales.length > 0 && (
          <>
            <div className="my-2 border-t border-dashed border-black" />
            <p className="mb-1 font-bold">VENTAS</p>
            {[...sales].sort((a, b) => a.number - b.number).map((sale) => (
              <div key={sale.id} className="mb-1">
                <div className="flex justify-between gap-2">
                  <span>#{sale.number} {sale.status === 'cancelled' ? 'ANULADO' : ''}</span>
                  <span>{formatMoney(sale.total)}</span>
                </div>
                <p className="text-[10px]">
                  {formatDateTime(sale.createdAt)} · {sale.cashierName} · {salePaymentText(sale)}
                </p>
              </div>
            ))}
          </>
        )}
        {session.note && <p className="mt-2 text-[11px]">Obs.: {session.note}</p>}
      </div>
    </Modal>
  );
}

function salePaymentText(sale: Sale): string {
  return sale.payments.map((p) => `${PAYMENT_LABELS[p.method] ?? 'Tarjeta'} ${formatMoney(p.amount)}`).join(' + ');
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span>{k}</span><span>{v}</span></div>;
}
