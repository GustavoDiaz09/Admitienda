import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { inicializarApp } from '../lib/inicializacion'
import { UsuarioController } from '../controller/UsuarioController'
import { UsuarioDao } from '../dao/UsuarioDao'
import { verificarContrasena } from '../lib/password'

beforeEach(async () => {
  window.localStorage.clear()
  await db.delete()
  await db.open()
})

async function crearAdmin(): Promise<string> {
  await inicializarApp()
  const controlador = new UsuarioController()
  await controlador.registrarUsuario('admin', 'clave123', 'mi perro', false, async () => false)
  const usuario = await new UsuarioDao().buscarPorNombre('admin')
  if (!usuario) throw new Error('El usuario de prueba no se creó.')
  return usuario.id
}

describe('Cambio de contraseña desde la sesión', () => {
  it('cambia la contraseña al confirmar la anterior', async () => {
    const id = await crearAdmin()
    const controlador = new UsuarioController()

    const resultado = await controlador.cambiarContrasena(id, 'clave123', 'nueva123')

    expect(resultado.exito).toBe(true)
    const actualizado = await new UsuarioDao().buscarPorNombre('admin')
    if (!actualizado) throw new Error('El usuario desapareció.')
    expect(await verificarContrasena('nueva123', actualizado.salt, actualizado.contrasena_hash)).toBe(true)
    expect(await verificarContrasena('clave123', actualizado.salt, actualizado.contrasena_hash)).toBe(false)
  })

  it('rechaza cuando la contraseña actual es incorrecta', async () => {
    const id = await crearAdmin()
    const controlador = new UsuarioController()
    const usuario = await new UsuarioDao().buscarPorNombre('admin')

    const resultado = await controlador.cambiarContrasena(id, 'incorrecta', 'nueva123')

    expect(resultado.exito).toBe(false)
    expect(resultado.mensaje).toBe('La contraseña actual no es correcta.')
    const actualizado = await new UsuarioDao().buscarPorNombre('admin')
    expect(actualizado?.contrasena_hash).toBe(usuario?.contrasena_hash)
    expect(
      await verificarContrasena('nueva123', usuario?.salt ?? '', usuario?.contrasena_hash ?? ''),
    ).toBe(false)
  })

  it('rechaza una contraseña nueva demasiado corta', async () => {
    const id = await crearAdmin()
    const controlador = new UsuarioController()

    const resultado = await controlador.cambiarContrasena(id, 'clave123', '12345')

    expect(resultado.exito).toBe(false)
    expect(resultado.mensaje).toContain('al menos 6 caracteres')
  })

  it('exige que la nueva contraseña sea distinta de la actual', async () => {
    const id = await crearAdmin()
    const controlador = new UsuarioController()

    const resultado = await controlador.cambiarContrasena(id, 'clave123', 'clave123')

    expect(resultado.exito).toBe(false)
    expect(resultado.mensaje).toBe('La nueva contraseña debe ser distinta de la actual.')
  })

  it('rechaza un usuario inexistente', async () => {
    const controlador = new UsuarioController()

    const resultado = await controlador.cambiarContrasena('id-que-no-existe', 'clave123', 'nueva123')

    expect(resultado.exito).toBe(false)
    expect(resultado.mensaje).toBe('El usuario no existe.')
  })
})