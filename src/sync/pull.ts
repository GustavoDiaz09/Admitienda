import { supabaseDisponible } from '../lib/supabase'
import { descargarRemoto, subirRemoto } from '../lib/remoto'
import { db } from '../lib/db'
import { useSyncStore, refrescarPendientes } from './syncEngine'
import { vaciarOutbox } from './outbox'
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
  tablas: number
  dispositivos: Set<string>
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
 * RESTAURA este dispositivo desde la nube: reemplaza TODO el contenido
 * local (cada tabla y la cola de sincronización) con la copia remota.
 * Esta semántica es deliberada: el botón "Descargar todo de la nube" sirve
 * para poner un dispositivo al día exactamente con lo que hay en la nube
 * (p. ej. tras reinstalar la app) y evita que queden datos huérfanos o
 * duplicados locales. Solo lo dispara un administrador de forma explícita.
 */
export async function traerDatosDelServidor(): Promise<ResultadoPull> {
  const resultado: ResultadoPull = {
    recibidos: 0,
    actualizados: 0,
    tablas: 0,
    dispositivos: new Set(),
  }
  if (!supabaseDisponible()) {
    throw new Error('Supabase no está configurado. Revise las variables de entorno.')
  }
  const store = useSyncStore.getState()
  store.setError(null)

  const tablas = await descargarRemoto()
  for (const tabla of TABLAS) {
    const remotos = (tablas[tabla] ?? []) as Array<Record<string, unknown>>
    const tablaLocal = tablaDexie(tabla)
    await tablaLocal.clear()
    for (const fila of remotos) {
      const remoto = filaLocal(fila)
      resultado.recibidos++
      resultado.dispositivos.add(remoto.dispositivo)
      await tablaLocal.put(remoto as never)
      resultado.actualizados++
    }
    resultado.tablas++
  }
  await vaciarOutbox()
  await refrescarPendientes()
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