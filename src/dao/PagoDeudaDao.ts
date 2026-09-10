import { db } from '../lib/db'
import { eliminarRegistro, nuevoRegistro, type ContextoEscritura } from '../lib/mutaciones'
import type { PagoDeuda, RegistroBase } from '../model/types'

/**
 * Acceso a datos de pagos (abonos) aplicados a las deudas.
 */
export class PagoDeudaDao {
  /** Registra un abono nuevo y lo encola para sincronizar. */
  async insertar(
    datos: Omit<PagoDeuda, keyof RegistroBase>,
    contexto?: ContextoEscritura,
  ): Promise<PagoDeuda> {
    return nuevoRegistro('pagos_deuda', datos, contexto)
  }

  /** Borra lógicamente todos los pagos de una deuda (al eliminar la deuda). */
  async eliminarPorDeuda(idDeDeuda: string, contexto?: ContextoEscritura): Promise<void> {
    const pagos = await db.pagos_deuda
      .where('deuda_id')
      .equals(idDeDeuda)
      .toArray()
    for (const pago of pagos.filter((p) => !p.eliminado)) {
      await eliminarRegistro('pagos_deuda', pago, contexto)
    }
  }

  /** Pagos activos de una deuda, de más reciente a más antiguo. */
  async obtenerPorDeuda(idDeDeuda: string): Promise<PagoDeuda[]> {
    const pagos = await db.pagos_deuda.where('deuda_id').equals(idDeDeuda).toArray()
    return pagos
      .filter((p) => !p.eliminado)
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.actualizadoEn - a.actualizadoEn)
  }

  /** Todos los pagos activos (para historiales y resúmenes). */
  async obtenerTodos(): Promise<PagoDeuda[]> {
    const lista = await db.pagos_deuda.toArray()
    return lista
      .filter((p) => !p.eliminado)
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.actualizadoEn - a.actualizadoEn)
  }
}