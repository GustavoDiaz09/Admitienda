import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import {
  encolar,
  listarPendientes,
  eliminarItemSiSigueIgual,
  marcarIntento,
  descartarItem,
} from '../sync/outbox'
import type { RegistroBase, TablaSync } from '../model/types'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function registro(id: string, version: number, actualizadoEn: number): RegistroBase {
  return {
    id,
    creadoEn: 1,
    actualizadoEn,
    version,
    eliminado: false,
    dispositivo: 'dispositivo-test',
  }
}

describe('Outbox: carrera de sincronización', () => {
  it('encolar reemplaza la versión pendiente y reinicia los intentos', async () => {
    const tabla: TablaSync = 'productos'
    await db.outbox.put({
      id: 'productos:abc',
      tabla,
      registro: registro('abc', 1, 100),
      encoladoEn: 1,
      intentos: 5,
    })

    await encolar(tabla, registro('abc', 2, 200))

    const pendientes = await listarPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].registro.version).toBe(2)
    expect(pendientes[0].intentos).toBe(0)
  })

  it('no borra la entrada si el registro cambió mientras se subía la versión vieja', async () => {
    const tabla: TablaSync = 'movimientos'
    await encolar(tabla, registro('abc', 1, 100))
    const [itemViejo] = await listarPendientes()

    await encolar(tabla, registro('abc', 2, 200))

    const borrado = await eliminarItemSiSigueIgual(itemViejo)
    expect(borrado).toBe(false)

    const pendientes = await listarPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].registro.version).toBe(2)
  })

  it('borra la entrada cuando la versión subida sigue siendo la pendiente', async () => {
    const tabla: TablaSync = 'productos'
    await encolar(tabla, registro('abc', 1, 100))
    const [item] = await listarPendientes()

    const borrado = await eliminarItemSiSigueIgual(item)
    expect(borrado).toBe(true)
    expect(await listarPendientes()).toHaveLength(0)
  })

  it('marcarIntento registra el instante del último intento fallido', async () => {
    await encolar('deudas', registro('abc', 1, 100))
    const [item] = await listarPendientes()

    await marcarIntento(item)

    const pendientes = await listarPendientes()
    expect(pendientes[0].intentos).toBe(1)
    expect(pendientes[0].ultimoIntento).toBeDefined()
    expect(Date.now() - (pendientes[0].ultimoIntento ?? 0)).toBeLessThan(2000)
  })

  it('descartarItem vacía la cola cuando la versión rechazada sigue pendiente', async () => {
    await encolar('usuarios', registro('abc', 1, 100))
    const [item] = await listarPendientes()

    await descartarItem(item)

    expect(await listarPendientes()).toHaveLength(0)
  })

  it('descartarItem conserva la versión nueva si el registro cambió tras el rechazo', async () => {
    await encolar('usuarios', registro('abc', 1, 100))
    const [itemViejo] = await listarPendientes()

    await encolar('usuarios', registro('abc', 2, 200))

    await descartarItem(itemViejo)

    const pendientes = await listarPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].registro.version).toBe(2)
  })
})