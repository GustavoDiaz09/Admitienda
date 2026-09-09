import { type Table } from 'dexie'
import { db } from './db'
import { obtenerDispositivoId } from '../sync/dispositivo'
import { encolar } from '../sync/outbox'
import type { RegistroBase, TablaSync } from '../model/types'

/**
 * Operaciones de escritura genéricas sobre las tablas locales. Cada una:
 * 1. Sella el registro con marcas de tiempo, versión, dispositivo y estado.
 * 2. Escribe en IndexedDB (fuente de lectura de la aplicación).
 * 3. Encola el cambio en la cola de sincronización (outbox) para subirlo
 *    a Supabase cuando haya conexión.
 */

/** Resuelve la tabla Dexie correspondiente a un nombre de tabla. */
function tablaDe(tabla: TablaSync): Table<RegistroBase, string> {
  switch (tabla) {
    case 'usuarios':
      return db.usuarios as Table<RegistroBase, string>
    case 'productos':
      return db.productos as Table<RegistroBase, string>
    case 'movimientos':
      return db.movimientos as Table<RegistroBase, string>
    case 'solicitudes_admin':
      return db.solicitudes_admin as Table<RegistroBase, string>
  }
}

/** Crea un registro nuevo en estado NO eliminado y lo encola. */
export async function nuevoRegistro<T extends RegistroBase>(
  tabla: TablaSync,
  datos: Omit<T, keyof RegistroBase> & { id?: string },
): Promise<T> {
  const ahora = Date.now()
  const dispositivo = await obtenerDispositivoId()
  const registro = {
    id: datos.id ?? crypto.randomUUID(),
    creadoEn: ahora,
    actualizadoEn: ahora,
    version: 1,
    eliminado: false,
    dispositivo,
    ...datos,
  } as T
  await tablaDe(tabla).put(registro)
  await encolar(tabla, registro)
  return registro
}

/** Actualiza un registro existente, incrementando versión y encolando. */
export async function actualizarRegistro<T extends RegistroBase>(
  tabla: TablaSync,
  registro: T,
): Promise<T> {
  const actualizado = {
    ...registro,
    actualizadoEn: Date.now(),
    version: registro.version + 1,
    dispositivo: await obtenerDispositivoId(),
  }
  await tablaDe(tabla).put(actualizado)
  await encolar(tabla, actualizado)
  return actualizado
}

/** Borrado lógico (tumba) de un registro: propaga la baja vía sync. */
export async function eliminarRegistro<T extends RegistroBase>(
  tabla: TablaSync,
  registro: T,
): Promise<T> {
  const actualizado = {
    ...registro,
    actualizadoEn: Date.now(),
    version: registro.version + 1,
    eliminado: true,
    dispositivo: await obtenerDispositivoId(),
  }
  await tablaDe(tabla).put(actualizado)
  await encolar(tabla, actualizado)
  return actualizado
}