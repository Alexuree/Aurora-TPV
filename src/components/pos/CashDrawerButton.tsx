// Botón de apertura manual directa del cajón.
// La acción queda registrada (evento de cajón + auditoría).

import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { useOpenCashDrawerManual, usePrinterConfig } from '@/hooks/pos';
import { Button } from '@/components/ui';

export function CashDrawerButton({ sessionId }: { sessionId?: string | null }) {
  const { data: config } = usePrinterConfig();
  const open = useOpenCashDrawerManual();
  const [feedback, setFeedback] = useState<string | null>(null);

  const openDrawer = async () => {
    if (!config) return;
    const res = await open.mutateAsync({ config, sessionId });
    setFeedback(res.ok ? 'Cajón abierto y registrado.' : `Registrado, pero el cajón no abrió: ${res.error ?? ''}`);
    window.setTimeout(() => setFeedback(null), 4000);
  };

  return (
    <>
      <Button variant="outline" onClick={openDrawer} disabled={!config || open.isPending}>
        <Inbox size={18} /> {open.isPending ? 'Abriendo…' : 'Abrir caja'}
      </Button>
      {feedback && <span className="ml-2 text-xs font-medium text-slate-500">{feedback}</span>}
    </>
  );
}
