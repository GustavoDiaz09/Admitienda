import type { Deuda, PagoDeuda } from '../model/types'
import { DeudaDao } from '../dao/DeudaDao'
import { PagoDeudaDao } from '../dao/PagoDeudaDao'
import { DeudorDao } from '../dao/DeudorDao'
import { MovimientoDao } from '../dao/MovimientoDao'
import { Resultado } from './Resultado'
import { aDouble, acumularErrores, montoPositivo, normalizarNombreCliente, textoNoVacio } from '../lib/validaciones'
import { formatFecha } from '../lib/fecha'
import { moneda } from '../lib/formato'
import { db } from '../lib/db'
import { obtenerDispositivoId } from '../sync/dispositivo'
import { sincronizarAhora } from '../sync/syncEngine'
import { TIPO_INGRESO } from '../model/types'

/**
 * Controlador del CRM de deudas: registro de ventas fiadas y sus abonos.
 * Cada abono registra además un ingreso en la caja (movimientos). Los
 * deudores son identidades únicas por nombre normalizado: registrar varias
 * veces al mismo cliente reutiliza su cartera y permite varias deudas
 * pendientes a la vez.
 */
export class DeudaController {
  private readonly deudaDao = new DeudaDao()
  private readonly pagoDao = new PagoDeudaDao()
  private readonly deudorDao = new DeudorDao()
  private readonly movimientoDao = new MovimientoDao()

  /**
   * Registra una deuda nueva de un cliente (venta fiada). Resuelve el
   * deudor por nombre normalizado: si ya existe se reutiliza (mismo
   * historial) y si no se crea, dentro de una misma transacción Dexie
   * (deudor + deuda + outbox): o quedan ambas, o ninguna.
   */
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

    const contexto = {
      silencioso: true,
      dispositivo: await obtenerDispositivoId(),
    }
    try {
      await db.transaction(
        'rw',
        [db.deudores, db.deudas, db.outbox],
        async () => {
          const normalizado = normalizarNombreCliente(clienteNombre)
          let deudor = await this.deudorDao.buscarPorNombreNormalizado(normalizado)
          if (!deudor) {
            try {
              deudor = await this.deudorDao.insertar(
                {
                  nombre_deudor: clienteNombre.trim(),
                  nombre_normalizado: normalizado,
                },
                { ...contexto, ahora: Date.now() },
              )
            } catch {
              // Pudo crearse desde otro flujo concurrente justo antes:
              // se reverifica para reutilizar la misma identidad.
              deudor = await this.deudorDao.buscarPorNombreNormalizado(normalizado)
            }
          }
          if (!deudor) {
            throw new Error('No se pudo identificar al deudor.')
          }
          await this.deudaDao.insertar(
            {
              deudor_id: deudor.id,
              cliente_nombre: deudor.nombre_deudor,
              monto: aDouble(monto),
              descripcion: descripcion.trim(),
              fecha: formatFecha(new Date()),
            },
            { ...contexto, ahora: Date.now() },
          )
        },
      )
    } catch (error) {
      return Resultado.error(error instanceof Error ? error.message : 'No se pudo registrar la deuda.')
    }
    void sincronizarAhora()
    return Resultado.exito('Deuda registrada correctamente.')
  }

  /**
   * Edita el valor y la descripción de una deuda (el nombre del deudor
   * queda fijo). El saldo se recalcula conservando lo ya abonado:
   * `saldo = montoNuevo − (montoAnterior − saldoAnterior)`.
   */
  async editarDeuda(
    idDeDeuda: string,
    monto: string,
    descripcion: string,
  ): Promise<Resultado> {
    const errores: string[] = []
    acumularErrores(errores, montoPositivo(monto, 'monto'))
    acumularErrores(errores, textoNoVacio(descripcion, 'descripción'))
    if (errores.length > 0 || aDouble(monto) <= 0) {
      if (errores.length === 0) {
        errores.push('El monto de la deuda debe ser mayor a 0.')
      }
      return Resultado.error(errores.join('\n'))
    }
    const deuda = await this.deudaDao.buscarPorId(idDeDeuda)
    if (!deuda) {
      return Resultado.error('La deuda no existe o ya fue eliminada.')
    }
    const montoNuevo = aDouble(monto)
    const abonado = deuda.monto - deuda.saldo
    const nuevoSaldo = montoNuevo - abonado
    if (nuevoSaldo < 0) {
      return Resultado.error(`El monto no puede ser menor que lo ya abonado (${moneda(abonado)}).`)
    }
    await this.deudaDao.actualizar({
      ...deuda,
      monto: montoNuevo,
      saldo: nuevoSaldo,
      descripcion: descripcion.trim(),
    })
    return Resultado.exito('Deuda actualizada correctamente.')
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