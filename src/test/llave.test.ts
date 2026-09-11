import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  enlaceDeLlave,
  extraerLlaveDeUrl,
  guardarLlave,
  limpiarLlaveDeUrl,
  obtenerLlave,
} from '../lib/llave'
import { crearLlaveRemoto, descargarRemoto } from '../lib/remoto'

vi.mock('../lib/supabase', () => ({
  supabaseUrl: 'https://prueba.supabase.co',
  supabaseDisponible: () => true,
}))

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Almacenamiento local de la llave', () => {
  it('sin llave guardada devuelve vacío', () => {
    expect(obtenerLlave()).toBe('')
  })

  it('guarda recortando espacios y elimina al guardar vacío', () => {
    guardarLlave('  abc-123  ')
    expect(obtenerLlave()).toBe('abc-123')

    guardarLlave('')
    expect(obtenerLlave()).toBe('')
  })
})

describe('Llave por URL (enrolar desde el enlace/QR)', () => {
  it('extrae la llave del parámetro', () => {
    expect(extraerLlaveDeUrl('https://admitienda.vercel.app/?llave=abc-123')).toBe('abc-123')
  })

  it('ignora otros parámetros y URLs sin llave', () => {
    expect(extraerLlaveDeUrl('https://admitienda.vercel.app/?otro=1')).toBe('')
    expect(extraerLlaveDeUrl('https://admitienda.vercel.app/')).toBe('')
  })

  it('responda vacío ante una URL malformada', () => {
    expect(extraerLlaveDeUrl('no es una url')).toBe('')
  })

  it('construye el enlace con la llave para compartir', () => {
    const enlace = enlaceDeLlave('abc 123')
    const url = new URL(enlace)
    expect(url.searchParams.get('llave')).toBe('abc 123')
  })

  it('limpiarLlaveDeUrl borra el parámetro sin recargar', () => {
    window.history.replaceState(null, '', '/?llave=abc-123')
    expect(extraerLlaveDeUrl(window.location.href)).toBe('abc-123')

    limpiarLlaveDeUrl()

    expect(window.location.search).not.toContain('llave')
    expect(extraerLlaveDeUrl(window.location.href)).toBe('')
  })

  it('limpiarLlaveDeUrl no toca la URL si no viene la llave', () => {
    window.history.replaceState(null, '', '/?otro=1')
    limpiarLlaveDeUrl()
    expect(window.location.search).toBe('?otro=1')
  })
})

describe('crearLlaveRemoto (arranque de la tienda)', () => {
  it('crea la primera llave sin una llave local configurada', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ llave: 'primera-llave', inicial: true }),
    } as unknown as Response)

    const resultado = await crearLlaveRemoto('Caja')

    expect(resultado).toEqual({ llave: 'primera-llave', inicial: true })
    const llamada = vi.mocked(fetch).mock.calls[0]
    const url = String(llamada[0])
    const opciones = llamada[1] as RequestInit
    expect(url).toContain('accion=crear_llave')
    expect(url).toContain('https://prueba.supabase.co/functions/v1/sync')
    expect(opciones.method).toBe('POST')
    expect(String(opciones.body)).toContain('"nombre":"Caja"')
    expect((opciones.headers as Record<string, string>)['x-llave-sincronizacion']).toBe('')
  })

  it('reporta el error remoto de la nube (p. ej. llave inválida)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'Llave de sincronización inválida.' }),
    } as unknown as Response)

    await expect(crearLlaveRemoto()).rejects.toThrow('Llave de sincronización inválida.')
  })

  it('rechaza crear llave con una llave no maestra (solo SUPERADMIN)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          error: 'Solo la llave del administrador (SUPERADMIN) puede crear llaves para nuevos dispositivos.',
        }),
    } as unknown as Response)

    await expect(crearLlaveRemoto()).rejects.toThrow('Solo la llave del administrador')
  })

  it('otras acciones sin llave local siguen fallando temprano', async () => {
    await expect(descargarRemoto()).rejects.toThrow('Falta la llave de sincronización')
    expect(fetch).not.toHaveBeenCalled()
  })
})