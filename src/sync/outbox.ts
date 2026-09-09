import { db } from '../lib/db'
import type { ItemOutbox, RegistroBase, TablaSync } from '../model/types'

/** Clave compuesta única de la cola por (tabla, registro). */
export function idOutbox(tabla: TablaSync, registroId: string): string {
  return `${tabla}:${registroId}`
}

/**
 * Encola un registro en la cola de sincronización (outbox). Al estar
 * claveado por (tabla, id), cada registro tiene una sola entrada
 * pendiente: si se vuelve a modificar, se reemplaza la última versión.
 */
export async function encolar(tabla: TablaSync, registro: RegistroBase): Promise<void> {
  const existe = await db.outbox.get(idOutbox(tabla, registro.id))
  await db.outbox.put({
    id: idOutbox(tabla, registro.id),
    tabla,
    registro,
    encoladoEn: existe ? existe.encoladoEn : Date.now(),
    intentos: existe ? existe.intentos : 0,
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

/** Elimina una entrada de la cola tras sincronizarse con éxito. */
export async function eliminarItem(item: ItemOutbox): Promise<void> {
  await db.outbox.delete(item.id)
}

/** Marca un intento fallido en la entrada (para evitar reintentos infinitos). */
export async function marcarIntento(item: ItemOutbox): Promise<void> {
  await db.outbox.update(item.id, { intentos: item.intentos + 1 })
}

/** Vacía toda la cola de sincronización (uso en la restauración desde la nube). */
export async function vaciarOutbox(): Promise<void> {
  await db.outbox.clear()
}