import { supabaseDisponible, supabaseUrl } from './supabase'
import { obtenerLlave } from './llave'
import type { TablaSync } from '../model/types'

/**
 * Transporte hacia la nube a través de la Edge Function `sync` de Supabase.
 * Cada petición lleva la llave de sincronización de este dispositivo en la
 * cabecera `x-llave-sincronizacion`; sin una llave válida, la función
 * responde 401 y los datos quedan inaccesibles.
 */

/** Resultado de una descarga completa: filas por tabla. */
export type DescargaRemota = Record<string, Array<Record<string, unknown>>>

async function llamar(
  accion: string,
  cuerpo?: unknown,
  query?: Record<string, string | number>,
): Promise<unknown> {
  if (!supabaseDisponible()) {
    throw new Error('Supabase no está configurado. Revise las variables de entorno.')
  }
  const llave = obtenerLlave()
  if (!llave) {
    throw new Error(
      'Falta la llave de sincronización de este dispositivo. Configúrela en el panel de sincronización.',
    )
  }
  const url = new URL(`${supabaseUrl}/functions/v1/sync`)
  url.searchParams.set('accion', accion)
  if (query) {
    for (const [clave, valor] of Object.entries(query)) {
      url.searchParams.set(clave, String(valor))
    }
  }
  let respuesta: Response
  try {
    respuesta = await fetch(url.toString(), {
      method: cuerpo === undefined ? 'GET' : 'POST',
      headers: {
        'x-llave-sincronizacion': llave,
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
  } catch {
    throw new Error('No se pudo conectar con la nube.')
  }
  const texto = await respuesta.text()
  let datos: unknown = null
  try {
    if (texto) {
      datos = JSON.parse(texto)
    }
  } catch {
    datos = texto
  }
  if (!respuesta.ok) {
    const mensaje =
      datos != null && typeof datos === 'object' && 'error' in datos
        ? String((datos as { error: unknown }).error)
        : `La nube respondió con el estado ${respuesta.status}.`
    throw new Error(mensaje)
  }
  return datos
}

/** Comprueba conectividad y validez de la llave sin transferir datos. */
export async function verificarRemoto(): Promise<boolean> {
  try {
    await llamar('ping')
    return true
  } catch {
    return false
  }
}

/**
 * Descarga las filas de las 6 tablas. Si se pasa `desde` (epoch ms), solo
 * las modificadas después de esa marca (descarga incremental); sin `desde`
 * se descarga la base completa (restauración).
 */
export async function descargarRemoto(desde?: number): Promise<DescargaRemota> {
  const datos = await llamar('descargar', undefined, desde ? { desde } : undefined)
  if (datos == null || typeof datos !== 'object') {
    throw new Error('La nube devolvió una respuesta inesperada al descargar.')
  }
  return datos as DescargaRemota
}

/** Sube un lote de filas de una tabla (para el outbox y "Subir todo"). */
export async function subirRemoto(tabla: TablaSync, filas: unknown[]): Promise<void> {
  if (filas.length === 0) {
    return
  }
  await llamar('subir', { tabla, filas })
}

/**
 * Indica si la nube ya tiene algún administrador (`true`/`false`). Devuelve
 * `null` si el dispositivo no puede confirmarlo (sin llave, sin conexión o
 * error de red): en ese caso no corresponde otorgar el rol por decisión local.
 */
export async function hayAdminRemoto(): Promise<boolean | null> {
  if (!supabaseDisponible() || !obtenerLlave()) {
    return null
  }
  try {
    const datos = await llamar('hay_admin')
    if (datos != null && typeof datos === 'object' && 'hay' in datos) {
      return Boolean((datos as { hay: unknown }).hay)
    }
  } catch {
    // Intencional: sin verificación no se otorga ningún permiso.
  }
  return null
}