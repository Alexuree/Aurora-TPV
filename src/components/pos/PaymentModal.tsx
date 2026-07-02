// =====================================================================
// Modal de cobro. Métodos: efectivo (con cambio), tarjeta y mixto.
// Garantiza que la suma de pagos registrados sea igual al total (el
// exceso en efectivo se devuelve como cambio, no se almacena como pago).
// =====================================================================

import { useMemo, useState } from 'react';
import { Banknote, CreditCard, Split } from 'lucide-react';
import type { PaymentMethod, PaymentPart } from '@/domain/types';
import { formatMoney, round2 } from '@/domain/money';
import { quickCashSuggestions } from '@/domain/payments';
import { Button, Modal, cn, inputClass } from '@/components/ui';
import { NumericKeypad } from './NumericKeypad';

type Mode = 'cash' | 'card' | 'mixed';

export interface PaymentResult {
  payments: PaymentPart[];
  cashGiven?: number;
  changeGiven?: number;
}

interface Props {
  total: number;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (result: PaymentResult) => void;
}

const MODES: { id: Mode; label: string; icon: typeof Banknote }[] = [
  { id: 'card', label: 'Tarjeta', icon: CreditCard },
  { id: 'cash', label: 'Efectivo', icon: Banknote },
  { id: 'mixed', label: 'Mixto', icon: Split },
];

export function PaymentModal({ total, submitting, onClose, onConfirm }: Props) {
  // Por defecto se cobra con TARJETA (es la pantalla que aparece primero).
  const [mode, setMode] = useState<Mode>('card');
  const [cashStr, setCashStr] = useState('');
  const [mixed, setMixed] = useState<Record<PaymentMethod, string>>({ cash: '', card: '' });

  const cashEntered = parseFloat(cashStr) || 0;
  const cashChange = round2(Math.max(0, cashEntered - total));
  const suggestions = useMemo(() => quickCashSuggestions(total), [total]);

  // ---- Mixto: cálculos
  const mixCash = parseFloat(mixed.cash) || 0;
  const mixCard = parseFloat(mixed.card) || 0;
  const mixNonCash = round2(mixCard);
  const mixCashNeeded = round2(Math.max(0, total - mixNonCash));
  const mixPaid = round2(mixCash + mixNonCash);
  const mixRemaining = round2(Math.max(0, total - mixPaid));
  const mixChange = round2(Math.max(0, mixCash - mixCashNeeded));
  const mixNonCashValid = mixNonCash <= total + 1e-9;

  const confirm = () => {
    if (mode === 'cash') {
      onConfirm({
        payments: [{ method: 'cash', amount: total }],
        cashGiven: cashEntered,
        changeGiven: cashChange,
      });
    } else if (mode === 'card') {
      onConfirm({ payments: [{ method: mode, amount: total }] });
    } else {
      const payments: PaymentPart[] = [];
      if (mixNonCash > 0 && mixCard > 0) payments.push({ method: 'card', amount: round2(mixCard) });
      if (mixCashNeeded > 0) payments.push({ method: 'cash', amount: mixCashNeeded });
      onConfirm({
        payments,
        cashGiven: mixCash > 0 ? mixCash : undefined,
        changeGiven: mixChange > 0 ? mixChange : undefined,
      });
    }
  };

  const canConfirm =
    mode === 'cash'
      ? cashEntered + 1e-9 >= total
      : mode === 'card'
        ? true
        : mixNonCashValid && mixPaid + 1e-9 >= total;

  return (
    <Modal open onClose={onClose} size="lg" title="Cobro">
      {/* Total */}
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-slate-900 px-5 py-4 text-white">
        <span className="text-sm font-medium text-slate-300">Total a cobrar</span>
        <span className="text-4xl font-extrabold tracking-tight">{formatMoney(total)}</span>
      </div>

      {/* Selector de método */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border-2 py-3 text-sm font-semibold transition',
                active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50',
              )}
            >
              <Icon size={22} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Cuerpo según método */}
      {mode === 'cash' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400">Entregado</p>
              <p className="text-3xl font-bold tabular-nums text-slate-900">{formatMoney(cashEntered)}</p>
            </div>
            <div className={cn('rounded-xl px-4 py-3', cashChange > 0 ? 'bg-emerald-50' : 'bg-slate-50')}>
              <p className="text-xs text-slate-400">Cambio a devolver</p>
              <p className={cn('text-3xl font-bold tabular-nums', cashChange > 0 ? 'text-emerald-600' : 'text-slate-400')}>
                {formatMoney(cashChange)}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setCashStr(String(s))}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  {formatMoney(s)}
                </button>
              ))}
            </div>
          </div>
          <NumericKeypad value={cashStr} onChange={setCashStr} />
        </div>
      )}

      {mode === 'card' && (
        <div className="rounded-xl bg-slate-50 px-5 py-8 text-center">
          <p className="text-slate-600">
            Cobro de <span className="font-bold text-slate-900">{formatMoney(total)}</span> con{' '}
            <span className="font-semibold">tarjeta</span>.
          </p>
          <p className="mt-1 text-sm text-slate-400">Confirma cuando el pago se haya realizado en el datáfono.</p>
        </div>
      )}

      {mode === 'mixed' && (
        <div className="space-y-3">
          {(['cash', 'card'] as PaymentMethod[]).map((m) => (
            <div key={m} className="flex items-center gap-3">
              <span className="w-24 text-sm font-medium text-slate-600">
                {m === 'cash' ? 'Efectivo' : 'Tarjeta'}
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="0,00"
                value={mixed[m]}
                onChange={(e) => setMixed((prev) => ({ ...prev, [m]: e.target.value }))}
                className={inputClass}
              />
              <button
                onClick={() => setMixed((prev) => ({ ...prev, [m]: String(mixRemaining || mixCashNeeded) }))}
                className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
              >
                Resto
              </button>
            </div>
          ))}
          {!mixNonCashValid && <p className="text-sm font-medium text-rose-600">La tarjeta no puede superar el total.</p>}
          <div className="flex justify-between rounded-xl bg-slate-50 px-4 py-2 text-sm">
            <span className="text-slate-500">Pendiente</span>
            <span className="font-bold tabular-nums text-slate-800">{formatMoney(mixRemaining)}</span>
          </div>
          {mixChange > 0 && (
            <div className="flex justify-between rounded-xl bg-emerald-50 px-4 py-2 text-sm">
              <span className="text-emerald-600">Cambio</span>
              <span className="font-bold tabular-nums text-emerald-600">{formatMoney(mixChange)}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <Button variant="outline" size="lg" onClick={onClose} className="flex-1">
          Cancelar
        </Button>
        <Button variant="success" size="lg" onClick={confirm} disabled={!canConfirm || submitting} className="flex-[2]">
          {submitting ? 'Procesando…' : 'Cobrar y finalizar'}
        </Button>
      </div>
    </Modal>
  );
}
