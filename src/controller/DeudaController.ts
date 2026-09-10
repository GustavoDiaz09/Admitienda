import type { Deuda, PagoDeuda } from '../model/types'
import { DeudaDao } from '../dao/DeudaDao'
import { PagoDeudaDao } from '../dao/PagoDeudaDao'
import { MovimientoDao } from '../dao/MovimientoDao'
import { Resultado } from './Resultado'
import { aDouble, acumularErrores, montoPositivo, textoNoVacio } from '../lib/validaciones'
import { formatFecha } from '../lib/fecha'
import { moneda } from '../lib/formato'
import { db } from '../lib/db'
import { obtenerDispositivoId } from '../sync/dispositivo'
import { sincronizarAhora } from '../sync/syncEngine'
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
   * en la caja (movimiento) por el mismo monto. Las tres escrituras (pago,
   * deuda y movimiento) y su encolado para sincronizar se ejecutan dentro
   * de una misma transacción Dexie: o se aplican todas, o ninguna.
   */
  async registrarAbono(
    idDeDeuda: string,
    monto: string,
    descripcion: string,
  ): Promise<Resultado> {
    const errores: string[] = []
    acumularErrores(errores, montoPositivo(monto, 'monto'))
    const montoAbono = aDouble(monto)
    if (errores.length === 0 && montoAbono <= 0) {
      errores.push('El abono debe ser mayor a 0.')
    }
    if (errores.length > 0) {
      return Resultado.error(errores.join('\n'))
    }

    const contexto = {
      silencioso: true,
      dispositivo: await obtenerDispositivoId(),
    }
    let deudaActualizada: Deuda | undefined
    try {
      await db.transaction(
        'rw',
        [db.pagos_deuda, db.deudas, db.movimientos, db.outbox],
        async () => {
          const deuda = await this.deudaDao.buscarPorId(idDeDeuda)
          if (!deuda) {
            throw new Error('La deuda no existe o ya fue eliminada.')
          }
          if (deuda.saldo <= 0) {
            throw new Error('Esta deuda ya está saldada.')
          }
          if (montoAbono > deuda.saldo) {
            throw new Error(`El abono supera el saldo pendiente (${moneda(deuda.saldo)}).`)
          }
          const nuevoSaldo = deuda.saldo - montoAbono
          const fecha = formatFecha(new Date())
          const contextoConMarca = { ...contexto, ahora: Date.now() }

          await this.pagoDao.insertar(
            {
              deuda_id: deuda.id,
              monto: montoAbono,
              descripcion: (descripcion.trim() || 'Abono a cuenta').trim(),
              fecha,
            },
            contextoConMarca,
          )
          deudaActualizada = await this.deudaDao.actualizar(
            { ...deuda, saldo: nuevoSaldo },
            contextoConMarca,
          )
          await this.movimientoDao.insertar(
            {
              tipo_movimiento: TIPO_INGRESO,
              monto: montoAbono,
              descripcion: `Pago de deuda de ${deuda.cliente_nombre}${descripcion.trim() ? `: ${descripcion.trim()}` : ''}`,
              fecha,
            },
            contextoConMarca,
          )
        },
      )
    } catch (error) {
      return Resultado.error(error instanceof Error ? error.message : 'No se pudo registrar el abono.')
    }

    void sincronizarAhora()
    const saldoRestante = deudaActualizada?.saldo ?? 0
    const texto = saldoRestante <= 0 ? 'y la deuda quedó saldada.' : `. Saldo pendiente: ${moneda(saldoRestante)}.`
    return Resultado.exito(`Abono de ${moneda(montoAbono)} registrado${texto}`)
  }

  /** Elimina una deuda (borrado lógico) junto con sus pagos, atómicamente. */
  async eliminarDeuda(idDeRegistro: string): Promise<Resultado> {
    const contexto = {
      silencioso: true,
      dispositivo: await obtenerDispositivoId(),
      ahora: Date.now(),
    }
    try {
      await db.transaction(
        'rw',
        [db.deudas, db.pagos_deuda, db.outbox],
        async () => {
          const deuda = await this.deudaDao.buscarPorId(idDeRegistro)
          if (!deuda) {
            throw new Error('La deuda no existe o ya fue eliminada.')
          }
          await this.deudaDao.eliminar(deuda.id, contexto)
          await this.pagoDao.eliminarPorDeuda(deuda.id, contexto)
        },
      )
    } catch (error) {
      return Resultado.error(error instanceof Error ? error.message : 'No se pudo eliminar la deuda.')
    }
    void sincronizarAhora()
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