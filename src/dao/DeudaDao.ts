import { db } from '../lib/db'
import { actualizarRegistro, eliminarRegistro, nuevoRegistro, type ContextoEscritura } from '../lib/mutaciones'
import type { Deuda, RegistroBase } from '../model/types'

/** Datos de una deuda nueva antes de sellar el registro (saldo = monto). */
type DatosDeudaNueva = Omit<Deuda, keyof RegistroBase | 'saldo'>

/**
 * Acceso a datos de deudas de clientes (CRM de ventas fiadas).
 */
export class DeudaDao {
  /** Crea una deuda nueva (monto = saldo inicial) y la encola para sync. */
  async insertar(datos: DatosDeudaNueva, contexto?: ContextoEscritura): Promise<Deuda> {
    return nuevoRegistro('deudas', { ...datos, saldo: datos.monto }, contexto)
  }

  /** Modifica una deuda existente y encola el cambio. */
  async actualizar(deuda: Deuda, contexto?: ContextoEscritura): Promise<Deuda> {
    return actualizarRegistro('deudas', deuda, contexto)
  }

  /** Borrado lógico de una deuda (se propaga vía sincronización). */
  async eliminar(idDeRegistro: string, contexto?: ContextoEscritura): Promise<void> {
    const deuda = await this.buscarPorId(idDeRegistro)
    if (deuda) {
      await eliminarRegistro('deudas', deuda, contexto)
    }
  }

  /** Busca una deuda activa por su id. */
  async buscarPorId(idDeRegistro: string): Promise<Deuda | undefined> {
    const deuda = await db.deudas.get(idDeRegistro)
    return deuda && !deuda.eliminado ? deuda : undefined
  }

  /** Devuelve las deudas activas ordenadas de más reciente a más antigua. */
  async obtenerTodas(): Promise<Deuda[]> {
    const lista = await db.deudas.toArray()
    return lista
      .filter((d) => !d.eliminado)
      .sort((a, b) => {
        const porFecha = b.fecha.localeCompare(a.fecha)
        return porFecha !== 0 ? porFecha : b.actualizadoEn - a.actualizadoEn
      })
  }
}