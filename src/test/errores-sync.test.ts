import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { guardarLlave, obtenerLlave } from '../lib/llave'
import { ErrorRemoto, subirRemoto, verificarRemoto, descargarRemoto } from '../lib/remoto'
import { useToastStore } from '../lib/toast'
import { configurarLlaveYSincronizar } from '../lib/syncAcciones'
import { encolar, contarPendientes } from '../sync/outbox'
import {
  sincronizarAhora,
  sincronizarBajando,
  useSyncStore,
  verificarConectividad,
} from '../sync/syncEngine'
import type { RegistroBase } from '../model/types'

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

function registroProducto(id: string): RegistroBase {
  return {
    id,
    creadoEn: 1000,
    actualizadoEn: 1000,
    version: 1,
    eliminado: false,
    dispositivo: 'prueba',
  }
}

async function sembrarPendiente(id: string): Promise<void> {
  await encolar('productos', { ...registroProducto(id), tipo_producto: 'Tejido' } as never)
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  window.localStorage.clear()
  vi.resetAllMocks()
  useSyncStore.getState().setLlaveInvalida(false)
  useSyncStore.getState().setError(null)
  useSyncStore.getState().setEnLinea(true)
  useSyncStore.getState().setPendientes(0)
})

describe('Distinción de causas de conexión', () => {
  it('sin llave configurada devuelve sin_llave', async () => {
    expect(await verificarConectividad()).toBe('sin_llave')
  })

  it('con llave válida y nube disponible devuelve ok', async () => {
    guardarLlave('llave-de-prueba')
    vi.mocked(verificarRemoto).mockResolvedValue(true)

    expect(await verificarConectividad()).toBe('ok')
  })

  it('llave rechazada por la nube (401) devuelve invalida', async () => {
    guardarLlave('llave-de-prueba')
    vi.mocked(verificarRemoto).mockRejectedValue(new ErrorRemoto('Llave inválida.', 401))

    expect(await verificarConectividad()).toBe('invalida')
  })

  it('con llave pero sin red devuelve sin_red', async () => {
    guardarLlave('llave-de-prueba')
    vi.mocked(verificarRemoto).mockRejectedValue(new Error('No se pudo conectar con la nube.'))

    expect(await verificarConectividad()).toBe('sin_red')
  })
})

describe('Errores de sincronización visibles', () => {
  it('sin llave, sincronizarAhora no toca la cola ni marca llave inválida', async () => {
    await sembrarPendiente('p1')

    const resultado = await sincronizarAhora()

    expect(resultado).toEqual({ subidos: 0, fallados: 0 })
    expect(useSyncStore.getState().llaveInvalida).toBe(false)
    expect(await contarPendientes()).toBe(1)
  })

  it('con llave inválida no descarta el cambio y lo avisa en el estado', async () => {
    guardarLlave('llave-de-prueba')
    await sembrarPendiente('p1')
    vi.mocked(verificarRemoto).mockRejectedValue(new ErrorRemoto('Llave inválida.', 401))

    const resultado = await sincronizarAhora()

    expect(resultado).toEqual({ subidos: 0, fallados: 0 })
    expect(useSyncStore.getState().llaveInvalida).toBe(true)
    expect(useSyncStore.getState().error).toContain('no es válida')
    expect(await contarPendientes()).toBe(1)
  })

  it('un rechazo definitivo (409) sale de la cola, deja el error en el estado y avisa por toast', async () => {
    guardarLlave('llave-de-prueba')
    await sembrarPendiente('p1')
    vi.mocked(verificarRemoto).mockResolvedValue(true)
    vi.mocked(subirRemoto).mockRejectedValue(
      new ErrorRemoto('Ya existe un registro con el mismo nombre en la nube (conflicto de unicidad).', 409),
    )

    const resultado = await sincronizarAhora()

    expect(resultado).toEqual({ subidos: 0, fallados: 1 })
    expect(await contarPendientes()).toBe(0)
    expect(useSyncStore.getState().error).toContain('conflicto de unicidad')
    const avisos = useToastStore.getState().avisos
    expect(avisos.some((a) => a.mensaje.includes('rechazados por la nube'))).toBe(true)
  })

  it('una bajada en segundo plano con llave inválida marca el estado sin lanzar', async () => {
    guardarLlave('llave-de-prueba')
    vi.mocked(descargarRemoto).mockRejectedValue(new ErrorRemoto('Llave inválida.', 401))

    await expect(sincronizarBajando()).resolves.toBeUndefined()

    expect(useSyncStore.getState().llaveInvalida).toBe(true)
    expect(useSyncStore.getState().error).toContain('no es válida')
  })

  it('configurarLlaveYSincronizar guarda la llave y dispara la bajada', async () => {
    await configurarLlaveYSincronizar('llave-nueva')

    expect(obtenerLlave()).toBe('llave-nueva')
    expect(vi.mocked(descargarRemoto)).toHaveBeenCalled()
  })
})