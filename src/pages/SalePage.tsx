// =====================================================================
// Pantalla principal de venta (el corazón del TPV).
// Flujo: buscar/escanear -> añadir al ticket -> cobrar -> recibo -> nueva.
// =====================================================================

import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barcode, Lock, Search, Wallet } from 'lucide-react';
import { useAuth } from '@/store/authStore';
import { useCart } from '@/store/cartStore';
import { useCategories, useOpenCashSession, useProcessSale, useProducts, useSettings } from '@/hooks/data';
import type { CartLine, Sale } from '@/domain/types';
import { computeLine, computeTotals, lineChargedTotal } from '@/domain/cart';
import { Button, Spinner, cn, inputClass } from '@/components/ui';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { TicketPanel } from '@/components/pos/TicketPanel';
import { LineEditModal } from '@/components/pos/LineEditModal';
import { PaymentModal, type PaymentResult } from '@/components/pos/PaymentModal';
import { CustomerPickerModal } from '@/components/pos/CustomerPickerModal';
import { ReceiptModal } from '@/components/pos/ReceiptModal';

export function SalePage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const cart = useCart();
  const { data: products = [], isLoading } = useProducts();
  const { data: categories = [] } = useCategories();
  const { data: settings } = useSettings();
  const { data: openSession, isLoading: loadingSession } = useOpenCashSession();
  const processSale = useProcessSale();

  const [term, setTerm] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [editLine, setEditLine] = useState<CartLine | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const totals = computeTotals(cart.lines);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return products
      .filter((p) => p.active)
      .filter((p) => (categoryId === 'all' ? true : p.categoryId === categoryId))
      .filter((p) =>
        q === ''
          ? true
          : p.name.toLowerCase().includes(q) ||
            (p.brand ?? '').toLowerCase().includes(q) ||
            (p.sku ?? '').toLowerCase().includes(q) ||
            (p.barcode ?? '').includes(q),
      );
  }, [products, term, categoryId]);

  const focusSearch = () => searchRef.current?.focus();

  const addAndRefocus = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (p) cart.addProduct(p);
    setTerm('');
    focusSearch();
  };

  // Enter en el buscador: si hay coincidencia exacta de código de barras/SKU, lo añade.
  const onSearchEnter = () => {
    const q = term.trim().toLowerCase();
    if (!q) return;
    const exact = products.find(
      (p) => p.active && (p.barcode?.toLowerCase() === q || p.sku?.toLowerCase() === q),
    );
    if (exact) {
      addAndRefocus(exact.id);
      return;
    }
    // Si solo queda un resultado, añádelo (búsqueda rápida por nombre).
    if (filtered.length === 1) addAndRefocus(filtered[0].id);
  };

  const handleConfirmPayment = async (result: PaymentResult) => {
    if (!user) return;
    const lines = cart.lines.map((l) => {
      const t = computeLine(l);
      return {
        productId: l.productId,
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        ivaRate: l.ivaRate,
        taxBase: t.taxBase,
        taxAmount: t.taxAmount,
        lineTotal: lineChargedTotal(l),
      };
    });

    const sale = await processSale.mutateAsync({
      cashierId: user.id,
      cashierName: user.fullName,
      cashSessionId: openSession?.id ?? null,
      customerId: cart.customer?.id ?? null,
      customerName: cart.customer?.name ?? 'Cliente mostrador',
      lines,
      payments: result.payments,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      discountTotal: totals.discountTotal,
      total: totals.total,
      cashGiven: result.cashGiven,
      changeGiven: result.changeGiven,
      note: cart.note || undefined,
    });

    setShowPayment(false);
    setLastSale(sale);
    cart.clear();
  };

  // -------- Caja cerrada: bloquea la venta --------
  if (!loadingSession && !openSession) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Wallet size={26} />
          </div>
          <h2 className="text-lg font-bold text-slate-800">La caja está cerrada</h2>
          <p className="mt-1 text-sm text-slate-500">
            Antes de empezar a vender debes abrir la caja con el saldo inicial.
          </p>
          <Button block className="mt-4" onClick={() => navigate('/caja')}>
            Ir a abrir caja
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Columna catálogo */}
      <section className="flex flex-1 flex-col overflow-hidden p-4">
        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 text-slate-400" size={20} />
            <input
              ref={searchRef}
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearchEnter()}
              placeholder="Buscar producto o escanear código de barras…"
              className={`${inputClass} h-12 pl-11 text-base`}
            />
            <Barcode className="absolute right-3.5 top-3.5 text-slate-300" size={20} />
          </div>
        </div>

        {/* Categorías */}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <Chip active={categoryId === 'all'} onClick={() => setCategoryId('all')} label="Todo" />
          {categories.filter((c) => c.active).map((c) => (
            <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)} label={c.name} color={c.color} />
          ))}
        </div>

        {/* Rejilla */}
        <div className="flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex h-full items-center justify-center"><Spinner className="h-8 w-8" /></div>
          ) : (
            <ProductGrid products={filtered} onSelect={(p) => addAndRefocus(p.id)} />
          )}
        </div>
      </section>

      {/* Columna ticket */}
      <aside className="w-[380px] shrink-0 border-l border-slate-200 shadow-[-4px_0_16px_rgba(15,23,42,0.04)]">
        <TicketPanel
          onCharge={() => setShowPayment(true)}
          onEditLine={(l) => setEditLine(l)}
          onSelectCustomer={() => setShowCustomer(true)}
        />
      </aside>

      {/* Modales */}
      {editLine && <LineEditModal line={editLine} onClose={() => setEditLine(null)} />}
      {showCustomer && <CustomerPickerModal onClose={() => setShowCustomer(false)} onSelect={(c) => cart.setCustomer(c)} />}
      {showPayment && (
        <PaymentModal
          total={totals.total}
          submitting={processSale.isPending}
          onClose={() => setShowPayment(false)}
          onConfirm={handleConfirmPayment}
        />
      )}
      {lastSale && settings && (
        <ReceiptModal
          sale={lastSale}
          settings={settings}
          onClose={() => { setLastSale(null); focusSearch(); }}
        />
      )}

      {processSale.isError && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          <Lock size={16} /> No se pudo completar la venta. Inténtalo de nuevo.
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition',
        active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {label}
    </button>
  );
}
