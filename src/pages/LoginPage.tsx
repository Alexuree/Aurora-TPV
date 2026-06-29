// Pantalla de acceso. En modo local: usuario + PIN. En Supabase: email + contraseña.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/store/authStore';
import { dataMode } from '@/config/env';
import { Button, Field, Spinner, inputClass } from '@/components/ui';

const DEMO = [
  { username: 'admin', pin: '1234', label: 'Administrador' },
  { username: 'encargado', pin: '2222', label: 'Encargado' },
  { username: 'dependiente', pin: '0000', label: 'Dependiente' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await login(username, pin);
    if (ok) navigate('/', { replace: true });
  };

  const quick = async (u: string, p: string) => {
    setUsername(u);
    setPin(p);
    const ok = await login(u, p);
    if (ok) navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="absolute inset-0 bg-aurora opacity-10" />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 text-center">
          <img src="/logo.svg" alt="Aurora TPV" className="mx-auto h-16" />
        </div>

        <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-2xl">
          <h1 className="mb-1 text-xl font-bold text-slate-800">Iniciar sesión</h1>
          <p className="mb-5 text-sm text-slate-500">Accede para empezar a vender.</p>

          <div className="space-y-3">
            <Field label={dataMode === 'supabase' ? 'Email' : 'Usuario'}>
              <div className="relative">
                <UserIcon className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`${inputClass} pl-10`}
                  placeholder={dataMode === 'supabase' ? 'tu@correo.com' : 'usuario'}
                />
              </div>
            </Field>
            <Field label={dataMode === 'supabase' ? 'Contraseña' : 'PIN'}>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className={`${inputClass} pl-10`}
                  placeholder="••••"
                />
              </div>
            </Field>
          </div>

          {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{error}</p>}

          <Button type="submit" block size="lg" className="mt-5" disabled={loading}>
            {loading ? <Spinner className="h-5 w-5 border-white/40 border-t-white" /> : 'Entrar'}
          </Button>
        </form>

        {dataMode === 'local' && (
          <div className="mt-4 rounded-xl bg-white/10 p-3 text-center backdrop-blur">
            <p className="mb-2 text-xs font-medium text-slate-300">Acceso rápido (demo)</p>
            <div className="flex justify-center gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.username}
                  onClick={() => quick(d.username, d.pin)}
                  className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
