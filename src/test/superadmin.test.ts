import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { inicializarApp } from '../lib/inicializacion'
import { UsuarioController } from '../controller/UsuarioController'
import { useSesionStore } from '../controller/SessionController'
import {
  NOMBRE_SUPERADMIN,
  TIPO_ADMIN,
  TIPO_REGISTRADO,
  TIPO_SUPERADMIN,
  type Usuario,
} from '../model/types'

beforeEach(async () => {
  await db.delete()
  await db.open()
  useSesionStore.getState().cerrarSesion()
})

async function sembrarDuenoYSegundo(): Promise<{ dueno: Usuario; segundo: Usuario }> {
  const controlador = new UsuarioController()
  // La cuenta del dueño se promueve en la nube (no pasa por registrarUsuario,
  // que bloquea el nombre reservado); aquí se inserta directo como sembrado.
  const ahora = Date.now()
  const duenoId = crypto.randomUUID()
  await db.usuarios.add({
    id: duenoId,
    nombre_usuario: NOMBRE_SUPERADMIN,
    tipo_usuario: TIPO_SUPERADMIN,
    contrasena_hash: 'hash',
    salt: 'salt',
    indicio_usuario: 'indicio del dueño',
    fecha_registro: '2026-01-01 10:00',
    creadoEn: ahora,
    actualizadoEn: ahora,
    version: 1,
    eliminado: false,
    dispositivo: 'test-dueno',
  })
  const dueno = (await db.usuarios.get(duenoId)) as Usuario
  await controlador.registrarUsuario('maria', 'clave123', 'indicio', false)
  const segundo = (await controlador.obtenerUsuarios()).find((u) => u.nombre_usuario === 'maria')
  if (!segundo) {
    throw new Error('No se pudo sembrar al segundo usuario.')
  }
  return { dueno, segundo }
}

describe('Cuenta SUPERADMIN (el dueño)', () => {
  it('no permite registrar el nombre reservado de la cuenta del dueño', async () => {
    await inicializarApp()
    await new UsuarioController().registrarUsuario(
      NOMBRE_SUPERADMIN,
      'clave123',
      'indicio',
      false,
    )
    const otro = await new UsuarioController().registrarUsuario(
      'GUSTAVO',
      'clave123',
      'indicio',
      false,
    )
    expect(otro.exito).toBe(false)
    expect(otro.mensaje).toContain(NOMBRE_SUPERADMIN)
  })

  it('solo el dueño puede modificar la cuenta SUPERADMIN y mantiene su nombre', async () => {
    await inicializarApp()
    const { dueno, segundo } = await sembrarDuenoYSegundo()

    const comoOtro = await new UsuarioController().modificarUsuario(
      dueno,
      NOMBRE_SUPERADMIN,
      'otro indicio',
    )
    expect(comoOtro.exito).toBe(false)
    expect(comoOtro.mensaje).toContain('SUPERADMIN')

    useSesionStore.getState().iniciarSesion(dueno)
    const renombrado = await new UsuarioController().modificarUsuario(
      dueno,
      'OtroNombre',
      'indicio',
    )
    expect(renombrado.exito).toBe(false)
    expect(renombrado.mensaje).toContain('conservar su nombre')
    expect((await db.usuarios.get(dueno.id))?.nombre_usuario).toBe(NOMBRE_SUPERADMIN)
    void segundo
  })

  it('la cuenta SUPERADMIN no se puede eliminar por nadie', async () => {
    await inicializarApp()
    const { dueno } = await sembrarDuenoYSegundo()
    const controlador = new UsuarioController()

    const resultado = await controlador.eliminarUsuario(dueno.id, dueno.id)
    expect(resultado.exito).toBe(false)
    expect(resultado.mensaje).toContain('SUPERADMIN')
    expect((await db.usuarios.get(dueno.id))?.eliminado).toBe(false)
  })
})

describe('Cambio de rol (dar/quitar administrador)', () => {
  it('solo el SUPERADMIN puede dar el rol de administrador', async () => {
    await inicializarApp()
    const { dueno, segundo } = await sembrarDuenoYSegundo()
    const controlador = new UsuarioController()

    const comoAdmin = await controlador.cambiarRolDeUsuario(segundo.id, TIPO_ADMIN, segundo.id)
    expect(comoAdmin.exito).toBe(false)
    expect((await db.usuarios.get(segundo.id))?.tipo_usuario).toBe(TIPO_REGISTRADO)

    const comoDueno = await controlador.cambiarRolDeUsuario(segundo.id, TIPO_ADMIN, dueno.id)
    expect(comoDueno.exito).toBe(true)
    expect((await db.usuarios.get(segundo.id))?.tipo_usuario).toBe(TIPO_ADMIN)
  })

  it('solo el SUPERADMIN puede quitar el rol de administrador', async () => {
    await inicializarApp()
    const { dueno, segundo } = await sembrarDuenoYSegundo()
    const controlador = new UsuarioController()
    await db.usuarios.update(segundo.id, { tipo_usuario: TIPO_ADMIN })

    const comoAdmin = await controlador.cambiarRolDeUsuario(segundo.id, TIPO_REGISTRADO, segundo.id)
    expect(comoAdmin.exito).toBe(false)

    const comoDueno = await controlador.cambiarRolDeUsuario(segundo.id, TIPO_REGISTRADO, dueno.id)
    expect(comoDueno.exito).toBe(true)
    expect((await db.usuarios.get(segundo.id))?.tipo_usuario).toBe(TIPO_REGISTRADO)
  })

  it('no cambia el rol de la cuenta SUPERADMIN ni asigna SUPERADMIN a otro', async () => {
    await inicializarApp()
    const { dueno, segundo } = await sembrarDuenoYSegundo()
    const controlador = new UsuarioController()

    const alDueno = await controlador.cambiarRolDeUsuario(dueno.id, TIPO_REGISTRADO, dueno.id)
    expect(alDueno.exito).toBe(false)
    expect(alDueno.mensaje).toContain('SUPERADMIN')

    const asignarSuper = await controlador.cambiarRolDeUsuario(segundo.id, TIPO_SUPERADMIN, dueno.id)
    expect(asignarSuper.exito).toBe(false)
    expect((await db.usuarios.get(segundo.id))?.tipo_usuario).toBe(TIPO_REGISTRADO)
  })

  it('no cambia al mismo rol que ya tiene', async () => {
    await inicializarApp()
    const { dueno, segundo } = await sembrarDuenoYSegundo()
    const controlador = new UsuarioController()

    const repetido = await controlador.cambiarRolDeUsuario(segundo.id, TIPO_REGISTRADO, dueno.id)
    expect(repetido.exito).toBe(false)
    expect(repetido.mensaje).toContain('registrado')
  })
})

describe('Eliminación con SUPERADMIN presente', () => {
  it('el SUPERADMIN puede eliminar administradores, incluso el último', async () => {
    await inicializarApp()
    const { dueno, segundo } = await sembrarDuenoYSegundo()
    const controlador = new UsuarioController()

    await controlador.cambiarRolDeUsuario(segundo.id, TIPO_ADMIN, dueno.id)
    const resultado = await controlador.eliminarUsuario(segundo.id, dueno.id)
    expect(resultado.exito).toBe(true)
    expect((await db.usuarios.get(segundo.id))?.eliminado).toBe(true)
  })

  it('el admin no elimina al último administrador puro aunque exista el SUPERADMIN', async () => {
    await inicializarApp()
    const { dueno, segundo } = await sembrarDuenoYSegundo()
    const controlador = new UsuarioController()
    // segundo pasa a admin: en la práctica ya no queda otro admin puro que él
    await db.usuarios.update(segundo.id, { tipo_usuario: TIPO_ADMIN })

    const resultado = await controlador.eliminarUsuario(segundo.id, segundo.id)
    expect(resultado.exito).toBe(false)
    expect(resultado.mensaje).toContain('último administrador')
    expect((await db.usuarios.get(segundo.id))?.eliminado).toBe(false)
    void dueno
  })
})

describe('Nombre reservado en la solicitud de permisos', () => {
  it('un "Gustavo" REGISTRADO fantasma no puede solicitar permiso de administrador', async () => {
    await inicializarApp()
    const ahora = Date.now()
    await db.usuarios.add({
      id: crypto.randomUUID(),
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
      dispositivo: 'test-fantasma',
    })
    const fantasma = (await new UsuarioController().obtenerUsuarios()).find(
      (u) => u.nombre_usuario.toLowerCase() === 'gustavo',
    )
    if (!fantasma) {
      throw new Error('No se pudo sembrar la copia fantasma.')
    }

    const resultado = await new UsuarioController().solicitarPermisoAdministrador(fantasma.id)

    expect(resultado.exito).toBe(false)
    expect(resultado.mensaje).toContain('SUPERADMIN')
    expect(await db.solicitudes_admin.count()).toBe(0)
  })
})