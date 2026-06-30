// Recibo imprimible con plantilla fija y configurable (58/80mm).
// Estructura estable: logo, datos de tienda, líneas, totales, pago, políticas.

import type { IvaRate, Sale, Settings } from '@/domain/types';
import { formatMoney, round2 } from '@/domain/money';
import { formatDateTime } from '@/lib/format';
import { PAYMENT_LABELS } from '@/domain/payments';
import { ticketWidthPx } from '@/lib/printing';

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
  const width = ticketWidthPx(settings.ticketWidth);
  const small = settings.ticketWidth === '58';
  const cancelled = sale.status === 'cancelled';

  return (
    <div
      id="print-area"
      className={`relative mx-auto bg-white font-mono ${small ? 'text-[10px]' : 'text-[12px]'} leading-tight text-black`}
      style={{ width, padding: small ? 8 : 14 }}
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
        {settings.logoUrl ? (
          <img src={settings.logoUrl} alt="logo" className="mx-auto mb-1 max-h-12 object-contain" />
        ) : null}
        <p className={`font-bold ${small ? 'text-xs' : 'text-base'}`}>{settings.storeName}</p>
        {settings.headerText && <p>{settings.headerText}</p>}
        <p>{settings.legalName} · {settings.taxId}</p>
        <p>{settings.address}</p>
        <p>Tel. {settings.phone}</p>
      </div>

      <Divider />
      <div className="flex justify-between">
        <span>Ticket #{sale.number}</span>
        <span>{formatDateTime(sale.createdAt)}</span>
      </div>
      {sale.fiscalNumber && (sale.invoiceType === 'complete' || sale.customerSnapshot?.taxId) && (
        <div className="flex justify-between">
          <span>Factura</span>
          <span>{sale.fiscalNumber}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span>Atendido por</span>
        <span>{sale.cashierName}</span>
      </div>
      {sale.customerSnapshot ? (
        <div className="mt-1 border-t border-dotted border-black pt-1">
          <p className="font-bold">{sale.customerSnapshot.name}</p>
          {sale.customerSnapshot.taxId && <p>NIF/CIF: {sale.customerSnapshot.taxId}</p>}
          {sale.customerSnapshot.address && (
            <p>{[sale.customerSnapshot.address, sale.customerSnapshot.postalCode, sale.customerSnapshot.city].filter(Boolean).join(' · ')}</p>
          )}
        </div>
      ) : sale.customerName && sale.customerName !== 'Cliente mostrador' ? (
        <div className="flex justify-between"><span>Cliente</span><span>{sale.customerName}</span></div>
      ) : null}

      <Divider />
      <table className="w-full">
        <tbody>
          {sale.items.map((it) => (
            <tr key={it.id} className="align-top">
              <td className="pr-1">
                {it.quantity}× {it.name}
                {it.discountPct > 0 && <span className="block pl-3 text-[9px]">dto. {it.discountPct}%</span>}
              </td>
              <td className="whitespace-nowrap text-right">{formatMoney(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Divider />
      <Line label="Base imponible" value={formatMoney(sale.subtotal)} />
      {sale.discountTotal > 0 && <Line label="Descuentos" value={`-${formatMoney(sale.discountTotal)}`} />}
      <Line label="IVA" value={formatMoney(sale.taxTotal)} />

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
        <span>{formatMoney(sale.total)}</span>
      </div>

      <Divider />
      {sale.payments.map((p, i) => (
        <Line key={i} label={PAYMENT_LABELS[p.method] ?? 'Tarjeta'} value={formatMoney(p.amount)} />
      ))}
      {sale.cashGiven != null && sale.cashGiven > 0 && (
        <>
          <Line label="Entregado" value={formatMoney(sale.cashGiven)} />
          <Line label="Cambio" value={formatMoney(sale.changeGiven ?? 0)} />
        </>
      )}

      <Divider />
      {settings.ticketFooter && <p className="text-center">{settings.ticketFooter}</p>}
      {settings.legalText && <p className="mt-1 text-center text-[9px] text-gray-600">{settings.legalText}</p>}
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
