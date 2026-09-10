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