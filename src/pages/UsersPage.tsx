// Gestión de usuarios y visualización de permisos por rol.

import { useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Role, User } from '@/domain/types';
import { useDeleteUser, useSaveUser, useUsers } from '@/hooks/data';
import { PERMISSION_LABELS, ROLE_LABELS, ROLE_PERMISSIONS } from '@/domain/permissions';
import { dataMode } from '@/config/env';
import { Badge, Button, Field, Modal, PageHeader, inputClass } from '@/components/ui';

const emptyUser: User = { id: '', username: '', fullName: '', role: 'cashier', active: true, pin: '' };

export function UsersPage() {
  const { data: users = [] } = useUsers();
  const save = useSaveUser();
  const del = useDeleteUser();
  const [editing, setEditing] = useState<User | null>(null);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Usuarios" subtitle="Gestiona el personal y sus permisos." actions={<Button onClick={() => setEditing(emptyUser)}><Plus size={18} /> Nuevo usuario</Button>} />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3 text-center">Estado</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{u.fullName}</td>
                      <td className="px-4 py-3 text-slate-500">{u.username}</td>
                      <td className="px-4 py-3"><Badge color="brand">{ROLE_LABELS[u.role]}</Badge></td>
                      <td className="px-4 py-3 text-center">{u.active ? <Badge color="green">Activo</Badge> : <Badge color="red">Inactivo</Badge>}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditing(u)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={16} /></button>
                          <button onClick={() => { if (confirm(`¿Desactivar a ${u.fullName}?`)) del.mutate(u.id); }} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Matriz de permisos */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 font-bold text-slate-800">Permisos por rol</h3>
            <div className="space-y-4">
              {(Object.keys(ROLE_PERMISSIONS) as Role[]).map((role) => (
                <div key={role}>
                  <p className="mb-1.5 text-sm font-semibold text-brand-700">{ROLE_LABELS[role]}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ROLE_PERMISSIONS[role].map((p) => (
                      <span key={p} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        <Check size={12} className="text-emerald-500" /> {PERMISSION_LABELS[p]}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <UserFormModal user={editing} saving={save.isPending} onClose={() => setEditing(null)} onSave={async (u) => { await save.mutateAsync(u); setEditing(null); }} />
      )}
    </div>
  );
}

function UserFormModal({ user, onClose, onSave, saving }: { user: User; onClose: () => void; onSave: (u: User) => void; saving: boolean }) {
  const [form, setForm] = useState<User>(user);
  const set = <K extends keyof User>(k: K, v: User[K]) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal open onClose={onClose} title={user.id ? 'Editar usuario' : 'Nuevo usuario'} footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={!form.fullName.trim() || !form.username.trim() || saving} onClick={() => onSave(form)}>Guardar</Button>
      </>
    }>
      <div className="space-y-3">
        <Field label="Nombre completo *"><input className={inputClass} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></Field>
        <Field label={dataMode === 'supabase' ? 'Email *' : 'Usuario *'}><input className={inputClass} value={form.username} onChange={(e) => set('username', e.target.value)} /></Field>
        <Field label="Rol">
          <select className={inputClass} value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </Field>
        {dataMode === 'local' && (
          <Field label="PIN de acceso" hint="4 dígitos para iniciar sesión rápido."><input className={inputClass} value={form.pin ?? ''} onChange={(e) => set('pin', e.target.value)} maxLength={6} /></Field>
        )}
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="h-4 w-4" /> Usuario activo
        </label>
      </div>
    </Modal>
  );
}
