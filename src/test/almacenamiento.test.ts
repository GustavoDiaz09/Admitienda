import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function definirStorage(opciones: { usage: number; quota: number; persistente: boolean }) {
  const storage = {
    persist: async () => true,
    persisted: async () => opciones.persistente,
    estimate: async () => ({ usage: opciones.usage, quota: opciones.quota }),
  }
  Object.defineProperty(navigator, 'storage', { configurable: true, value: storage })
}

function quitarStorage() {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined })
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  delete (navigator as { storage?: unknown }).storage
})

describe('Almacenamiento local (PWA)', () => {
  it('pide persistencia al navegador y devuelve su respuesta', async () => {
    definirStorage({ usage: 10, quota: 100_000, persistente: false })
    const { solicitarPersistencia } = await import('../lib/almacenamiento')

    expect(await solicitarPersistencia()).toBe(true)
  })

  it('calcula el porcentaje de uso de la cuota', async () => {
    definirStorage({ usage: 12_582_912, quota: 104_857_600, persistente: true })
    const { obtenerInfoAlmacenamiento } = await import('../lib/almacenamiento')

    const info = await obtenerInfoAlmacenamiento()
    expect(info?.porcentaje).toBe(12)
    expect(info?.usoBytes).toBe(12_582_912)
    expect(info?.persistente).toBe(true)
  })

  it('formatea los bytes de forma legible', async () => {
    const { formatearBytes } = await import('../lib/almacenamiento')

    expect(formatearBytes(0)).toBe('0 B')
    expect(formatearBytes(512)).toBe('512 B')
    expect(formatearBytes(12_582_912)).toBe('12,0 MB')
    expect(formatearBytes(1_073_741_824)).toBe('1,0 GB')
  })

  it('avisa una sola vez por sesión cuando la cuota supera el umbral', async () => {
    definirStorage({ usage: 95_000_000, quota: 100_000_000, persistente: true })
    const { revisarCuotaDeAlmacenamiento } = await import('../lib/almacenamiento')
    const { useToastStore } = await import('../lib/toast')

    const info = await revisarCuotaDeAlmacenamiento()
    await revisarCuotaDeAlmacenamiento()

    expect(info?.porcentaje).toBe(95)
    expect(useToastStore.getState().avisos).toHaveLength(1)
    expect(useToastStore.getState().avisos[0].tipo).toBe('error')
  })

  it('no avisa cuando hay espacio de sobra', async () => {
    definirStorage({ usage: 10, quota: 100_000_000, persistente: false })
    const { revisarCuotaDeAlmacenamiento } = await import('../lib/almacenamiento')
    const { useToastStore } = await import('../lib/toast')

    const info = await revisarCuotaDeAlmacenamiento()

    expect(info?.porcentaje).toBe(0)
    expect(useToastStore.getState().avisos).toHaveLength(0)
  })

  it('resiste cuando la API de almacenamiento no está disponible', async () => {
    quitarStorage()
    const { solicitarPersistencia, obtenerInfoAlmacenamiento, revisarCuotaDeAlmacenamiento } =
      await import('../lib/almacenamiento')

    expect(await solicitarPersistencia()).toBe(false)
    expect(await obtenerInfoAlmacenamiento()).toBeNull()
    expect(await revisarCuotaDeAlmacenamiento()).toBeNull()
  })
})