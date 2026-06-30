// Recibo imprimible con plantilla fija y configurable (58/80mm).
// Estructura estable: logo, datos de tienda, líneas, totales, pago, políticas.

import type { IvaRate, PaymentMethod, Sale, Settings } from '@/domain/types';
import { formatMoney, round2 } from '@/domain/money';
import { formatDateTime } from '@/lib/format';
import { PAYMENT_LABELS } from '@/domain/payments';
import { buildReceiptPayload, ticketWidthPx } from '@/lib/printing';

function taxRows(sale: Sale): { rate: IvaRate; base: number; tax: number }[] {
  const map = new Map<IvaRate, { base: number; tax: number }>();
  for (const it of sale.items) {
    const row = map.get(it.ivaRate) ?? { base: 0, tax: 0 };
    row.base = round2(row.base + it.taxBase);
    row.tax = round2(row.tax + it.taxAmount);
    map.set(it.ivaRate, row);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => ({ rate, ...v }));
}

export function Receipt({ sale, settings }: { sale: Sale; settings: Settings }) {
  const payload = buildReceiptPayload(sale, { ...settings, ticketWidth: '58' }, 'ORIGINAL');
  const { store } = payload;
  const printedSale = payload.sale;
  const width = ticketWidthPx('58');
  const cancelled = sale.status === 'cancelled';

  return (
    <div
      id="print-area"
      className="relative mx-auto bg-white p-2 font-mono text-[10px] leading-tight text-black"
      style={{ width }}
    >
      {cancelled && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rotate-[-20deg] border-4 border-black px-3 py-1 text-2xl font-extrabold tracking-widest opacity-20">
            ANULADO
          </span>
        </div>
      )}

      {/* Logo + datos de tienda */}
      <div className="text-center">
        {store.logoData && <img src={store.logoData} alt="logo" className="mx-auto mb-1 max-h-12 max-w-[160px] object-contain" />}
        <p className="text-base font-bold">{store.name}</p>
        {store.headerText && <p>{store.headerText}</p>}
        {(store.legalName || store.taxId) && <p>{[store.legalName, store.taxId].filter(Boolean).join(' · ')}</p>}
        {store.address && <p>{store.address}</p>}
        {store.phone && <p>Tel. {store.phone}</p>}
      </div>

      <Divider />
      <div className="flex justify-between">
        <span>Ticket #{printedSale.number}</span>
        <span>{formatDateTime(printedSale.createdAt)}</span>
      </div>
      {printedSale.fiscalNumber && (
        <div className="flex justify-between">
          <span>Factura:</span>
          <span>{printedSale.fiscalNumber}</span>
        </div>
      )}
      {printedSale.cashierName && <p>Atendido por {printedSale.cashierName}</p>}
      {printedSale.customer ? (
        <div className="mt-1 border-t border-dotted border-black pt-1">
          <p className="font-bold">{printedSale.customer.name}</p>
          {printedSale.customer.taxId && <p>NIF/CIF: {printedSale.customer.taxId}</p>}
          {printedSale.customer.address && (
            <p>{[printedSale.customer.address, printedSale.customer.postalCode, printedSale.customer.city].filter(Boolean).join(' ')}</p>
          )}
        </div>
      ) : sale.customerName && sale.customerName !== 'Cliente mostrador' ? (
        <div className="flex justify-between"><span>Cliente</span><span>{sale.customerName}</span></div>
      ) : null}

      <Divider />
      <table className="w-full">
        <tbody>
          {printedSale.items.map((it, index) => (
            <tr key={index} className="align-top">
              <td className="pr-1">
                {it.quantity}x {it.name}
                {it.discountPct > 0 && <span className="block pl-3 text-[9px]">dto. {it.discountPct}%</span>}
              </td>
              <td className="whitespace-nowrap text-right">{formatMoney(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Divider />
      <Line label="Base imponible" value={formatMoney(printedSale.subtotal)} />
      {printedSale.discountTotal > 0 && <Line label="Descuentos" value={`-${formatMoney(printedSale.discountTotal)}`} />}
      <Line label="IVA" value={formatMoney(printedSale.taxTotal)} />

      {settings.showTaxBreakdown && (
        <div className="mt-1 border-t border-dotted border-black pt-1 text-[9px]">
          {taxRows(sale).map((r) => (
            <div key={r.rate} className="flex justify-between">
              <span>IVA {r.rate}% (base {formatMoney(r.base)})</span>
              <span>{formatMoney(r.tax)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-1 flex justify-between text-base font-bold">
        <span>TOTAL</span>
        <span>{formatMoney(printedSale.total)}</span>
      </div>

      <Divider />
      {printedSale.payments.map((p, i) => (
        <Line key={i} label={PAYMENT_LABELS[p.method as PaymentMethod] ?? 'Tarjeta'} value={formatMoney(p.amount)} />
      ))}
      {printedSale.cashGiven != null && printedSale.cashGiven > 0 && (
        <>
          <Line label="Entregado" value={formatMoney(printedSale.cashGiven)} />
          <Line label="Cambio" value={formatMoney(printedSale.changeGiven ?? 0)} />
        </>
      )}

      <Divider />
      {store.footer && <p className="text-center">{store.footer}</p>}
      {store.legalText && <p className="mt-1 text-center text-[9px] text-gray-600">{store.legalText}</p>}
    </div>
  );
}

function Divider() {
  return <div className="my-2 border-t border-dashed border-black" />;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
