import { avisarError } from './toast'

/** Umbral (% de la cuota) a partir del cual se avisa del riesgo de borrado. */
export const UMBRAL_CUOTA_ALERTA = 90

/** Consulta actual del uso de la cuota de almacenamiento del navegador. */
export interface InfoAlmacenamiento {
  usoBytes: number
  cuotaBytes: number
  porcentaje: number
  persistente: boolean
}

function storageDisponible(): boolean {
  return typeof navigator !== 'undefined' && 'storage' in navigator && !!navigator.storage
}

/**
 * Pide al navegador que conserve los datos de esta aplicación aunque falte
 * espacio en disco (Chrome/Edge/Android). Es una solicitud de buena fe: si
 * el navegador la deniega la app sigue funcionando igual.
 */
export async function solicitarPersistencia(): Promise<boolean> {
  if (!storageDisponible()) {
    return false
  }
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Uso actual de la cuota de almacenamiento, o null si no es consultable. */
export async function obtenerInfoAlmacenamiento(): Promise<InfoAlmacenamiento | null> {
  if (!storageDisponible()) {
    return null
  }
  try {
    const datos = await navigator.storage.estimate()
    const { usage } = datos
    const { quota } = datos
    if (typeof usage !== 'number' || typeof quota !== 'number' || quota <= 0) {
      return null
    }
    const persistente = await navigator.storage.persisted()
    return {
      usoBytes: usage,
      cuotaBytes: quota,
      porcentaje: Math.round((usage / quota) * 100),
      persistente: !!persistente,
    }
  } catch {
    return null
  }
}

let avisoDeCuotaMostrado = false

/**
 * Revisa la cuota y, si está cerca del límite, dispara un aviso una sola vez
 * por sesión. Devuelve la información al vuelo para pintarla en la interfaz.
 */
export async function revisarCuotaDeAlmacenamiento(): Promise<InfoAlmacenamiento | null> {
  const info = await obtenerInfoAlmacenamiento()
  if (info && info.porcentaje >= UMBRAL_CUOTA_ALERTA && !avisoDeCuotaMostrado) {
    avisoDeCuotaMostrado = true
    avisarError(
      'Almacenamiento casi lleno (90% o más): haga un respaldo en la nube y ' +
        'libere espacio, o el navegador podría borrar los datos de la tienda.',
    )
  }
  return info
}

/** Formato legible de una cantidad de bytes, p. ej. `12,0 MB`. */
export function formatearBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }
  const unidades = ['B', 'KB', 'MB', 'GB']
  const indice = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), unidades.length - 1)
  const valor = bytes / 1024 ** indice
  const formateado = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: indice === 0 ? 0 : 1,
    maximumFractionDigits: indice === 0 ? 0 : 1,
  }).format(valor)
  return `${formateado} ${unidades[indice]}`
}