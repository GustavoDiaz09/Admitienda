import Dexie, { type Table } from 'dexie'
import type {
  Deuda,
  ItemOutbox,
  Metadato,
  Movimiento,
  PagoDeuda,
  Producto,
  SolicitudAdmin,
  Usuario,
} from '../model/types'

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
  }
}

export const db = new TiendaDatabase()

/** Formato de fecha local usado para persistir movimientos y solicitudes. */
export const FMT_FECHA = 'yyyy-MM-dd HH:mm'