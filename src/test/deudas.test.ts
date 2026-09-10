import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { inicializarApp } from '../lib/inicializacion'
import { DeudaController } from '../controller/DeudaController'
import { MovimientoController } from '../controller/MovimientoController'
import { META_DATOS_EJEMPLO } from '../seed/DatosEjemplo'
import { TIPO_INGRESO } from '../model/types'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.metadatos.put({ clave: META_DATOS_EJEMPLO, valor: 'test' })
})

describe('CRM de deudas', () => {
  it('registra una deuda de cliente y calcula su saldo inicial', async () => {
    await inicializarApp()
    const controlador = new DeudaController()

    const resultado = await controlador.registrarDeuda('Juan Pérez', '1000', 'Fiado en la caja')
    expect(resultado.exito).toBe(true)

    const deudas = await controlador.obtenerDeudas()
    expect(deudas).toHaveLength(1)
    expect(deudas[0].cliente_nombre).toBe('Juan Pérez')
    expect(deudas[0].monto).toBe(1000)
    expect(deudas[0].saldo).toBe(1000)
  })

  it('registra abonos parciales y un ingreso en caja por cada uno', async () => {
    await inicializarApp()
    const controlador = new DeudaController()
    const caja = new MovimientoController()
    const ingresosPrevios = await caja.totalIngresos()

    expect((await controlador.registrarDeuda('María', '2000', 'Fiado de la semana')).exito).toBe(true)
    const deuda = (await controlador.obtenerDeudas())[0]

    const abono = await controlador.registrarAbono(deuda.id, '800', 'Abono en efectivo')
    expect(abono.exito).toBe(true)

    const actualizada = (await controlador.obtenerDeudas())[0]
    expect(actualizada.saldo).toBe(1200)
    expect(await controlador.obtenerPagosDeDeuda(deuda.id)).toHaveLength(1)
    expect(await caja.totalIngresos()).toBe(ingresosPrevios + 800)
  })

  it('sala la deuda cuando los abonos cubren el monto', async () => {
    await inicializarApp()
    const controlador = new DeudaController()
    await controlador.registrarDeuda('Ana', '500', 'Fiado')
    const deuda = (await controlador.obtenerDeudas())[0]

    await controlador.registrarAbono(deuda.id, '500', 'Pago total')

    expect((await controlador.obtenerDeudas())[0].saldo).toBe(0)
  })

  it('rechaza abonos que superen el saldo pendiente', async () => {
    await inicializarApp()
    const controlador = new DeudaController()
    await controlador.registrarDeuda('Luis', '500', 'Fiado')
    const deuda = (await controlador.obtenerDeudas())[0]

    const resultado = await controlador.registrarAbono(deuda.id, '600', 'Excede')
    expect(resultado.exito).toBe(false)
    expect((await controlador.obtenerDeudas())[0].saldo).toBe(500)
  })

  it('elimina deuda y sus pagos si se borra', async () => {
    await inicializarApp()
    const controlador = new DeudaController()
    await controlador.registrarDeuda('Rosa', '300', 'Fiado')
    const deuda = (await controlador.obtenerDeudas())[0]
    await controlador.registrarAbono(deuda.id, '100', 'Abono')

    const resultado = await controlador.eliminarDeuda(deuda.id)
    expect(resultado.exito).toBe(true)
    expect(await controlador.obtenerDeudas()).toHaveLength(0)
    expect(await controlador.obtenerPagosDeDeuda(deuda.id)).toHaveLength(0)
  })

  it('convierte el tipo de movimiento de los abonos a ingreso', async () => {
    await inicializarApp()
    const controlador = new DeudaController()
    const caja = new MovimientoController()
    const historialPrevios = (await caja.obtenerHistorial()).length

    await controlador.registrarDeuda('Pedro', '400', 'Fiado')
    const deuda = (await controlador.obtenerDeudas())[0]
    await controlador.registrarAbono(deuda.id, '400', '')

    const movimientos = await caja.obtenerHistorial()
    const ingresosRecientes = movimientos.slice(0, historialPrevios + 1)
    const ultimo = ingresosRecientes[0]
    expect(ultimo.tipo_movimiento).toBe(TIPO_INGRESO)
    expect(ultimo.descripcion).toContain('Pedro')
  })
})