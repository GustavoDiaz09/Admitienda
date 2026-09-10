import { type Movimiento, type TipoMovimiento } from '../model/types'
import { MovimientoDao } from '../dao/MovimientoDao'
import { Resultado } from './Resultado'
import { aDouble, acumularErrores, montoPositivo, textoNoVacio } from '../lib/validaciones'
import { formatFecha, OFFSET_COLOMBIA_MS, parseFecha } from '../lib/fecha'
import { TIPO_INGRESO, TIPO_EGRESO } from '../model/types'

/**
 * Controlador de movimientos financieros (port de
 * `tienda.controller.IngresoEgresoController`): registro, modificación,
 * eliminación, historial, totales y resúmenes semanal y mensual.
 */
export class MovimientoController {
  private readonly movimientoDao = new MovimientoDao()

  /** Registra un ingreso o egreso nuevo. */
  async nuevoMovimiento(
    tipoMovimiento: string,
    monto: string,
    descripcion: string,
  ): Promise<Resultado> {
    const errores = this.validarMovimiento(tipoMovimiento, monto, descripcion)
    if (errores.length > 0) {
      return Resultado.error(errores.join('\n'))
    }
    const movimiento = await this.movimientoDao.insertar({
      tipo_movimiento: tipoMovimiento.toUpperCase() as TipoMovimiento,
      monto: aDouble(monto),
      descripcion: descripcion.trim(),
      fecha: formatFecha(new Date()),
    })
    const etiqueta = TIPO_INGRESO === movimiento.tipo_movimiento ? 'Ingreso' : 'Egreso'
    return Resultado.exito(`${etiqueta} registrado correctamente.`)
  }

  /** Modifica un movimiento existente. */
  async modificarMovimiento(
    movimiento: Movimiento,
    tipoMovimiento: string,
    monto: string,
    descripcion: string,
  ): Promise<Resultado> {
    const errores = this.validarMovimiento(tipoMovimiento, monto, descripcion)
    if (errores.length > 0) {
      return Resultado.error(errores.join('\n'))
    }
    await this.movimientoDao.actualizar({
      ...movimiento,
      tipo_movimiento: tipoMovimiento.toUpperCase() as TipoMovimiento,
      monto: aDouble(monto),
      descripcion: descripcion.trim(),
    })
    return Resultado.exito('Movimiento modificado correctamente.')
  }

  /** Elimina un movimiento (borrado lógico). */
  async eliminarMovimiento(idDeRegistro: string): Promise<Resultado> {
    await this.movimientoDao.eliminar(idDeRegistro)
    return Resultado.exito('Movimiento eliminado correctamente.')
  }

  /** Devuelve el historial completo de ingresos y egresos. */
  async obtenerHistorial(): Promise<Movimiento[]> {
    return this.movimientoDao.obtenerTodos()
  }

  /** Suma de todos los ingresos. */
  async totalIngresos(): Promise<number> {
    const movimientos = await this.movimientoDao.obtenerTodos()
    return movimientos
      .filter((m) => m.tipo_movimiento === TIPO_INGRESO)
      .reduce((acc, m) => acc + m.monto, 0)
  }

  /** Suma de todos los egresos. */
  async totalEgresos(): Promise<number> {
    const movimientos = await this.movimientoDao.obtenerTodos()
    return movimientos
      .filter((m) => m.tipo_movimiento !== TIPO_INGRESO)
      .reduce((acc, m) => acc + m.monto, 0)
  }

  /** Monto con signo: positivo para ingresos, negativo para egresos. */
  montoConSigno(m: Movimiento): number {
    return m.tipo_movimiento === TIPO_INGRESO ? m.monto : -m.monto
  }

  /** Resumen de la semana actual: clave 1..7 (lunes a domingo) -> saldo neto. */
  async obtenerResumenSemanal(): Promise<Map<number, number>> {
    // El calendario se calcula en hora de Colombia, no en la del dispositivo.
    const ahoraCol = new Date(Date.now() - OFFSET_COLOMBIA_MS)
    const diaSemanaCol = (ahoraCol.getUTCDay() + 6) % 7
    const lunes = new Date(
      Date.UTC(
        ahoraCol.getUTCFullYear(),
        ahoraCol.getUTCMonth(),
        ahoraCol.getUTCDate() - diaSemanaCol,
      ) + OFFSET_COLOMBIA_MS,
    )
    const lunesProximo = new Date(lunes.getTime() + 7 * 86_400_000)

    const resumen = new Map<number, number>()
    for (let dia = 1; dia <= 7; dia++) {
      resumen.set(dia, 0)
    }
    const movimientos = await this.movimientoDao.obtenerTodos()
    for (const m of movimientos) {
      const instante = parseFecha(m.fecha)
      if (instante >= lunes && instante < lunesProximo) {
        const enColombia = new Date(instante.getTime() - OFFSET_COLOMBIA_MS)
        const diaDeLaSemana = (enColombia.getUTCDay() + 6) % 7 + 1
        resumen.set(diaDeLaSemana, (resumen.get(diaDeLaSemana) ?? 0) + this.montoConSigno(m))
      }
    }
    return resumen
  }

  /** Resumen del año actual: clave 1..12 (mes) -> saldo neto. */
  async obtenerResumenMensual(): Promise<Map<number, number>> {
    const anioCol = new Date(Date.now() - OFFSET_COLOMBIA_MS).getUTCFullYear()
    const resumen = new Map<number, number>()
    for (let mes = 1; mes <= 12; mes++) {
      resumen.set(mes, 0)
    }
    const movimientos = await this.movimientoDao.obtenerTodos()
    for (const m of movimientos) {
      const enColombia = new Date(parseFecha(m.fecha).getTime() - OFFSET_COLOMBIA_MS)
      if (enColombia.getUTCFullYear() === anioCol) {
        const mes = enColombia.getUTCMonth() + 1
        resumen.set(mes, (resumen.get(mes) ?? 0) + this.montoConSigno(m))
      }
    }
    return resumen
  }

  /** Valida los campos del formulario de movimiento. */
  private validarMovimiento(tipo: string, monto: string, descripcion: string): string[] {
    const errores: string[] = []
    const tipoValido = TIPO_INGRESO === tipo.toUpperCase() || TIPO_EGRESO === tipo.toUpperCase()
    if (!tipoValido) {
      errores.push('Debe elegir un tipo de movimiento (ingreso o egreso).')
    }
    acumularErrores(errores, montoPositivo(monto, 'monto'))
    acumularErrores(errores, textoNoVacio(descripcion, 'descripción'))
    return errores
  }
}