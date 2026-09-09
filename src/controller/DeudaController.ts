import type { Deuda, PagoDeuda } from '../model/types'
import { DeudaDao } from '../dao/DeudaDao'
import { PagoDeudaDao } from '../dao/PagoDeudaDao'
import { MovimientoDao } from '../dao/MovimientoDao'
import { Resultado } from './Resultado'
import { aDouble, acumularErrores, montoPositivo, textoNoVacio } from '../lib/validaciones'
import { formatFecha } from '../lib/fecha'
import { moneda } from '../lib/formato'
import { TIPO_INGRESO } from '../model/types'

/**
 * Controlador del CRM de deudas: registro de ventas fiadas y sus abonos.
 * Cada abono registra además un ingreso en la caja (movimientos).
 */
export class DeudaController {
  private readonly deudaDao = new DeudaDao()
  private readonly pagoDao = new PagoDeudaDao()
  private readonly movimientoDao = new MovimientoDao()

  /** Registra una deuda nueva de un cliente (venta fiada). */
  async registrarDeuda(
    clienteNombre: string,
    monto: string,
    descripcion: string,
  ): Promise<Resultado> {
    const errores: string[] = []
    acumularErrores(errores, textoNoVacio(clienteNombre, 'cliente'))
    acumularErrores(errores, montoPositivo(monto, 'monto'))
    acumularErrores(errores, textoNoVacio(descripcion, 'descripción'))
    if (errores.length > 0 || aDouble(monto) <= 0) {
      if (errores.length === 0) {
        errores.push('El monto de la deuda debe ser mayor a 0.')
      }
      return Resultado.error(errores.join('\n'))
    }
    await this.deudaDao.insertar({
      cliente_nombre: clienteNombre.trim(),
      monto: aDouble(monto),
      descripcion: descripcion.trim(),
      fecha: formatFecha(new Date()),
    })
    return Resultado.exito('Deuda registrada correctamente.')
  }

  /**
   * Aplica un abono a una deuda: descuenta el saldo y registra un ingreso
   * en la caja (movimiento) por el mismo monto.
   */
  async registrarAbono(
    idDeDeuda: string,
    monto: string,
    descripcion: string,
  ): Promise<Resultado> {
    const deuda = await this.deudaDao.buscarPorId(idDeDeuda)
    if (!deuda) {
      return Resultado.error('La deuda no existe o ya fue eliminada.')
    }
    const errores: string[] = []
    acumularErrores(errores, montoPositivo(monto, 'monto'))
    if (deuda.saldo <= 0) {
      errores.push('Esta deuda ya está saldada.')
    }
    const montoAbono = aDouble(monto)
    if (errores.length === 0 && montoAbono <= 0) {
      errores.push('El abono debe ser mayor a 0.')
    }
    if (errores.length === 0 && montoAbono > deuda.saldo) {
      errores.push(`El abono supera el saldo pendiente (${moneda(deuda.saldo)}).`)
    }
    if (errores.length > 0) {
      return Resultado.error(errores.join('\n'))
    }

    const nuevoSaldo = deuda.saldo - montoAbono
    const fecha = formatFecha(new Date())

    await this.pagoDao.insertar({
      deuda_id: deuda.id,
      monto: montoAbono,
      descripcion: (descripcion.trim() || 'Abono a cuenta').trim(),
      fecha,
    })
    await this.deudaDao.actualizar({ ...deuda, saldo: nuevoSaldo })
    await this.movimientoDao.insertar({
      tipo_movimiento: TIPO_INGRESO,
      monto: montoAbono,
      descripcion: `Pago de deuda de ${deuda.cliente_nombre}${descripcion.trim() ? `: ${descripcion.trim()}` : ''}`,
      fecha,
    })

    const texto = nuevoSaldo <= 0 ? 'y la deuda quedó saldada.' : `. Saldo pendiente: ${moneda(nuevoSaldo)}.`
    return Resultado.exito(`Abono de ${moneda(montoAbono)} registrado${texto}`)
  }

  /** Elimina una deuda (borrado lógico) junto con sus pagos. */
  async eliminarDeuda(idDeRegistro: string): Promise<Resultado> {
    const deuda = await this.deudaDao.buscarPorId(idDeRegistro)
    if (!deuda) {
      return Resultado.error('La deuda no existe o ya fue eliminada.')
    }
    await this.deudaDao.eliminar(idDeRegistro)
    await this.pagoDao.eliminarPorDeuda(idDeRegistro)
    return Resultado.exito('Deuda eliminada correctamente.')
  }

  /** Todas las deudas activas (de más reciente a más antigua). */
  async obtenerDeudas(): Promise<Deuda[]> {
    return this.deudaDao.obtenerTodas()
  }

  /** Pagos (abonos) de una deuda específica. */
  async obtenerPagosDeDeuda(idDeDeuda: string): Promise<PagoDeuda[]> {
    return this.pagoDao.obtenerPorDeuda(idDeDeuda)
  }

  /** Todos los pagos activos, para historiales por cliente. */
  async obtenerTodosLosPagos(): Promise<PagoDeuda[]> {
    return this.pagoDao.obtenerTodos()
  }
}