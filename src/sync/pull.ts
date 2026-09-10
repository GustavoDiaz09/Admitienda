import { supabaseDisponible } from '../lib/supabase'
import { descargarRemoto, subirRemoto } from '../lib/remoto'
import { db } from '../lib/db'
import { useSyncStore, refrescarPendientes, sincronizarAhora } from './syncEngine'
import { contarPendientes, idOutbox } from './outbox'
import type { RegistroBase, TablaSync } from '../model/types'

export const TABLAS: TablaSync[] = [
  'usuarios',
  'productos',
  'movimientos',
  'solicitudes_admin',
  'deudas',
  'pagos_deuda',
]

interface ResultadoPull {
  recibidos: number
  actualizados: number
  conflictos: number
  tablas: number
  dispositivos: Set<string>
}

/** Clave del metadato que guarda la marca desde la que se bajó la nube. */
const CLAVE_CURSOR = 'ultima_descarga'

/**
 * Marca de tiempo (epoch ms) de la última descarga exitosa. Se usa como
 * cursor incremental: solo se vuelve a bajar lo modificado después de él.
 */
export async function obtenerCursorDescarga(): Promise<number> {
  const fila = await db.metadatos.get(CLAVE_CURSOR)
  return fila ? Number(fila.valor) || 0 : 0
}

/** Persiste el cursor de descarga tras una bajada exitosa. */
export async function guardarCursorDescarga(marcaTiempo: number): Promise<void> {
  await db.metadatos.put({ clave: CLAVE_CURSOR, valor: String(marcaTiempo) })
}

/** Convierte una fila de la nube (nombres con guion bajo) a registro local. */
function filaLocal(fila: Record<string, unknown>): RegistroBase {
  const base = {
    id: String(fila.id),
    creadoEn: Number(fila.creado_en ?? 0),
    actualizadoEn: Number(fila.actualizado_en ?? 0),
    version: Number(fila.version ?? 0),
    eliminado: Boolean(fila.eliminado ?? false),
    dispositivo: String(fila.dispositivo ?? ''),
  }
  const extra: Record<string, unknown> = { ...fila }
  delete extra.id
  delete extra.creado_en
  delete extra.actualizado_en
  delete extra.version
  delete extra.eliminado
  delete extra.dispositivo
  return { ...base, ...extra } as unknown as RegistroBase
}

/** Resuelve la tabla Dexie según el nombre. */
function tablaDexie(tabla: TablaSync) {
  switch (tabla) {
    case 'usuarios':
      return db.usuarios
    case 'productos':
      return db.productos
    case 'movimientos':
      return db.movimientos
    case 'solicitudes_admin':
      return db.solicitudes_admin
    case 'deudas':
      return db.deudas
    case 'pagos_deuda':
      return db.pagos_deuda
  }
}

/**
 * Aplica las filas remotas de una tabla con "último write gana" (LWW):
 * - Si la nube tiene una versión más reciente (misma `actualizadoEn` o
 *   mayor, desempate por `version`), la versión remota reemplaza a la
 *   local y se cancela la edición local pendiente de ese registro.
 * - Si es local la más reciente, se conserva la copia local y su entrada
 *   en la cola de sincronización, para que suba en el siguiente ciclo.
 * - Un registro con la misma marca y versión lo gana la nube (fuente de
 *   verdad en empates).
 *
 * Devuelve el total de filas recibidas, las aplicadas de la nube y los
 * conflictos de unicidad local que no pudieron aplicarse.
 */
export async function aplicarRemotos(
  tabla: TablaSync,
  remotos: Array<Record<string, unknown>>,
): Promise<{ recibidos: number; actualizados: number; conflictos: number }> {
  const tablaLocal = tablaDexie(tabla)
  let recibidos = 0
  let actualizados = 0
  let conflictos = 0
  for (const fila of remotos) {
    const remoto = filaLocal(fila)
    recibidos++
    const local = await tablaLocal.get(remoto.id)
    const ganaRemoto =
      !local ||
      remoto.actualizadoEn > local.actualizadoEn ||
      (remoto.actualizadoEn === local.actualizadoEn && remoto.version >= local.version)
    if (!ganaRemoto) {
      continue
    }
    try {
      await tablaLocal.put(remoto as never)
    } catch {
      // Choque con una restricción local (p. ej. dos registros con el
      // mismo nombre de usuario): se omite la fila y se deshace lo demás.
      conflictos++
      continue
    }
    await db.outbox.delete(idOutbox(tabla, remoto.id))
    actualizados++
  }
  return { recibidos, actualizados, conflictos }
}

/**
 * Baja las filas de la nube y las fusiona con la copia local (LWW) para
 * este dispositivo. No descarta datos locales: lo que esté más reciente
 * (nube o dispositivo) se conserva, y los cambios locales pendientes que
 * sigan ganando se re-intentan al terminar.
 *
 * Por defecto es **incremental**: solo trae lo modificado después del
 * último cursor guardado. Con `{ completo: true }` se baja la base completa
 * (acción manual "Descargar todo" de un administrador).
 */
export async function traerDatosDelServidor(
  opciones: { completo?: boolean } = {},
): Promise<ResultadoPull> {
  const resultado: ResultadoPull = {
    recibidos: 0,
    actualizados: 0,
    conflictos: 0,
    tablas: 0,
    dispositivos: new Set(),
  }
  if (!supabaseDisponible()) {
    throw new Error('Supabase no está configurado. Revise las variables de entorno.')
  }
  const store = useSyncStore.getState()
  store.setError(null)

  const cursor = await obtenerCursorDescarga()
  const desde = opciones.completo || cursor === 0 ? undefined : cursor
  const inicioDeDescarga = Date.now()
  const tablas = await descargarRemoto(desde)
  for (const tabla of TABLAS) {
    const remotos = (tablas[tabla] ?? []) as Array<Record<string, unknown>>
    const aplicados = await aplicarRemotos(tabla, remotos)
    resultado.recibidos += aplicados.recibidos
    resultado.actualizados += aplicados.actualizados
    resultado.conflictos += aplicados.conflictos
    for (const fila of remotos) {
      resultado.dispositivos.add(String(fila.dispositivo ?? ''))
    }
    resultado.tablas++
  }
  // El cursor avanza a la marca de inicio de esta descarga, no a la de fin:
  // cualquier fila tocada durante la bajada queda > cursor y se repetirá en
  // el siguiente ciclo (la fusión LWW es idempotente).
  await guardarCursorDescarga(inicioDeDescarga)
  await refrescarPendientes()
  const pendientes = await contarPendientes()
  if (pendientes > 0) {
    void sincronizarAhora()
  }
  store.setUltimaSync(Date.now())
  return resultado
}

/**
 * Sube la base local completa a la nube (respaldar "a mano" al primer uso
 * en un dispositivo nuevo, para que el resto pueda descargarla). La base
 * local es limpia: no contiene registros "semilla".
 */
export async function respaldarTodoEnServidor(): Promise<{ subidos: number }> {
  if (!supabaseDisponible()) {
    throw new Error('Supabase no está configurado. Revise las variables de entorno.')
  }
  let subidos = 0
  for (const tabla of TABLAS) {
    const tablaLocal = tablaDexie(tabla)
    const registros = await tablaLocal.toArray()
    if (registros.length === 0) {
      continue
    }
    const filas = registros.map((r) => ({
      id: r.id,
      creado_en: r.creadoEn,
      actualizado_en: r.actualizadoEn,
      version: r.version,
      eliminado: r.eliminado,
      dispositivo: r.dispositivo,
      ...filaExtra(tabla, r),
    }))
    await subirRemoto(tabla, filas)
    subidos += registros.length
  }
  return { subidos }
}

/** Columnas propias de cada tabla al subir (mismo mapeo del motor). */
function filaExtra(tabla: TablaSync, r: RegistroBase): Record<string, unknown> {
  const registro = r as unknown as Record<string, unknown>
  switch (tabla) {
    case 'usuarios':
      return {
        nombre_usuario: registro.nombre_usuario,
        tipo_usuario: registro.tipo_usuario,
        contrasena_hash: registro.contrasena_hash,
        salt: registro.salt,
        indicio_usuario: registro.indicio_usuario,
        fecha_registro: registro.fecha_registro,
      }
    case 'productos':
      return {
        tipo_producto: registro.tipo_producto,
        nombre_producto: registro.nombre_producto,
        precio_neto: registro.precio_neto,
        ganancia: registro.ganancia,
        precio_venta: registro.precio_venta,
        cantidad_stock: registro.cantidad_stock,
        stock_minimo: registro.stock_minimo,
      }
    case 'movimientos':
      return {
        tipo_movimiento: registro.tipo_movimiento,
        monto: registro.monto,
        descripcion: registro.descripcion,
        fecha: registro.fecha,
      }
    case 'solicitudes_admin':
      return {
        usuario_id: registro.usuario_id,
        estado: registro.estado,
        fecha_solicitud: registro.fecha_solicitud,
      }
    case 'deudas':
      return {
        cliente_nombre: registro.cliente_nombre,
        monto: registro.monto,
        saldo: registro.saldo,
        descripcion: registro.descripcion,
        fecha: registro.fecha,
      }
    case 'pagos_deuda':
      return {
        deuda_id: registro.deuda_id,
        monto: registro.monto,
        descripcion: registro.descripcion,
        fecha: registro.fecha,
      }
  }
}