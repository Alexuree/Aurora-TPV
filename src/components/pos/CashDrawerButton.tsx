// Botón de apertura manual del cajón con motivo obligatorio.
// La acción queda registrada (evento de cajón + auditoría).

import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { useOpenCashDrawerManual, usePrinterConfig } from '@/hooks/pos';
import { Button, Field, Modal, inputClass } from '@/components/ui';

export function CashDrawerButton({ sessionId }: { sessionId?: string | null }) {
  const { data: config } = usePrinterConfig();
  const open = useOpenCashDrawerManual();
  const [show, setShow] = useState(false);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const submit = async () => {
    if (!config || !reason.trim()) return;
    const res = await open.mutateAsync({ config, sessionId, reason: reason.trim() });
    setShow(false);
    setReason('');
    setFeedback(res.ok ? 'Cajón abierto y registrado.' : `Registrado, pero el cajón no abrió: ${res.error ?? ''}`);
    window.setTimeout(() => setFeedback(null), 4000);
  };

  return (
    <>
      <Button variant="outline" onClick={() => setShow(true)}>
        <Inbox size={18} /> Abrir cajón
      </Button>
      {feedback && <span className="ml-2 text-xs font-medium text-slate-500">{feedback}</span>}

      {show && (
        <Modal
          open
          onClose={() => setShow(false)}
          size="sm"
          title="Abrir cajón"
          footer={
            <>
              <Button variant="outline" onClick={() => setShow(false)}>Cancelar</Button>
              <Button disabled={!reason.trim() || open.isPending} onClick={submit}>
                {open.isPending ? 'Abriendo…' : 'Abrir cajón'}
              </Button>
            </>
          }
        >
          <Field label="Motivo de la apertura">
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: dar cambio, retirar efectivo…"
              className={inputClass}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </Field>
          <p className="mt-2 text-xs text-slate-400">Quedará registrado quién, cuándo y por qué se abrió el cajón.</p>
        </Modal>
      )}
    </>
  );
}
