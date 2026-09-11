import { db } from '../lib/db'
import { nuevoRegistro, type ContextoEscritura } from '../lib/mutaciones'
import type { Deudor, RegistroBase } from '../model/types'

/**
 * Acceso a datos de deudores (cartera única por nombre normalizado).
 * Una sola entidad por cliente: repetir el nombre (aunque difiera en
 * mayúsculas o espacios) reutiliza la misma, para que todo su historial
 * quede agrupado.
 */
export class DeudorDao {
  /** Crea un deudor nuevo y lo encola para sincronizar. */
  async insertar(
    datos: Omit<Deudor, keyof RegistroBase>,
    contexto?: ContextoEscritura,
  ): Promise<Deudor> {
    return nuevoRegistro('deudores', datos, contexto)
  }

  /** Busca un deudor activo por su nombre normalizado (identidad única). */
  async buscarPorNombreNormalizado(nombreNormalizado: string): Promise<Deudor | undefined> {
    const deudor = await db.deudores.where('nombre_normalizado').equals(nombreNormalizado).first()
    return deudor && !deudor.eliminado ? deudor : undefined
  }

  /** Busca un deudor activo por su id. */
  async buscarPorId(idDeudor: string): Promise<Deudor | undefined> {
    const deudor = await db.deudores.get(idDeudor)
    return deudor && !deudor.eliminado ? deudor : undefined
  }

  /** Deudores activos ordenados por nombre. */
  async obtenerTodos(): Promise<Deudor[]> {
    const lista = await db.deudores.toArray()
    return lista
      .filter((d) => !d.eliminado)
      .sort((a, b) => a.nombre_deudor.localeCompare(b.nombre_deudor))
  }
}