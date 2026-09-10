/**
 * Configuración de Supabase. La app NO usa la clave anon para acceder a los
 * datos: toda lectura/escritura pasa por la Edge Function `sync`, que exige
 * la llave de sincronización de este dispositivo (ver `src/lib/remoto.ts`).
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined

/** URL base del proyecto (sin barra final). */
export const supabaseUrl = (url ?? '').replace(/\/+$/, '')

/** Indica si hay un proyecto de Supabase configurado. */
export function supabaseDisponible(): boolean {
  return supabaseUrl !== ''
}