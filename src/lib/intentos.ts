/**
 * Protección contra fuerza bruta con backoff exponencial por nombre de
 * usuario, persistido en `localStorage`. Tras un límite de fallos, el nombre
 * queda bloqueado durante una espera que se duplica por cada fallo adicional
 * (con tope de 24 h); al acertar, el registro se limpia.
 *
 * Cada flujo sensible usa un "marco" de bloqueo independiente (mismo backoff,
 * claves distintas): `indicio` (palabras de seguridad) y `login` (contraseña).
 */
export const MAX_INTENTOS_FALLIDOS = 5

/** Espera base del backoff exponencial (tras el fallo que cruza el límite). */
export const ESPERA_INICIAL_MS = 30_000

/** Tope de la espera de bloqueo (evita esperas eternas). */
export const ESPERA_MAXIMA_MS = 24 * 60 * 60 * 1000

/** Flujo protegido por el backoff. Cada uno tiene sus propias claves. */
export type MarcoBloqueo = 'indicio' | 'login'

/** Estado actual del bloqueo de un marco para un nombre de usuario. */
export interface EstadoBloqueo {
  bloqueado: boolean
  esperaRestanteMs: number
  fallos: number
}

interface RegistroIntentos {
  fallos: number
  bloqueadoHasta: number
}

function claveDe(marco: MarcoBloqueo, nombre: string): string {
  return `${marco}:bloqueo:${nombre.trim().toLowerCase()}`
}

function leerRegistro(marco: MarcoBloqueo, nombre: string): RegistroIntentos {
  try {
    const crudo = window.localStorage.getItem(claveDe(marco, nombre))
    if (!crudo) {
      return { fallos: 0, bloqueadoHasta: 0 }
    }
    const datos = JSON.parse(crudo) as Partial<RegistroIntentos>
    return {
      fallos: Number(datos.fallos) || 0,
      bloqueadoHasta: Number(datos.bloqueadoHasta) || 0,
    }
  } catch {
    return { fallos: 0, bloqueadoHasta: 0 }
  }
}

function guardarRegistro(marco: MarcoBloqueo, nombre: string, registro: RegistroIntentos): void {
  try {
    window.localStorage.setItem(claveDe(marco, nombre), JSON.stringify(registro))
  } catch {
    // Sin almacenamiento no hay backoff; la app sigue funcionando.
  }
}

/** Estado de bloqueo de un flujo para un nombre de usuario. */
export function consultarBloqueo(marco: MarcoBloqueo, nombre: string): EstadoBloqueo {
  const registro = leerRegistro(marco, nombre)
  const ahora = Date.now()
  if (registro.bloqueadoHasta > ahora) {
    return { bloqueado: true, esperaRestanteMs: registro.bloqueadoHasta - ahora, fallos: registro.fallos }
  }
  if (registro.bloqueadoHasta > 0) {
    try {
      window.localStorage.removeItem(claveDe(marco, nombre))
    } catch {
      // Sin almacenamiento: no hay nada que limpiar.
    }
    return { bloqueado: false, esperaRestanteMs: 0, fallos: 0 }
  }
  return { bloqueado: false, esperaRestanteMs: 0, fallos: registro.fallos }
}

/**
 * Registra un fallo del flujo y devuelve el estado resultante. Los fallos
 * cuentan por nombre de usuario y marco; al cruzar el límite se activa una
 * espera que se duplica por cada fallo adicional, hasta el tope de 24 h.
 */
export function registrarFallo(marco: MarcoBloqueo, nombre: string): EstadoBloqueo {
  const registro = leerRegistro(marco, nombre)
  const fallos = registro.fallos + 1
  let bloqueadoHasta = registro.bloqueadoHasta
  if (fallos >= MAX_INTENTOS_FALLIDOS) {
    const exceso = fallos - MAX_INTENTOS_FALLIDOS
    const espera = Math.min(ESPERA_INICIAL_MS * 2 ** exceso, ESPERA_MAXIMA_MS)
    bloqueadoHasta = Date.now() + espera
  }
  guardarRegistro(marco, nombre, { fallos, bloqueadoHasta })
  return consultarBloqueo(marco, nombre)
}

/** Limpia el registro de un nombre tras acertar la verificación del flujo. */
export function limpiarBloqueo(marco: MarcoBloqueo, nombre: string): void {
  try {
    window.localStorage.removeItem(claveDe(marco, nombre))
  } catch {
    // Sin almacenamiento: no hay nada que limpiar.
  }
}

// ---- API específica del indicio (sin cambios para los consumidores previos).

/** Estado de bloqueo del indicio para un nombre de usuario. */
export function estadoBloqueo(nombre: string): EstadoBloqueo {
  return consultarBloqueo('indicio', nombre)
}

/** Registra un fallo del indicio y devuelve el estado resultante. */
export function registrarFalloDeIndicio(nombre: string): EstadoBloqueo {
  return registrarFallo('indicio', nombre)
}

/** Limpia el registro del indicio tras verificarlo correctamente. */
export function registrarIndicioCorrecto(nombre: string): void {
  limpiarBloqueo('indicio', nombre)
}

/** Formato legible de una espera, p. ej. `3 minutos` o `1 hora 5 minutos`. */
export function formatearEspera(esperaMs: number): string {
  const totalSegundos = Math.ceil(esperaMs / 1000)
  if (totalSegundos < 60) {
    return `${totalSegundos} ${totalSegundos === 1 ? 'segundo' : 'segundos'}`
  }
  const horas = Math.floor(totalSegundos / 3600)
  const minutos = Math.round((totalSegundos % 3600) / 60)
  const partes: string[] = []
  if (horas > 0) {
    partes.push(`${horas} ${horas === 1 ? 'hora' : 'horas'}`)
  }
  if (minutos > 0) {
    partes.push(`${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`)
  }
  return partes.join(' ') || 'menos de un minuto'
}