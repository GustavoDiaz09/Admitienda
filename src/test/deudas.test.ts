import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { inicializarApp } from '../lib/inicializacion'
import { DeudaController } from '../controller/DeudaController'
import { DeudorDao } from '../dao/DeudorDao'
import { MovimientoController } from '../controller/MovimientoController'
import { TIPO_INGRESO } from '../model/types'

beforeEach(async () => {
  await db.delete()
  await db.open()
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

describe('Deudores como identidad única', () => {
  it('reutiliza el mismo deudor al repetir el nombre (mayúsculas y espacios)', async () => {
    await inicializarApp()
    const controlador = new DeudaController()
    const deudores = new DeudorDao()

    await controlador.registrarDeuda('Juan Pérez', '1000', 'Primer fiado')
    await controlador.registrarDeuda('  JUAN  PÉREZ ', '500', 'Segundo fiado')

    const lista = await deudores.obtenerTodos()
    expect(lista).toHaveLength(1)
    const deudas = await controlador.obtenerDeudas()
    expect(deudas).toHaveLength(2)
    expect(deudas[0].deudor_id).toBe(deudas[1].deudor_id)
    expect(deudas[0].cliente_nombre).toBe('Juan Pérez')
  })

  it('crea deudores distintos para nombres distintos', async () => {
    await inicializarApp()
    const controlador = new DeudaController()
    const deudores = new DeudorDao()

    await controlador.registrarDeuda('Ana', '1000', 'Fiado')
    await controlador.registrarDeuda('María', '800', 'Fiado')

    expect(await deudores.obtenerTodos()).toHaveLength(2)
    const deudas = await controlador.obtenerDeudas()
    expect(deudas[0].deudor_id).not.toBe(deudas[1].deudor_id)
  })

  it('permite varias deudas pendientes del mismo cliente a la vez', async () => {
    await inicializarApp()
    const controlador = new DeudaController()
    await controlador.registrarDeuda('María', '1000', 'Primera')
    await controlador.registrarDeuda('María', '2000', 'Segunda')

    const deudas = await controlador.obtenerDeudas()
    expect(deudas).toHaveLength(2)
    expect(deudas.every((d) => d.saldo > 0)).toBe(true)
    expect(await new DeudorDao().buscarPorNombreNormalizado('maría')).toBeDefined()
  })

  it('el abono no duplica la cartera del deudor', async () => {
    await inicializarApp()
    const controlador = new DeudaController()
    await controlador.registrarDeuda('Pedro', '1000', 'Fiado')
    const deuda = (await controlador.obtenerDeudas())[0]
    await controlador.registrarAbono(deuda.id, '400', 'Abono')

    expect(await new DeudorDao().obtenerTodos()).toHaveLength(1)
  })
})

describe('Editar deuda (valor y descripción, nombre fijo)', () => {
  it('corrige valor y descripción recalculando el saldo', async () => {
    await inicializarApp()
    const controlador = new DeudaController()
    await controlador.registrarDeuda('Ana', '1000', 'Original')
    const deuda = (await controlador.obtenerDeudas())[0]

    const resultado = await controlador.editarDeuda(deuda.id, '1500', 'Corregida')
    expect(resultado.exito).toBe(true)

    const actualizada = (await controlador.obtenerDeudas())[0]
    expect(actualizada.monto).toBe(1500)
    expect(actualizada.saldo).toBe(1500)
    expect(actualizada.descripcion).toBe('Corregida')
  })

  it('conserva lo ya abonado al ajustar el monto', async () => {
    await inicializarApp()
    const controlador = new DeudaController()
    await controlador.registrarDeuda('Ana', '1000', 'Fiado')
    const deuda = (await controlador.obtenerDeudas())[0]
    await controlador.registrarAbono(deuda.id, '400', 'Abono')

    const resultado = await controlador.editarDeuda(deuda.id, '900', 'Fiado')
    expect(resultado.exito).toBe(true)

    const actualizada = (await controlador.obtenerDeudas())[0]
    expect(actualizada.monto).toBe(900)
    expect(actualizada.saldo).toBe(500)
  })

  it('rechaza un monto menor que lo ya abonado y conserva los datos', async () => {
    await inicializarApp()
    const controlador = new DeudaController()
    await controlador.registrarDeuda('Ana', '1000', 'Fiado')
    const deuda = (await controlador.obtenerDeudas())[0]
    await controlador.registrarAbono(deuda.id, '600', 'Abono')

    const resultado = await controlador.editarDeuda(deuda.id, '500', 'Fiado')
    expect(resultado.exito).toBe(false)

    const intacta = (await controlador.obtenerDeudas())[0]
    expect(intacta.monto).toBe(1000)
    expect(intacta.saldo).toBe(400)
    expect(intacta.descripcion).toBe('Fiado')
  })

  it('no cambia el nombre del deudor al editar', async () => {
    await inicializarApp()
    const controlador = new DeudaController()
    await controlador.registrarDeuda('Ana', '1000', 'Fiado')
    const deuda = (await controlador.obtenerDeudas())[0]

    await controlador.editarDeuda(deuda.id, '1000', 'Actualizada')

    const actualizada = (await controlador.obtenerDeudas())[0]
    expect(actualizada.cliente_nombre).toBe('Ana')
    expect(actualizada.deudor_id).toBe(deuda.deudor_id)
  })
})