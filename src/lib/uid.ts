/** Genera un UUID v4. Disponible en navegadores modernos y Node 18+. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback muy improbable
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
