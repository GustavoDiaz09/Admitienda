import { db } from '../lib/db'
import type { ItemOutbox, RegistroBase, TablaSync } from '../model/types'

/** Clave compuesta única de la cola por (tabla, registro). */
export function idOutbox(tabla: TablaSync, registroId: string): string {
  return `${tabla}:${registroId}`
}

/**
 * Encola un registro en la cola de sincronización (outbox). Al estar
 * claveado por (tabla, id), cada registro tiene una sola entrada
 * pendiente: si se vuelve a modificar, se reemplaza la última versión
 * y se reinician los reintentos (la versión nueva merece otro intento).
 */
export async function encolar(tabla: TablaSync, registro: RegistroBase): Promise<void> {
  const existe = await db.outbox.get(idOutbox(tabla, registro.id))
  await db.outbox.put({
    id: idOutbox(tabla, registro.id),
    tabla,
    registro,
    encoladoEn: existe ? existe.encoladoEn : Date.now(),
    intentos: 0,
  })
}

/** Cantidad de cambios pendientes por subir. */
export async function contarPendientes(): Promise<number> {
  return db.outbox.count()
}

/** Lista los cambios pendientes en orden de antigüedad. */
export async function listarPendientes(): Promise<ItemOutbox[]> {
  return db.outbox.orderBy('encoladoEn').toArray()
}

/**
 * Elimina una entrada de la cola SOLO si sigue conteniendo la versión que
 * acaba de subirse. Si el registro fue modificado de nuevo mientras se
 * subía, la cola conserva la versión nueva (evita perder el cambio).
 */
export async function eliminarItemSiSigueIgual(item: ItemOutbox): Promise<boolean> {
  const actual = await db.outbox.get(item.id)
  if (!actual) {
    return true
  }
  const subida = item.registro
  const enCola = actual.registro
  if (enCola.actualizadoEn === subida.actualizadoEn && enCola.version === subida.version) {
    await db.outbox.delete(item.id)
    return true
  }
  return false
}

/** Marca un intento fallido en la entrada (para evitar reintentos infinitos). */
export async function marcarIntento(item: ItemOutbox): Promise<void> {
  await db.outbox.update(item.id, { intentos: item.intentos + 1, ultimoIntento: Date.now() })
}

/**
 * Reaplica un reintento a una entrada que quedó con el máximo de intentos.
 * Se combina con un período de espera para no saturar al servidor.
 */
export async function reiniciarIntento(item: ItemOutbox): Promise<void> {
  await db.outbox.update(item.id, { intentos: 0 })
}

/** Vacía toda la cola de sincronización (uso en la restauración desde la nube). */
export async function vaciarOutbox(): Promise<void> {
  await db.outbox.clear()
}