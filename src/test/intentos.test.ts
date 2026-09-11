import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { inicializarApp } from '../lib/inicializacion'
import { UsuarioController } from '../controller/UsuarioController'
import {
  estadoBloqueo,
  registrarFalloDeIndicio,
  registrarIndicioCorrecto,
  registrarFallo,
  consultarBloqueo,
  formatearEspera,
  MAX_INTENTOS_FALLIDOS,
  ESPERA_INICIAL_MS,
  ESPERA_MAXIMA_MS,
  type EstadoBloqueo,
} from '../lib/intentos'

beforeEach(async () => {
  window.localStorage.clear()
  await db.delete()
  await db.open()
})

describe('Backoff del indicio de seguridad', () => {
  it('no bloquea antes de alcanzar el lÃ­mite de fallos', () => {
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS - 1; i++) {
      const estado = registrarFalloDeIndicio('admin')
      expect(estado.bloqueado).toBe(false)
      expect(estado.fallos).toBe(i + 1)
    }
  })

  it('bloquea al cruzar el lÃ­mite con la espera inicial', () => {
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) {
      registrarFalloDeIndicio('admin')
    }
    const estado = estadoBloqueo('admin')
    expect(estado.bloqueado).toBe(true)
    expect(estado.esperaRestanteMs).toBeGreaterThanOrEqual(ESPERA_INICIAL_MS - 1000)
    expect(estado.esperaRestanteMs).toBeLessThanOrEqual(ESPERA_INICIAL_MS + 1000)
  })

  it('duplica la espera por cada fallo adicional', () => {
    registrarFalloDeIndicio('admin')
    registrarFalloDeIndicio('admin')
    registrarFalloDeIndicio('admin')
    registrarFalloDeIndicio('admin')
    const quinto = registrarFalloDeIndicio('admin')
    const sexto = registrarFalloDeIndicio('admin')

    expect(quinto.bloqueado).toBe(true)
    expect(quinto.esperaRestanteMs).toBeGreaterThanOrEqual(ESPERA_INICIAL_MS - 1000)
    expect(quinto.esperaRestanteMs).toBeLessThanOrEqual(ESPERA_INICIAL_MS + 1000)
    expect(sexto.esperaRestanteMs).toBeGreaterThanOrEqual(ESPERA_INICIAL_MS * 2 - 2000)
    expect(sexto.esperaRestanteMs).toBeLessThanOrEqual(ESPERA_INICIAL_MS * 2 + 2000)
  })

  it('acota la espera al tope mÃ¡ximo', () => {
    let ultimo!: EstadoBloqueo
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS + 22; i++) {
      ultimo = registrarFalloDeIndicio('admin')
    }
    expect(ultimo.bloqueado).toBe(true)
    expect(ultimo.esperaRestanteMs).toBeGreaterThan(0)
    expect(ultimo.esperaRestanteMs).toBeLessThanOrEqual(ESPERA_MAXIMA_MS)
  })

  it('un indicio correcto limpia el registro anterior', () => {
    registrarFalloDeIndicio('admin')
    registrarFalloDeIndicio('admin')
    registrarFalloDeIndicio('admin')
    registrarFalloDeIndicio('admin')
    registrarFalloDeIndicio('admin')

    registrarIndicioCorrecto('admin')

    const estado = estadoBloqueo('admin')
    expect(estado.bloqueado).toBe(false)
    expect(estado.fallos).toBe(0)
  })

  it('no bloquea y limpia el registro cuando la espera ya venciÃ³', () => {
    window.localStorage.setItem(
      'indicio:bloqueo:admin',
      JSON.stringify({ fallos: 9, bloqueadoHasta: Date.now() - 1000 }),
    )

    const estado = estadoBloqueo('admin')

    expect(estado.bloqueado).toBe(false)
    expect(window.localStorage.getItem('indicio:bloqueo:admin')).toBeNull()
  })

  it('formatea la espera para los mensajes', () => {
    expect(formatearEspera(3_000)).toBe('3 segundos')
    expect(formatearEspera(150_000)).toBe('3 minutos')
    expect(formatearEspera(3_900_000)).toBe('1 hora 5 minutos')
    expect(formatearEspera(86_400_000)).toBe('24 horas')
  })

  it('el controlador bloquea verificarIndicio y restablecerContrasena durante la espera', async () => {
    await inicializarApp()
    const controlador = new UsuarioController()
    await controlador.registrarUsuario('admin', 'clave123', 'mi perro', false, async () => false)

    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) {
      await controlador.verificarIndicio('admin', 'intento incorrecto')
    }

    expect(await controlador.verificarIndicio('admin', 'mi perro')).toBe(false)
    expect((await controlador.consultarBloqueoDeIndicio('admin')).bloqueado).toBe(true)

    const restablecer = await controlador.restablecerContrasena('admin', 'mi perro', 'nueva123')
    expect(restablecer.exito).toBe(false)
    expect(restablecer.mensaje).toContain('Demasiados intentos')
  })

  it('el controlador permite restablecer con el indicio correcto sin fallos previos', async () => {
    await inicializarApp()
    const controlador = new UsuarioController()
    await controlador.registrarUsuario('admin', 'clave123', 'mi perro', false, async () => false)

    expect(await controlador.verificarIndicio('admin', 'mi perro')).toBe(true)
    expect((await controlador.consultarBloqueoDeIndicio('admin')).bloqueado).toBe(false)

    const restablecer = await controlador.restablecerContrasena('admin', 'mi perro', 'nueva123')
    expect(restablecer.exito).toBe(true)
  })
})

describe('Backoff del inicio de sesiÃ³n', () => {
  it('no bloquea el login antes de alcanzar el lÃ­mite de fallos', () => {
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS - 1; i++) {
      const estado = registrarFallo('login', 'julieta')
      expect(estado.bloqueado).toBe(false)
    }
  })

  it('bloquea el login al cruzar el lÃ­mite y consulta el estado restante', () => {
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) {
      registrarFallo('login', 'julieta')
    }
    const estado = consultarBloqueo('login', 'julieta')
    expect(estado.bloqueado).toBe(true)
    expect(estado.esperaRestanteMs).toBeGreaterThanOrEqual(ESPERA_INICIAL_MS - 1000)
    expect(estado.esperaRestanteMs).toBeLessThanOrEqual(ESPERA_INICIAL_MS + 1000)
  })

  it('el controlador rechaza el inicio con la contraseÃ±a incorrecta y bloquea tras 5 fallos', async () => {
    await inicializarApp()
    const controlador = new UsuarioController()
    await controlador.registrarUsuario('julieta', 'clave123', 'mi perro', false, async () => false)

    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) {
      expect(await controlador.iniciarSesion('julieta', 'equivocada')).toBeNull()
    }
    expect((await controlador.consultarBloqueoDeLogin('julieta')).bloqueado).toBe(true)
  })

  it('el controlador no verifica credenciales bloqueadas sin contar fallos extra', async () => {
    await inicializarApp()
    const controlador = new UsuarioController()
    await controlador.registrarUsuario('julieta', 'clave123', 'mi perro', false, async () => false)

    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) {
      await controlador.iniciarSesion('julieta', 'equivocada')
    }
    const antes = (await controlador.consultarBloqueoDeLogin('julieta')).fallos
    expect(await controlador.iniciarSesion('julieta', 'clave123')).toBeNull()
    const despues = (await controlador.consultarBloqueoDeLogin('julieta'))
    expect(despues.bloqueado).toBe(true)
    expect(despues.fallos).toBe(antes)
  })

  it('el controlador limpia los fallos al iniciar sesiÃ³n correctamente', async () => {
    await inicializarApp()
    const controlador = new UsuarioController()
    await controlador.registrarUsuario('julieta', 'clave123', 'mi perro', false, async () => false)

    await controlador.iniciarSesion('julieta', 'equivocada')
    await controlador.iniciarSesion('julieta', 'equivocada')
    expect((await controlador.consultarBloqueoDeLogin('julieta')).fallos).toBe(2)

    expect(await controlador.iniciarSesion('julieta', 'clave123')).not.toBeNull()
    const estado = await controlador.consultarBloqueoDeLogin('julieta')
    expect(estado.bloqueado).toBe(false)
    expect(estado.fallos).toBe(0)
  })

  it('login e indicio usan registros independientes para el mismo nombre', () => {
    registrarFallo('login', 'julieta')
    registrarFallo('login', 'julieta')
    registrarFallo('login', 'julieta')
    registrarFallo('login', 'julieta')
    registrarFallo('login', 'julieta')

    expect(consultarBloqueo('login', 'julieta').bloqueado).toBe(true)
    expect(consultarBloqueo('indicio', 'julieta').bloqueado).toBe(false)

    registrarIndicioCorrecto('julieta')
    expect(consultarBloqueo('login', 'julieta').bloqueado).toBe(true)
  })
})
