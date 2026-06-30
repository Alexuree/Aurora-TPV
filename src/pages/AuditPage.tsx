// Visor de auditoría: registro de acciones sensibles (ventas, anulaciones,
// caja, impresiones, cajón, cambios de configuración). Solo administración.

import { useMemo, useState } from 'react';
import { Download, ShieldCheck } from 'lucide-react';
import type { AuditEvent, AuditEventType } from '@/domain/types';
import { useAuditEvents } from '@/hooks/data';
import { formatDateTime, startOfToday, daysAgo } from '@/lib/format';
import { Badge, Button, PageHeader, Spinner, inputClass } from '@/components/ui';

const AUDIT_LABELS: Record<AuditEventType, string> = {
  sale_created: 'Venta creada',
  sale_customer_assigned: 'Cliente asignado',
  sale_cancelled: 'Venta anulada',
  cash_opened: 'Caja abierta',
  cash_closed: 'Caja cerrada',
  discount_applied: 'Descuento aplicado',
  settings_updated: 'Ajustes actualizados',
  backup_created: 'Backup creado',
  user_updated: 'Usuario actualizado',
  print_success: 'Impresión correcta',
  print_failed: 'Impresión fallida',
  reprint: 'Reimpresión (copia)',
  drawer_opened: 'Cajón abierto',
  drawer_manual_open: 'Cajón abierto (manual)',
  cash_in: 'Entrada de efectivo',
  cash_out: 'Salida de efectivo',
  printer_config_changed: 'Config. impresora',
  drawer_pin_changed: 'Pin de cajón cambiado',
  default_printer_changed: 'Impresora por defecto',
  cash_close_difference: 'Descuadre de caja',
};

const TYPE_COLOR: Partial<Record<AuditEventType, string>> = {
  sale_cancelled: 'red',
  print_failed: 'red',
  cash_close_difference: 'amber',
  reprint: 'amber',
  drawer_manual_open: 'amber',
  sale_created: 'green',
  cash_closed: 'blue',
};

type RangeKey = 'today' | 'week' | 'month' | 'all';
const RANGES: [RangeKey, string][] = [['today', 'Hoy'], ['week', '7 días'], ['month', '30 días'], ['all', 'Todo']];

export function AuditPage() {
  const [range, setRange] = useState<RangeKey>('today');
  const [type, setType] = useState<string>('');
  const [text, setText] = useState('');

  const from = range === 'today' ? startOfToday() : range === 'week' ? daysAgo(7) : range === 'month' ? daysAgo(30) : undefined;
  const { data: events = [], isLoading } = useAuditEvents({ from, type: type || undefined, limit: 2000 });

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      (e.userName ?? '').toLowerCase().includes(q) ||
      (e.entity ?? '').toLowerCase().includes(q) ||
      JSON.stringify(e.details ?? {}).toLowerCase().includes(q),
    );
  }, [events, text]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Auditoría"
        subtitle={`${filtered.length} eventos`}
        actions={
          <Button variant="outline" onClick={() => exportCsv(filtered)} disabled={filtered.length === 0}>
            <Download size={18} /> Exportar CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {RANGES.map(([r, label]) => (
            <button key={r} onClick={() => setRange(r)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${range === r ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
        <select className={`${inputClass} h-9 w-56`} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Todos los tipos</option>
          {(Object.keys(AUDIT_LABELS) as AuditEventType[]).map((t) => <option key={t} value={t}>{AUDIT_LABELS[t]}</option>)}
        </select>
        <input placeholder="Buscar usuario / detalle" value={text} onChange={(e) => setText(e.target.value)} className={`${inputClass} h-9 w-56`} />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-slate-400">
            <ShieldCheck size={32} />
            <p className="text-sm">No hay eventos en este periodo.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Evento</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Entidad</th>
                  <th className="px-4 py-3">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{formatDateTime(e.createdAt)}</td>
                    <td className="px-4 py-2.5"><Badge color={TYPE_COLOR[e.type] ?? 'slate'}>{AUDIT_LABELS[e.type] ?? e.type}</Badge></td>
                    <td className="px-4 py-2.5 text-slate-600">{e.userName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{e.entity ?? '—'}</td>
                    <td className="max-w-xs truncate px-4 py-2.5 font-mono text-xs text-slate-400" title={JSON.stringify(e.details ?? {})}>
                      {detailSummary(e)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function detailSummary(e: AuditEvent): string {
  const d = e.details ?? {};
  const parts = Object.entries(d).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  return parts.join(' · ') || '—';
}

function exportCsv(events: AuditEvent[]) {
  const header = ['Fecha', 'Tipo', 'Usuario', 'Entidad', 'EntidadId', 'Detalles'];
  const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = events.map((e) => [
    formatDateTime(e.createdAt),
    AUDIT_LABELS[e.type] ?? e.type,
    e.userName ?? '',
    e.entity ?? '',
    e.entityId ?? '',
    JSON.stringify(e.details ?? {}),
  ].map(esc).join(','));
  const csv = '﻿' + [header.map(esc).join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aurora_auditoria_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
