import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Cliente de Supabase. Se crea solo si están configuradas las variables
 * de entorno; si faltan, la app sigue funcionando 100 % local (offline).
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null

/** Indica si hay credenciales de Supabase configuradas. */
export function supabaseDisponible(): boolean {
  return supabase !== null
}