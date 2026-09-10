import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { inicializarApp } from '../lib/inicializacion'
import { UsuarioController } from '../controller/UsuarioController'
import { ProductoController } from '../controller/ProductoController'
import { MovimientoController } from '../controller/MovimientoController'
import { ADMIN_INICIAL_CONTRASENA, DISPOSITIVO_SEMILLA } from '../seed/DatosEjemplo'
import { TIPO_ADMIN, TIPO_INGRESO } from '../model/types'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('Arranque de la aplicación', () => {
  it('siembra al administrador inicial sin datos de ejemplo', async () => {
    await inicializarApp()

    const usuarios = await new UsuarioController().obtenerUsuarios()
    expect(usuarios.some((u) => u.nombre_usuario === 'admin')).toBe(true)

    const productos = await new ProductoController().obtenerProductos()
    expect(productos.length).toBe(0)
  })

  it('siembra solo al administrador: local (semilla) y sin encolar', async () => {
    await inicializarApp()

    const usuarios = await db.usuarios.toArray()
    expect(usuarios.length).toBeGreaterThan(0)
    expect(usuarios.every((u) => u.dispositivo === DISPOSITIVO_SEMILLA)).toBe(true)
    expect(await db.productos.count()).toBe(0)
    expect(await db.movimientos.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('permite iniciar sesión con las credenciales por defecto', async () => {
    await inicializarApp()

    const usuario = await new UsuarioController().iniciarSesion('admin', ADMIN_INICIAL_CONTRASENA)
    expect(usuario).not.toBeNull()
    expect(usuario?.tipo_usuario).toBe(TIPO_ADMIN)
    expect(await new UsuarioController().iniciarSesion('admin', 'clave-incorrecta')).toBeNull()
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