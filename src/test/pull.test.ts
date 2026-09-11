import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import {
  aplicarRemotos,
  guardarCursorDescarga,
  obtenerCursorDescarga,
  obtenerProximaDescargaCompleta,
  programarProximaDescargaCompleta,
  traerDatosDelServidor,
} from '../sync/pull'
import { idOutbox } from '../sync/outbox'
import { descargarRemoto } from '../lib/remoto'
import type { Producto, RegistroBase } from '../model/types'

vi.mock('../lib/supabase', () => ({
  supabaseUrl: 'https://proyecto.supabase.co',
  supabaseDisponible: () => true,
}))

vi.mock('../lib/remoto', () => ({
  ErrorRemoto: class ErrorRemoto extends Error {
    readonly estado: number
    readonly definitivo: boolean
    constructor(mensaje: string, estado = 0) {
      super(mensaje)
      this.estado = estado
      this.definitivo = estado >= 400 && estado < 500
    }
  },
  descargarRemoto: vi.fn(async (_desde?: number) => ({ ahora: 0, tablas: {} })),
  subirRemoto: vi.fn(async () => undefined),
  verificarRemoto: vi.fn(async () => true),
  hayAdminRemoto: vi.fn(async () => null),
}))

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

describe('Cursor de descarga derivado del reloj del servidor', () => {
  const AHORA_SERVIDOR = Date.now()
  const MARGEN = 5 * 60 * 1000
  const INTERVALO_RESCAN = 24 * 60 * 60 * 1000

  it('ancla el cursor al reloj del servidor menos el margen y programa el primer rescaneo', async () => {
    vi.mocked(descargarRemoto).mockResolvedValue({ ahora: AHORA_SERVIDOR, tablas: {} })

    await traerDatosDelServidor()

    expect(await obtenerCursorDescarga()).toBe(AHORA_SERVIDOR - MARGEN)
    expect(await obtenerProximaDescargaCompleta()).toBe(AHORA_SERVIDOR + INTERVALO_RESCAN)
  })

  it('la bajada incremental pasa el cursor como `desde` y no reprograma el rescaneo', async () => {
    await guardarCursorDescarga(1_700_000_000_000)
    await programarProximaDescargaCompleta(AHORA_SERVIDOR + INTERVALO_RESCAN)
    vi.mocked(descargarRemoto).mockResolvedValue({ ahora: AHORA_SERVIDOR, tablas: {} })

    await traerDatosDelServidor()

    const desde = vi.mocked(descargarRemoto).mock.calls.at(-1)?.[0]
    expect(desde).toBe(1_700_000_000_000)
    expect(await obtenerProximaDescargaCompleta()).toBe(AHORA_SERVIDOR + INTERVALO_RESCAN)
  })

  it('cuando vence el rescaneo vuelve a bajar toda la base y reprograma', async () => {
    await guardarCursorDescarga(1_700_000_000_000)
    await programarProximaDescargaCompleta(AHORA_SERVIDOR - 1)
    vi.mocked(descargarRemoto).mockResolvedValue({ ahora: AHORA_SERVIDOR, tablas: {} })

    await traerDatosDelServidor()

    const desde = vi.mocked(descargarRemoto).mock.calls.at(-1)?.[0]
    expect(desde).toBeUndefined()
    expect(await obtenerProximaDescargaCompleta()).toBe(AHORA_SERVIDOR + INTERVALO_RESCAN)
  })

  it('una bajada manual completa también vuelve a programar el rescaneo', async () => {
    await guardarCursorDescarga(1_700_000_000_000)
    await programarProximaDescargaCompleta(1_900_000_000_000)
    const sinAhora = vi.fn(async () => ({ ahora: AHORA_SERVIDOR, tablas: {} }))
    vi.mocked(descargarRemoto).mockImplementation(sinAhora)

    await traerDatosDelServidor({ completo: true })

    expect(sinAhora).toHaveBeenCalledWith(undefined)
    expect(await obtenerProximaDescargaCompleta()).toBe(AHORA_SERVIDOR + INTERVALO_RESCAN)
  })

  it('si el servidor no reporta `ahora`, usa el reloj local como respaldo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(1_800_000_000_000)
      vi.mocked(descargarRemoto).mockResolvedValue({ ahora: 0, tablas: {} })

      await traerDatosDelServidor()

      expect(await obtenerCursorDescarga()).toBe(1_800_000_000_000 - MARGEN)
    } finally {
      vi.useRealTimers()
    }
  })
})