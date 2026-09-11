import Dexie, { type Table } from 'dexie'
import type {
  Deuda,
  Deudor,
  ItemOutbox,
  Metadato,
  Movimiento,
  PagoDeuda,
  Producto,
  SolicitudAdmin,
  Usuario,
} from '../model/types'
import { normalizarNombreCliente } from './validaciones'

/**
 * Base de datos local (IndexedDB vía Dexie) que replica el esquema SQLite
 * del sistema de escritorio original. Todas las lecturas de la aplicación
 * se hacen aquí; Supabase se utiliza únicamente como repositorio de respaldo
 * y sincronización.
 */
export class TiendaDatabase extends Dexie {
  usuarios!: Table<Usuario, string>
  productos!: Table<Producto, string>
  movimientos!: Table<Movimiento, string>
  solicitudes_admin!: Table<SolicitudAdmin, string>
  deudores!: Table<Deudor, string>
  deudas!: Table<Deuda, string>
  pagos_deuda!: Table<PagoDeuda, string>
  outbox!: Table<ItemOutbox, string>
  metadatos!: Table<Metadato, string>

  constructor() {
    super('sistematienda')
    this.version(1).stores({
      usuarios: 'id, nombre_usuario, actualizadoEn',
      productos: 'id, nombre_producto, tipo_producto, actualizadoEn',
      movimientos: 'id, tipo_movimiento, fecha, actualizadoEn',
      solicitudes_admin: 'id, usuario_id, estado, actualizadoEn',
      outbox: 'id, tabla, encoladoEn',
      metadatos: 'clave',
    })
    // v2: módulo de deudas y pagos (CRM de ventas fiadas).
    this.version(2).stores({
      usuarios: 'id, nombre_usuario, actualizadoEn',
      productos: 'id, nombre_producto, tipo_producto, actualizadoEn',
      movimientos: 'id, tipo_movimiento, fecha, actualizadoEn',
      solicitudes_admin: 'id, usuario_id, estado, actualizadoEn',
      deudas: 'id, cliente_nombre, actualizadoEn',
      pagos_deuda: 'id, deuda_id, actualizadoEn',
      outbox: 'id, tabla, encoladoEn',
      metadatos: 'clave',
    })
    // v3: el nombre de usuario es único dentro del dispositivo (misma
    // regla que la nube, donde el índice lower(nombre_usuario) es UNIQUE).
    this.version(3).stores({
      usuarios: 'id, &nombre_usuario, actualizadoEn',
      productos: 'id, nombre_producto, tipo_producto, actualizadoEn',
      movimientos: 'id, tipo_movimiento, fecha, actualizadoEn',
      solicitudes_admin: 'id, usuario_id, estado, actualizadoEn',
      deudas: 'id, cliente_nombre, actualizadoEn',
      pagos_deuda: 'id, deuda_id, actualizadoEn',
      outbox: 'id, tabla, encoladoEn',
      metadatos: 'clave',
    })
    // v4: deudores maestros (un solo registro por nombre normalizado) y
    // enlace deudor_id en deudas. La migración crea los deudores a partir
    // de los clientes ya registrados y rellena el deudor_id de las deudas.
    this.version(4)
      .stores({
        usuarios: 'id, &nombre_usuario, actualizadoEn',
        productos: 'id, nombre_producto, tipo_producto, actualizadoEn',
        movimientos: 'id, tipo_movimiento, fecha, actualizadoEn',
        solicitudes_admin: 'id, usuario_id, estado, actualizadoEn',
        deudores: 'id, &nombre_normalizado, actualizadoEn',
        deudas: 'id, cliente_nombre, deudor_id, actualizadoEn',
        pagos_deuda: 'id, deuda_id, actualizadoEn',
        outbox: 'id, tabla, encoladoEn',
        metadatos: 'clave',
      })
      .upgrade(async (tx) => {
        const deudas = await tx.table('deudas').toArray()
        const deudores = new Map<string, { id: string; nombre: string; dispositivo: string }>()
        const ahora = Date.now()
        const outbox = tx.table('outbox')
        for (const deuda of deudas) {
          const normalizado = normalizarNombreCliente(deuda.cliente_nombre)
          if (!normalizado) {
            continue
          }
          const existente = deudores.get(normalizado)
          if (existente) {
            await tx.table('deudas').update(deuda.id, { deudor_id: existente.id })
            await outbox.put({
              id: `deudas:${deuda.id}`,
              tabla: 'deudas',
              registro: { ...deuda, deudor_id: existente.id },
              encoladoEn: ahora,
              intentos: 0,
            })
            continue
          }
          const id = crypto.randomUUID()
          const deudor = { id, nombre: deuda.cliente_nombre.trim(), dispositivo: deuda.dispositivo }
          deudores.set(normalizado, deudor)
          const registroDeudor = {
            id,
            nombre_deudor: deudor.nombre,
            nombre_normalizado: normalizado,
            creadoEn: ahora,
            actualizadoEn: ahora,
            version: 1,
            eliminado: false,
            dispositivo: deudor.dispositivo,
          }
          await tx.table('deudores').add(registroDeudor)
          await outbox.put({
            id: `deudores:${id}`,
            tabla: 'deudores',
            registro: registroDeudor,
            encoladoEn: ahora,
            intentos: 0,
          })
          await tx.table('deudas').update(deuda.id, { deudor_id: id })
          await outbox.put({
            id: `deudas:${deuda.id}`,
            tabla: 'deudas',
            registro: { ...deuda, deudor_id: id },
            encoladoEn: ahora,
            intentos: 0,
          })
        }
      })
  }
}

export const db = new TiendaDatabase()

/** Formato de fecha local usado para persistir movimientos y solicitudes. */
export const FMT_FECHA = 'yyyy-MM-dd HH:mm'