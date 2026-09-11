import { supabaseDisponible, supabaseUrl } from './supabase'
import { obtenerLlave } from './llave'
import type { TablaSync } from '../model/types'

/**
 * Transporte hacia la nube a través de la Edge Function `sync` de Supabase.
 * Cada petición lleva la llave de sincronización de este dispositivo en la
 * cabecera `x-llave-sincronizacion`; sin una llave válida, la función
 * responde 401 y los datos quedan inaccesibles.
 */

/** Resultado de una descarga: `ahora` (reloj del servidor) + filas por tabla. */
export interface DescargaRemota {
  /** Epoch ms del reloj del servidor al responder (calibra el cursor). */
  ahora: number
  tablas: Record<string, Array<Record<string, unknown>>>
}

/**
 * Error del transporte hacia la nube. `estado` es el código HTTP de la
 * respuesta; `definitivo` indica que no tiene sentido reintentar: un 4xx
 * (payload inválido, conflicto de unicidad, llave, límites) nunca tendrá
 * éxito reenviándolo, mientras que un 5xx o un fallo de red son transitorios.
 * El 408 (time-out), 425 (demasiado pronto) y 429 (límite de peticiones) se
 * tratan como transitorios porque pueden resolverse reintentando después.
 */
export class ErrorRemoto extends Error {
  readonly estado: number
  readonly definitivo: boolean

  constructor(mensaje: string, estado = 0) {
    super(mensaje)
    this.name = 'ErrorRemoto'
    this.estado = estado
    const transitorio = estado === 408 || estado === 425 || estado === 429
    this.definitivo = estado >= 400 && estado < 500 && !transitorio
  }
}

async function llamar(
  accion: string,
  cuerpo?: unknown,
  query?: Record<string, string | number>,
  requiereLlave = true,
): Promise<unknown> {
  if (!supabaseDisponible()) {
    throw new Error('Supabase no está configurado. Revise las variables de entorno.')
  }
  const llave = obtenerLlave()
  if (requiereLlave && !llave) {
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
    throw new ErrorRemoto(mensaje, respuesta.status)
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
 * Descarga las filas de todas las tablas. Si se pasa `desde` (epoch ms), solo
 * las modificadas después de esa marca (descarga incremental); sin `desde`
 * se descarga la base completa (restauración).
 *
 * La respuesta trae `ahora` (reloj del servidor) para calibrar el cursor, y
 * las filas en `tablas`; por compatibilidad con el edge v11 (que respondía
 * las tablas en la raíz), si el sobre no trae `ahora`/`tablas` se asume la
 * forma antigua.
 */
export async function descargarRemoto(desde?: number): Promise<DescargaRemota> {
  const datos = await llamar('descargar', undefined, desde ? { desde } : undefined)
  if (datos == null || typeof datos !== 'object') {
    throw new Error('La nube devolvió una respuesta inesperada al descargar.')
  }
  const objeto = datos as Record<string, unknown>
  if ('tablas' in objeto && typeof objeto.tablas === 'object' && objeto.tablas !== null) {
    const ahora = Number(objeto.ahora ?? 0)
    return {
      ahora: Number.isFinite(ahora) && ahora > 0 ? ahora : 0,
      tablas: objeto.tablas as Record<string, Array<Record<string, unknown>>>,
    }
  }
  return { ahora: 0, tablas: objeto as Record<string, Array<Record<string, unknown>>> }
}

/** Sube un lote de filas de una tabla (para el outbox y "Subir todo"). */
export async function subirRemoto(tabla: TablaSync, filas: unknown[]): Promise<void> {
  if (filas.length === 0) {
    return
  }
  await llamar('subir', { tabla, filas })
}

export interface LlaveNuevaRemota {
  llave: string
  /** `true` si fue la primera llave creada (arranque de la tienda en la nube). */
  inicial: boolean
}

/**
 * Crea una llave de sincronización nueva en la nube. Sin ninguna llave aún es
 * el "arranque" (no requiere llave previa); si la tienda ya tiene llaves exige
 * una vigente y devuelve la nueva para habilitar otro dispositivo.
 */
export async function crearLlaveRemoto(nombre?: string): Promise<LlaveNuevaRemota> {
  // `crear_llave` no exige llave local: sin ninguna en la nube es el arranque
  // de la tienda (la primera llave se genera sin credencial previa).
  const datos = await llamar('crear_llave', { nombre: nombre ?? '' }, undefined, false)
  if (datos == null || typeof datos !== 'object' || typeof (datos as { llave?: unknown }).llave !== 'string') {
    throw new Error('La nube no devolvió una llave válida.')
  }
  const resultado = datos as { llave: string; inicial?: unknown }
  return { llave: resultado.llave, inicial: resultado.inicial === true }
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