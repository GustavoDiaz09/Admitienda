import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { inicializarApp } from '../lib/inicializacion'
import { UsuarioController } from '../controller/UsuarioController'
import { encolar } from '../sync/outbox'
import { idOutbox } from '../sync/outbox'
import { hayLlaveConfigurada, obtenerLlave } from '../lib/llave'
import { registrarFallo } from '../lib/intentos'
import { loginRemoto, type ResultadoLoginRemoto } from '../lib/remoto'
import { TIPO_REGISTRADO, TIPO_SUPERADMIN } from '../model/types'

vi.mock('../sync/syncEngine', async () => ({
  ...(await vi.importActual('../sync/syncEngine')),
  sincronizarAhora: vi.fn(async () => ({ subidos: 0, fallados: 0 })),
  sincronizarBajando: vi.fn(async () => {}),
}))

import { sincronizarAhora, sincronizarBajando } from '../sync/syncEngine'

const mocSincronizarAhora = vi.mocked(sincronizarAhora)
const mocSincronizarBajando = vi.mocked(sincronizarBajando)

function respuesta(status: number, cuerpo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(cuerpo),
  } as unknown as Response
}

/** Fila de usuario tal y como la devuelve la nube (snake_case). */
function filaRemotaUsuario(
  id: string,
  nombre: string,
  tipo: string,
): Record<string, unknown> {
  return {
    id,
    creado_en: 1_700_000_000_000,
    actualizado_en: 1_700_000_000_000,
    version: 4,
    eliminado: false,
    dispositivo: 'nube',
    nombre_usuario: nombre,
    tipo_usuario: tipo,
    contrasena_hash: `pbkdf2$210000$${'a'.repeat(64)}`,
    salt: 'b'.repeat(32),
    indicio_usuario: 'indicio',
    fecha_registro: '2026-01-01 10:00',
  }
}

const sinNube = async (): Promise<ResultadoLoginRemoto> => ({
  ok: false,
  motivo: 'indisponible',
})

beforeEach(async () => {
  window.localStorage.clear()
  await db.delete()
  await db.open()
  await inicializarApp()
  mocSincronizarAhora.mockClear()
  mocSincronizarBajando.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loginRemoto: clasificación de la respuesta de la nube', () => {
  it('devuelve ok con usuario y llave cuando la nube confirma y auto-enrola', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respuesta(200, {
          ok: true,
          usuario: filaRemotaUsuario('id-cloud', 'Gustavo', TIPO_SUPERADMIN),
          llave: 'llave-nueva',
        }),
      ),
    )
    const resultado = await loginRemoto('Gustavo', 'clave')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.usuario.id).toBe('id-cloud')
      expect(resultado.llave).toBe('llave-nueva')
    }
  })

  it('devuelve ok sin llave cuando el usuario no es el SUPERADMIN', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respuesta(200, {
          ok: true,
          usuario: filaRemotaUsuario('id-2', 'cajero', TIPO_REGISTRADO),
        }),
      ),
    )
    const resultado = await loginRemoto('cajero', 'clave')
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.llave).toBeUndefined()
    }
  })

  it('clasifica un 400 como credenciales incorrectas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(400, { credencialesIncorrectas: true })))
    expect(await loginRemoto('cajero', 'mala')).toEqual({ ok: false, motivo: 'credenciales' })
  })

  it('clasifica un 429 como límite de fuerza bruta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(429, { error: 'Espere' })))
    expect(await loginRemoto('cajero', 'mala')).toEqual({ ok: false, motivo: 'bloqueado' })
  })

  it('clasifica una caída de red como indisponible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Sin conexión')
      }),
    )
    expect(await loginRemoto('cajero', 'clave')).toEqual({ ok: false, motivo: 'indisponible' })
  })
})

describe('UsuarioController.iniciarSesion: híbrido (nube primero, local de respaldo)', () => {
  it('con la nube disponible siembra la cuenta, guarda la llave del dueño y dispara la bajada', async () => {
    const idNube = 'id-cloud-superadmin'
    const controlador = new UsuarioController()
    const verificar = async (): Promise<ResultadoLoginRemoto> => ({
      ok: true,
      usuario: filaRemotaUsuario(idNube, 'Gustavo', TIPO_SUPERADMIN),
      llave: 'llave-autoenrolada',
    })

    const usuario = await controlador.iniciarSesion('Gustavo', 'clave', verificar)

    expect(usuario?.id).toBe(idNube)
    expect(usuario?.tipo_usuario).toBe(TIPO_SUPERADMIN)
    expect(hayLlaveConfigurada()).toBe(true)
    expect(obtenerLlave()).toBe('llave-autoenrolada')
    expect(await db.usuarios.get(idNube)).toBeDefined()
    expect(mocSincronizarBajando).toHaveBeenCalledTimes(1)
    expect(mocSincronizarAhora).toHaveBeenCalledTimes(1)
  })

  it('desaloja un fantasma local con el mismo nombre antes de sembrar la cuenta de la nube', async () => {
    const idNube = 'id-cloud-real'
    const idFantasma = 'id-fantasma'
    const ahora = Date.now()
    await db.usuarios.add({
      id: idFantasma,
      nombre_usuario: 'Gustavo',
      tipo_usuario: TIPO_REGISTRADO,
      contrasena_hash: 'hash',
      salt: 'salt',
      indicio_usuario: 'indicio',
      fecha_registro: '2026-01-01 10:00',
      creadoEn: ahora,
      actualizadoEn: ahora,
      version: 1,
      eliminado: false,
      dispositivo: 'fantasma',
    })
    const fantasma = (await db.usuarios.get(idFantasma)) as never
    await encolar('usuarios', fantasma)
    expect(await db.outbox.get(idOutbox('usuarios', idFantasma))).toBeDefined()

    const controlador = new UsuarioController()
    await controlador.iniciarSesion('Gustavo', 'clave', async (): Promise<ResultadoLoginRemoto> => ({
      ok: true,
      usuario: filaRemotaUsuario(idNube, 'Gustavo', TIPO_SUPERADMIN),
    }))

    expect(await db.usuarios.get(idFantasma)).toBeUndefined()
    expect(await db.usuarios.get(idNube)).toBeDefined()
    expect(await db.outbox.get(idOutbox('usuarios', idFantasma))).toBeUndefined()
  })

  it('un usuario no-propietario entra sin llave (no recibe ninguna)', async () => {
    const controlador = new UsuarioController()
    const usuario = await controlador.iniciarSesion(
      'cajero',
      'clave',
      async (): Promise<ResultadoLoginRemoto> => ({
        ok: true,
        usuario: filaRemotaUsuario('id-cajero', 'cajero', TIPO_REGISTRADO),
      }),
    )
    expect(usuario?.nombre_usuario).toBe('cajero')
    expect(usuario?.tipo_usuario).toBe(TIPO_REGISTRADO)
    expect(hayLlaveConfigurada()).toBe(false)
    expect(mocSincronizarBajando).toHaveBeenCalledTimes(1)
    expect(mocSincronizarAhora).not.toHaveBeenCalled()
  })

  it('un rechazo de credenciales en la nube cuenta un fallo y devuelve null', async () => {
    const controlador = new UsuarioController()
    const resultado = await controlador.iniciarSesion(
      'cajero',
      'mala',
      async (): Promise<ResultadoLoginRemoto> => ({ ok: false, motivo: 'credenciales' }),
    )
    expect(resultado).toBeNull()
    expect((await controlador.consultarBloqueoDeLogin('cajero')).fallos).toBe(1)
  })

  it('con la nube indisponible cae al login local cuando la cuenta ya está descargada', async () => {
    const controlador = new UsuarioController()
    await controlador.registrarUsuario('pepe', 'clave123', 'indicio', false, async () => false)

    expect(await controlador.iniciarSesion('pepe', 'clave123', sinNube)).not.toBeNull()
    expect(await controlador.iniciarSesion('pepe', 'mala', sinNube)).toBeNull()
  })

  it('un usuario bloqueado no llega a consultar la nube', async () => {
    const controlador = new UsuarioController()
    for (let i = 0; i < 5; i++) {
      registrarFallo('login', 'bloqueado')
    }
    const verificar = vi.fn(async (): Promise<ResultadoLoginRemoto> => ({ ok: false, motivo: 'credenciales' }))

    expect(await controlador.iniciarSesion('bloqueado', 'clave', verificar)).toBeNull()
    expect(verificar).not.toHaveBeenCalled()
  })
})