// Teclado numérico para entrada de importes (uso táctil).

import { Delete } from 'lucide-react';
import { cn } from '@/components/ui';

interface Props {
  /** Valor actual como cadena (permite decimales en curso). */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

export function NumericKeypad({ value, onChange, className }: Props) {
  const press = (k: string) => {
    if (k === 'del') {
      onChange(value.slice(0, -1));
      return;
    }
    if (k === '.') {
      if (value.includes('.')) return;
      onChange((value || '0') + '.');
      return;
    }
    // Evita más de 2 decimales
    if (value.includes('.') && value.split('.')[1]?.length >= 2) return;
    const next = value === '0' ? k : value + k;
    onChange(next);
  };

  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      {KEYS.map((k) => (
        <button
          key={k}
          onClick={() => press(k)}
          className={cn(
            'flex h-14 items-center justify-center rounded-xl text-xl font-semibold transition active:scale-95',
            k === 'del' ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-slate-100 text-slate-800 hover:bg-slate-200',
          )}
        >
          {k === 'del' ? <Delete size={22} /> : k}
        </button>
      ))}
    </div>
  );
}
