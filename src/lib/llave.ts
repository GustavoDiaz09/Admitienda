/**
 * Llave de sincronización de este dispositivo. Se configura una vez por
 * dispositivo (solo la ve quien la posee) y es la credencial que la Edge
 * Function `sync` valida en cada llamada (PBKDF2 del lado del servidor).
 */

const CLAVE_ALMACEN = 'sistematienda.llave'

/** Devuelve la llave guardada (vacía si aún no se configuró). */
export function obtenerLlave(): string {
  try {
    return window.localStorage.getItem(CLAVE_ALMACEN) ?? ''
  } catch {
    return ''
  }
}

/** Guarda (o elimina si viene vacía) la llave de este dispositivo. */
export function guardarLlave(llave: string): void {
  const limpia = llave.trim()
  try {
    if (limpia) {
      window.localStorage.setItem(CLAVE_ALMACEN, limpia)
    } else {
      window.localStorage.removeItem(CLAVE_ALMACEN)
    }
  } catch {
    // Sin almacenamiento disponible: la sincronización quedará sin llave.
  }
}

/** Indica si este dispositivo ya tiene llave de sincronización. */
export function hayLlaveConfigurada(): boolean {
  return obtenerLlave() !== ''
}

const PARAMETRO_LLAVE = 'llave'

/**
 * Extrae una llave pasada por la URL (`?llave=...`); vacía si no viene.
 * Permite enrolar un dispositivo con solo abrir un enlace (p. ej. un QR).
 */
export function extraerLlaveDeUrl(url: string): string {
  try {
    return (new URL(url).searchParams.get(PARAMETRO_LLAVE) ?? '').trim()
  } catch {
    return ''
  }
}

/** Crea el enlace para enrolar otro dispositivo con una llave dada. */
export function enlaceDeLlave(llave: string): string {
  const url = new URL('/', window.location.origin)
  url.searchParams.set(PARAMETRO_LLAVE, llave)
  return url.toString()
}

/** Quita el parámetro `llave` de la URL sin recargar la página. */
export function limpiarLlaveDeUrl(): void {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(PARAMETRO_LLAVE)) return
    url.searchParams.delete(PARAMETRO_LLAVE)
    window.history.replaceState(null, '', url.toString())
  } catch {
    // Sin acceso a la URL (entorno sin navegador): nada que limpiar.
  }
}