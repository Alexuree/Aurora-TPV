// Recibo imprimible (formato ticket 80mm). Visible solo el #print-area al imprimir.

import type { Sale, Settings } from '@/domain/types';
import { formatMoney } from '@/domain/money';
import { formatDateTime } from '@/lib/format';
import { PAYMENT_LABELS } from '@/domain/payments';

export function Receipt({ sale, settings }: { sale: Sale; settings: Settings }) {
  return (
    <div id="print-area" className="mx-auto w-[300px] bg-white p-4 font-mono text-[12px] leading-tight text-black">
      <div className="text-center">
        <p className="text-base font-bold">{settings.storeName}</p>
        <p>{settings.legalName} · {settings.taxId}</p>
        <p>{settings.address}</p>
        <p>Tel. {settings.phone}</p>
      </div>

      <Divider />
      <div className="flex justify-between">
        <span>Ticket #{sale.number}</span>
        <span>{formatDateTime(sale.createdAt)}</span>
      </div>
      <div className="flex justify-between">
        <span>Atendido por</span>
        <span>{sale.cashierName}</span>
      </div>
      {sale.customerName && sale.customerName !== 'Cliente mostrador' && (
        <div className="flex justify-between"><span>Cliente</span><span>{sale.customerName}</span></div>
      )}

      <Divider />
      <table className="w-full">
        <tbody>
          {sale.items.map((it) => (
            <tr key={it.id} className="align-top">
              <td className="pr-1">
                {it.quantity}× {it.name}
                {it.discountPct > 0 && <span className="block pl-3 text-[10px]">dto. {it.discountPct}%</span>}
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
      <div className="mt-1 flex justify-between text-base font-bold">
        <span>TOTAL</span>
        <span>{formatMoney(sale.total)}</span>
      </div>

      <Divider />
      {sale.payments.map((p, i) => (
        <Line key={i} label={PAYMENT_LABELS[p.method]} value={formatMoney(p.amount)} />
      ))}
      {sale.cashGiven != null && sale.cashGiven > 0 && (
        <>
          <Line label="Entregado" value={formatMoney(sale.cashGiven)} />
          <Line label="Cambio" value={formatMoney(sale.changeGiven ?? 0)} />
        </>
      )}

      <Divider />
      <p className="text-center text-[11px]">{settings.ticketFooter}</p>
      <p className="mt-2 text-center text-[10px] text-gray-500">IVA incluido en los precios.</p>
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
