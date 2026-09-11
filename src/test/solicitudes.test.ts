import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { inicializarApp } from '../lib/inicializacion'
import { UsuarioController } from '../controller/UsuarioController'
import {
  ESTADO_APROBADA,
  ESTADO_PENDIENTE,
  ESTADO_RECHAZADA,
  TIPO_ADMIN,
  TIPO_REGISTRADO,
} from '../model/types'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

/** Crea un admin y un aspirante con solicitud pendiente; devuelve sus ids. */
async function sembrarAspirante(): Promise<{ idSolicitud: string; idAspirante: string }> {
  const controlador = new UsuarioController()
  await controlador.registrarUsuario('admin', 'clave123', 'indicio admin', false, async () => false)
  await controlador.registrarUsuario('aspirante', 'clave123', 'indicio', true)
  const aspirante = (await controlador.obtenerUsuarios()).find((u) => u.nombre_usuario === 'aspirante')
  const solicitud = (await controlador.obtenerSolicitudes()).find((s) => s.usuario_id === aspirante?.id)
  if (!aspirante || !solicitud) {
    throw new Error('No se pudo sembrar el aspirante y su solicitud.')
  }
  return { idSolicitud: solicitud.id, idAspirante: aspirante.id }
}

async function tipoDeUsuario(idAspirante: string): Promise<string | undefined> {
  return (await db.usuarios.get(idAspirante))?.tipo_usuario
}

async function estadoDeSolicitud(idSolicitud: string): Promise<string | undefined> {
  return (await db.solicitudes_admin.get(idSolicitud))?.estado
}

function versionEnCola(id: string, tabla: 'usuarios' | 'solicitudes_admin'): Promise<number | undefined> {
  return db.outbox.get(`${tabla}:${id}`).then((item) => item?.registro.version)
}

describe('Promoción de administrador atómica', () => {
  it('aprueba: promueve al usuario y marca la solicitud en una sola transacción', async () => {
    await inicializarApp()
    const { idSolicitud, idAspirante } = await sembrarAspirante()
    const controlador = new UsuarioController()

    const resultado = await controlador.aprobarSolicitud(idSolicitud)
    expect(resultado.exito).toBe(true)
    expect(resultado.mensaje).toContain('aspirante')

    expect(await tipoDeUsuario(idAspirante)).toBe(TIPO_ADMIN)
    expect(await estadoDeSolicitud(idSolicitud)).toBe(ESTADO_APROBADA)

    const usuarioEnCola = await db.outbox.get(`usuarios:${idAspirante}`)
    const solicitudEnCola = await db.outbox.get(`solicitudes_admin:${idSolicitud}`)
    expect(usuarioEnCola?.registro.version).toBe(2)
    expect(solicitudEnCola?.registro.version).toBe(2)
    expect(usuarioEnCola?.registro.actualizadoEn).toBe(solicitudEnCola?.registro.actualizadoEn)
  })

  it('revierte ambas escrituras si la segunda falla a mitad de la transacción', async () => {
    await inicializarApp()
    const { idSolicitud, idAspirante } = await sembrarAspirante()
    const controlador = new UsuarioController()

    const putOriginal = db.solicitudes_admin.put
    db.solicitudes_admin.put = (async () => {
      throw new Error('Fallo simulado de la segunda escritura.')
    }) as unknown as typeof db.solicitudes_admin.put
    try {
      const resultado = await controlador.aprobarSolicitud(idSolicitud)
      expect(resultado.exito).toBe(false)
    } finally {
      db.solicitudes_admin.put = putOriginal
    }

    expect(await tipoDeUsuario(idAspirante)).toBe(TIPO_REGISTRADO)
    expect(await estadoDeSolicitud(idSolicitud)).toBe(ESTADO_PENDIENTE)
    expect(await versionEnCola(idAspirante, 'usuarios')).toBe(1)
    expect(await versionEnCola(idSolicitud, 'solicitudes_admin')).toBe(1)
  })

  it('no aprueba una solicitud ya resuelta y no deja cambios a medias', async () => {
    await inicializarApp()
    const { idSolicitud, idAspirante } = await sembrarAspirante()
    const controlador = new UsuarioController()
    await controlador.aprobarSolicitud(idSolicitud)
    const pendientesAntes = await db.outbox.toArray()

    const resultado = await controlador.aprobarSolicitud(idSolicitud)
    expect(resultado.exito).toBe(false)
    expect(resultado.mensaje).toContain('pendientes')

    expect(await tipoDeUsuario(idAspirante)).toBe(TIPO_ADMIN)
    expect(await estadoDeSolicitud(idSolicitud)).toBe(ESTADO_APROBADA)
    expect(await db.outbox.toArray()).toEqual(pendientesAntes)
  })

  it('no aprueba cuando el usuario asociado ya no existe', async () => {
    await inicializarApp()
    const { idSolicitud, idAspirante } = await sembrarAspirante()
    const controlador = new UsuarioController()
    const aspirante = (await controlador.obtenerUsuarios()).find((u) => u.nombre_usuario === 'aspirante')
    if (!aspirante) {
      throw new Error('No se encontró al aspirante.')
    }
    await db.usuarios.update(idAspirante, { eliminado: true })
    const pendientesAntes = await db.outbox.count()

    const resultado = await controlador.aprobarSolicitud(idSolicitud)
    expect(resultado.exito).toBe(false)
    expect(resultado.mensaje).toContain('no existe')

    expect(await estadoDeSolicitud(idSolicitud)).toBe(ESTADO_PENDIENTE)
    expect(await db.outbox.count()).toBe(pendientesAntes)
  })

  it('rechaza la solicitud sin tocar el rol del usuario', async () => {
    await inicializarApp()
    const { idSolicitud, idAspirante } = await sembrarAspirante()
    const controlador = new UsuarioController()

    const resultado = await controlador.rechazarSolicitud(idSolicitud)
    expect(resultado.exito).toBe(true)
    expect(resultado.mensaje).toContain('aspirante')

    expect(await estadoDeSolicitud(idSolicitud)).toBe(ESTADO_RECHAZADA)
    expect(await tipoDeUsuario(idAspirante)).toBe(TIPO_REGISTRADO)
    expect(await versionEnCola(idAspirante, 'usuarios')).toBe(1)
    expect(await versionEnCola(idSolicitud, 'solicitudes_admin')).toBe(2)
  })

  it('no rechaza una solicitud ya resuelta y no encola nada', async () => {
    await inicializarApp()
    const { idSolicitud } = await sembrarAspirante()
    const controlador = new UsuarioController()
    await controlador.aprobarSolicitud(idSolicitud)
    const pendientesAntes = await db.outbox.count()

    const resultado = await controlador.rechazarSolicitud(idSolicitud)
    expect(resultado.exito).toBe(false)
    expect(resultado.mensaje).toContain('pendientes')
    expect(await db.outbox.count()).toBe(pendientesAntes)
  })
})

describe('Eliminación de usuario con solicitudes pendientes', () => {
  it('elimina al usuario y rechaza sus solicitudes PENDIENTE en una sola transacción', async () => {
    await inicializarApp()
    const { idSolicitud, idAspirante } = await sembrarAspirante()
    const controlador = new UsuarioController()

    const resultado = await controlador.eliminarUsuario(idAspirante)
    expect(resultado.exito).toBe(true)
    expect(resultado.mensaje).toContain('aspirante')

    expect((await db.usuarios.get(idAspirante))?.eliminado).toBe(true)
    expect(await estadoDeSolicitud(idSolicitud)).toBe(ESTADO_RECHAZADA)

    const usuarioEnCola = await db.outbox.get(`usuarios:${idAspirante}`)
    const solicitudEnCola = await db.outbox.get(`solicitudes_admin:${idSolicitud}`)
    expect(usuarioEnCola?.registro.eliminado).toBe(true)
    expect(usuarioEnCola?.registro.version).toBe(2)
    expect(solicitudEnCola?.registro.version).toBe(2)
    expect(usuarioEnCola?.registro.actualizadoEn).toBe(solicitudEnCola?.registro.actualizadoEn)
  })

  it('elimina al usuario sin tocar solicitudes ya resueltas', async () => {
    await inicializarApp()
    const { idSolicitud, idAspirante } = await sembrarAspirante()
    const controlador = new UsuarioController()
    await controlador.aprobarSolicitud(idSolicitud)

    const resultado = await controlador.eliminarUsuario(idAspirante)
    expect(resultado.exito).toBe(true)
    expect((await db.usuarios.get(idAspirante))?.eliminado).toBe(true)
    expect(await estadoDeSolicitud(idSolicitud)).toBe(ESTADO_APROBADA)
  })

  it('no elimina al último administrador y no encola nada', async () => {
    await inicializarApp()
    const controlador = new UsuarioController()
    await controlador.registrarUsuario('solo_admin', 'clave123', 'indicio', false, async () => false)
    const admin = (await controlador.obtenerUsuarios()).find((u) => u.nombre_usuario === 'solo_admin')
    if (!admin) {
      throw new Error('No se encontro al administrador.')
    }
    const pendientesAntes = await db.outbox.count()

    const resultado = await controlador.eliminarUsuario(admin.id)
    expect(resultado.exito).toBe(false)
    expect(resultado.mensaje).toContain('último administrador')
    expect(await db.outbox.count()).toBe(pendientesAntes)
  })

  it('revierte la tumba si falla el rechazo de la solicitud', async () => {
    await inicializarApp()
    const { idSolicitud, idAspirante } = await sembrarAspirante()
    const controlador = new UsuarioController()

    const putOriginal = db.solicitudes_admin.put
    db.solicitudes_admin.put = (async () => {
      throw new Error('Fallo simulado del rechazo de la solicitud.')
    }) as unknown as typeof db.solicitudes_admin.put
    try {
      const resultado = await controlador.eliminarUsuario(idAspirante)
      expect(resultado.exito).toBe(false)
    } finally {
      db.solicitudes_admin.put = putOriginal
    }

    expect((await db.usuarios.get(idAspirante))?.eliminado).toBe(false)
    expect(await estadoDeSolicitud(idSolicitud)).toBe(ESTADO_PENDIENTE)
    expect(await versionEnCola(idAspirante, 'usuarios')).toBe(1)
    expect(await versionEnCola(idSolicitud, 'solicitudes_admin')).toBe(1)
  })
})