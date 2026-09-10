import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { inicializarApp } from '../lib/inicializacion'
import { UsuarioController } from '../controller/UsuarioController'
import { ProductoController } from '../controller/ProductoController'
import { MovimientoController } from '../controller/MovimientoController'
import { TIPO_ADMIN, TIPO_INGRESO, TIPO_REGISTRADO } from '../model/types'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('Arranque de la aplicación', () => {
  it('no crea ninguna cuenta ni datos por defecto', async () => {
    await inicializarApp()

    expect(await new UsuarioController().obtenerUsuarios()).toHaveLength(0)
    expect(await new ProductoController().obtenerProductos()).toHaveLength(0)
    expect(await db.movimientos.count()).toBe(0)
    expect(await db.deudas.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('promueve al primer usuario registrado a administrador', async () => {
    await inicializarApp()
    const controlador = new UsuarioController()

    const resultado = await controlador.registrarUsuario(
      'encargado',
      'clave123',
      'indicio',
      false,
      async () => false,
    )
    expect(resultado.exito).toBe(true)

    const usuarios = await controlador.obtenerUsuarios()
    expect(usuarios).toHaveLength(1)
    expect(usuarios[0].nombre_usuario).toBe('encargado')
    expect(usuarios[0].tipo_usuario).toBe(TIPO_ADMIN)
  })

  it('si ya hay un administrador, un registro sin permiso queda como REGISTRADO', async () => {
    await inicializarApp()
    const controlador = new UsuarioController()
    await controlador.registrarUsuario('admin', 'clave123', 'indicio', false, async () => false)
    await controlador.registrarUsuario('cajero', 'clave123', 'indicio', false)

    const cajero = await controlador.iniciarSesion('cajero', 'clave123')
    expect(cajero?.tipo_usuario).toBe(TIPO_REGISTRADO)
  })

  it('mantiene la promoción: no permite crear un segundo admin sin aprobación', async () => {
    await inicializarApp()
    const controlador = new UsuarioController()
    await controlador.registrarUsuario('admin', 'clave123', 'indicio', false, async () => false)
    await controlador.registrarUsuario('aspirante', 'clave123', 'indicio', true)

    const aspirante = await controlador.iniciarSesion('aspirante', 'clave123')
    expect(aspirante?.tipo_usuario).toBe(TIPO_REGISTRADO)
    expect(await db.solicitudes_admin.count()).toBe(1)
  })

  it('no promueve cuando la nube ya tiene un administrador (AL-05)', async () => {
    await inicializarApp()
    const controlador = new UsuarioController()

    const resultado = await controlador.registrarUsuario(
      'nuevo',
      'clave123',
      'indicio',
      false,
      async () => true,
    )
    expect(resultado.exito).toBe(true)

    const usuarios = await controlador.obtenerUsuarios()
    expect(usuarios).toHaveLength(1)
    expect(usuarios[0].tipo_usuario).toBe(TIPO_REGISTRADO)
  })

  it('sin confirmación de la nube no otorga administrador automático (AL-05)', async () => {
    await inicializarApp()
    const controlador = new UsuarioController()

    const resultado = await controlador.registrarUsuario(
      'nuevo',
      'clave123',
      'indicio',
      true,
      async () => null,
    )
    expect(resultado.exito).toBe(true)

    const usuarios = await controlador.obtenerUsuarios()
    expect(usuarios[0].tipo_usuario).toBe(TIPO_REGISTRADO)
    expect(await db.solicitudes_admin.count()).toBe(1)
  })

  it('registra un ingreso y lo refleja en el resumen financiero', async () => {
    await inicializarApp()
    const controlador = new MovimientoController()
    const ingresosPrevios = await controlador.totalIngresos()
    const historialPrevios = (await controlador.obtenerHistorial()).length

    const resultado = await controlador.nuevoMovimiento(TIPO_INGRESO, '100', 'Venta de contado')
    expect(resultado.exito).toBe(true)

    expect(await controlador.totalIngresos()).toBe(ingresosPrevios + 100)
    expect((await controlador.obtenerHistorial()).length).toBe(historialPrevios + 1)
  })

  it('mantiene a salvo la integridad: no acepta montos inválidos', async () => {
    await inicializarApp()
    const controlador = new MovimientoController()
    const ingresosPrevios = await controlador.totalIngresos()

    const resultado = await controlador.nuevoMovimiento(TIPO_INGRESO, '-5', '')
    expect(resultado.exito).toBe(false)
    expect(await controlador.totalIngresos()).toBe(ingresosPrevios)
  })
})