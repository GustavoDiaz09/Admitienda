import { db } from '../lib/db'
import { nuevoRegistro, actualizarRegistro, eliminarRegistro } from '../lib/mutaciones'
import type { Movimiento, RegistroBase } from '../model/types'

/**
 * Acceso a datos de movimientos financieros (port de
 * `tienda.dao.IngresoEgresoDao`).
 */
export class MovimientoDao {
  /** Registra un movimiento nuevo y lo encola para sincronizar. */
  async insertar(datos: Omit<Movimiento, keyof RegistroBase>): Promise<Movimiento> {
    return nuevoRegistro('movimientos', datos)
  }

  /** Modifica un movimiento existente y encola el cambio. */
  async actualizar(movimiento: Movimiento): Promise<Movimiento> {
    return actualizarRegistro('movimientos', movimiento)
  }

  /** Borrado lógico de un movimiento (se propaga vía sincronización). */
  async eliminar(idDeRegistro: string): Promise<void> {
    const movimiento = await this.buscarPorId(idDeRegistro)
    if (movimiento) {
      await eliminarRegistro('movimientos', movimiento)
    }
  }

  /** Busca un movimiento activo por su id. */
  async buscarPorId(idDeRegistro: string): Promise<Movimiento | undefined> {
    const movimiento = await db.movimientos.get(idDeRegistro)
    return movimiento && !movimiento.eliminado ? movimiento : undefined
  }

  /** Devuelve el historial ordenado de más reciente a más antiguo. */
  async obtenerTodos(): Promise<Movimiento[]> {
    const lista = await db.movimientos.toArray()
    return lista
      .filter((m) => !m.eliminado)
      .sort((a, b) => {
        const porFecha = b.fecha.localeCompare(a.fecha)
        return porFecha !== 0 ? porFecha : b.actualizadoEn - a.actualizadoEn
      })
  }
}