import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { aplicarRemotos, guardarCursorDescarga, obtenerCursorDescarga } from '../sync/pull'
import { idOutbox } from '../sync/outbox'
import type { Producto, RegistroBase } from '../model/types'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function filaRemota(
  id: string,
  actualizadoEn: number,
  version: number,
  eliminado = false,
): Record<string, unknown> {
  return {
    id,
    creado_en: 1000,
    actualizado_en: actualizadoEn,
    version,
    eliminado,
    dispositivo: 'nube',
    tipo_producto: 'Tejido',
    nombre_producto: `Producto ${id}`,
    precio_neto: 10,
    ganancia: 5,
    precio_venta: 15,
    cantidad_stock: 3,
    stock_minimo: 1,
  }
}

async function sembrarLocal(id: string, actualizadoEn: number, version: number): Promise<void> {
  const registro: Producto & RegistroBase = {
    id,
    creadoEn: 1000,
    actualizadoEn,
    version,
    eliminado: false,
    dispositivo: 'local',
    tipo_producto: 'Tejido',
    nombre_producto: `Local ${id}`,
    precio_neto: 1,
    ganancia: 1,
    precio_venta: 2,
    cantidad_stock: 0,
    stock_minimo: 0,
  }
  await db.productos.put(registro)
  await db.outbox.put({
    id: idOutbox('productos', id),
    tabla: 'productos',
    registro: { ...registro },
    encoladoEn: 1,
    intentos: 0,
  })
}

describe('Fusión nube-local con última escritura gana (LWW)', () => {
  it('aplica una fila remota cuando no hay copia local', async () => {
    const resultado = await aplicarRemotos('productos', [filaRemota('r1', 200, 1)])

    expect(resultado.recibidos).toBe(1)
    expect(resultado.actualizados).toBe(1)
    const local = await db.productos.get('r1')
    expect(local?.nombre_producto).toBe('Producto r1')
  })

  it('la versión remota más reciente reemplaza y cancela la edición local pendiente', async () => {
    await sembrarLocal('r1', 100, 1)

    const resultado = await aplicarRemotos('productos', [filaRemota('r1', 200, 2)])

    expect(resultado.actualizados).toBe(1)
    const local = await db.productos.get('r1')
    expect(local?.nombre_producto).toBe('Producto r1')
    expect(local?.actualizadoEn).toBe(200)
    expect(await db.outbox.get(idOutbox('productos', 'r1'))).toBeUndefined()
  })

  it('conserva la copia local cuando es más reciente y mantiene la cola', async () => {
    await sembrarLocal('r1', 200, 2)

    const resultado = await aplicarRemotos('productos', [filaRemota('r1', 100, 1)])

    expect(resultado.actualizados).toBe(0)
    const local = await db.productos.get('r1')
    expect(local?.nombre_producto).toBe('Local r1')
    expect(await db.outbox.get(idOutbox('productos', 'r1'))).toBeDefined()
  })

  it('en un empate de versión gana la nube', async () => {
    await sembrarLocal('r1', 100, 1)

    await aplicarRemotos('productos', [filaRemota('r1', 100, 1)])

    const local = await db.productos.get('r1')
    expect(local?.dispositivo).toBe('nube')
    expect(await db.outbox.get(idOutbox('productos', 'r1'))).toBeUndefined()
  })

  it('aplica un borrado remoto más reciente (tumba)', async () => {
    await sembrarLocal('r1', 100, 1)

    await aplicarRemotos('productos', [filaRemota('r1', 200, 2, true)])

    const local = await db.productos.get('r1')
    expect(local?.eliminado).toBe(true)
  })

  it('no toca la cola de otros registros ni tablas', async () => {
    await aplicarRemotos('productos', [filaRemota('r1', 100, 1)])

    const otro = {
      id: 'x1',
      creadoEn: 1,
      actualizadoEn: 50,
      version: 1,
      eliminado: false,
      dispositivo: 'local',
      tipo_producto: 'Tejido',
      nombre_producto: 'Otro',
      precio_neto: 1,
      ganancia: 1,
      precio_venta: 2,
      cantidad_stock: 0,
      stock_minimo: 0,
    }
    await db.productos.put(otro)
    await db.outbox.put({
      id: idOutbox('productos', 'x1'),
      tabla: 'productos',
      registro: { ...otro },
      encoladoEn: 1,
      intentos: 0,
    })

    await aplicarRemotos('productos', [])

    expect(await db.outbox.get(idOutbox('productos', 'x1'))).toBeDefined()
  })
})

describe('Cursor de descarga incremental', () => {
  it('empieza en cero y guarda la última marca', async () => {
    expect(await obtenerCursorDescarga()).toBe(0)

    await guardarCursorDescarga(1789000000000)

    expect(await obtenerCursorDescarga()).toBe(1789000000000)
  })

  it('resetea el cursor a cero cuando se elimina la base', async () => {
    await guardarCursorDescarga(1789000000000)

    await db.delete()
    await db.open()

    expect(await obtenerCursorDescarga()).toBe(0)
  })
})