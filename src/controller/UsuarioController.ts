import type { SolicitudAdmin, Usuario } from '../model/types'
import { TIPO_ADMIN, TIPO_REGISTRADO, ESTADO_PENDIENTE, ESTADO_APROBADA, ESTADO_RECHAZADA } from '../model/types'
import { UsuarioDao } from '../dao/UsuarioDao'
import { SolicitudAdminDao } from '../dao/SolicitudAdminDao'
import { Resultado } from './Resultado'
import {
  contrasenaValida,
  esHashMigrable,
  generarSalt,
  hashContrasena,
  verificarContrasena,
  LONGITUD_MINIMA_CONTRASENA,
} from '../lib/password'
import { textoNoVacio } from '../lib/validaciones'
import { formatFecha } from '../lib/fecha'
import { hayAdminRemoto } from '../lib/remoto'
import { db } from '../lib/db'
import { eliminarRegistro } from '../lib/mutaciones'
import { obtenerDispositivoId } from '../sync/dispositivo'
import { sincronizarAhora } from '../sync/syncEngine'
import {
  consultarBloqueo,
  estadoBloqueo,
  limpiarBloqueo,
  registrarFallo,
  registrarFalloDeIndicio,
  registrarIndicioCorrecto,
  formatearEspera,
  type EstadoBloqueo,
} from '../lib/intentos'

/**
 * Controlador de usuarios (port de `tienda.controller.UserController`):
 * inicio de sesión, registro con solicitud de permiso, recuperación por
 * indicio, aprobación de solicitudes y gestión de usuarios.
 */
export class UsuarioController {
  private readonly usuarioDao = new UsuarioDao()
  private readonly solicitudDao = new SolicitudAdminDao()

  /** Estado de bloqueo del inicio de sesión para un nombre de usuario. */
  async consultarBloqueoDeLogin(nombreDeUsuario: string): Promise<EstadoBloqueo> {
    return consultarBloqueo('login', (nombreDeUsuario ?? '').trim())
  }

  /** Valida las credenciales y devuelve el usuario autenticado. */
  async iniciarSesion(
    nombreDeUsuario: string,
    contrasena: string,
  ): Promise<Usuario | null> {
    const nombreLimpio = (nombreDeUsuario ?? '').trim()
    if (nombreLimpio === '' || contrasena == null || contrasena === '') {
      return null
    }
    if (consultarBloqueo('login', nombreLimpio).bloqueado) {
      return null
    }
    const usuario = await this.usuarioDao.buscarPorNombre(nombreLimpio)
    if (!usuario || !(await verificarContrasena(contrasena, usuario.salt, usuario.contrasena_hash))) {
      registrarFallo('login', nombreLimpio)
      return null
    }
    limpiarBloqueo('login', nombreLimpio)
    if (esHashMigrable(usuario.contrasena_hash)) {
      const nuevoSalt = generarSalt()
      await this.usuarioDao.actualizar({
        ...usuario,
        salt: nuevoSalt,
        contrasena_hash: await hashContrasena(contrasena, nuevoSalt),
      })
    }
    return usuario
  }

  /**
   * Registra un usuario nuevo. El rol de administrador se decide de forma
   * GLOBAL (mirando la nube, no solo este dispositivo): solo el primer
   * usuario del sistema —cuando la nube confirma que no hay ningún
   * administrador— asume el rol directamente. Si la nube ya tiene uno, o no
   * se puede confirmar (sin llave/sin conexión), el usuario queda como
   * REGISTRADO y su solicitud de permiso queda pendiente de aprobación.
   * `verificarAdminRemoto` es inyectable para pruebas; por defecto consulta
   * la Edge Function `sync` (acción `hay_admin`).
   */
  async registrarUsuario(
    nombreDeUsuario: string,
    contrasena: string,
    indicio: string,
    solicitaAdmin: boolean,
    verificarAdminRemoto: () => Promise<boolean | null> = hayAdminRemoto,
  ): Promise<Resultado> {
    const errorNombre = textoNoVacio(nombreDeUsuario, 'nombre de usuario')
    if (errorNombre) {
      return Resultado.error(errorNombre)
    }
    const errorIndicio = textoNoVacio(indicio, 'indicio de seguridad')
    if (errorIndicio) {
      return Resultado.error(errorIndicio)
    }
    if (!contrasenaValida(contrasena)) {
      return Resultado.error(
        `La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres.`,
      )
    }
    const nombreLimpio = nombreDeUsuario.trim()
    if (await this.usuarioDao.existeNombre(nombreLimpio)) {
      return Resultado.error('Ya existe un usuario con ese nombre. Elija otro.')
    }

    const salt = generarSalt()
    const hash = await hashContrasena(contrasena, salt)
    const usuario = await this.usuarioDao.insertar({
      nombre_usuario: nombreLimpio,
      tipo_usuario: TIPO_REGISTRADO,
      contrasena_hash: hash,
      salt,
      indicio_usuario: indicio.trim(),
      fecha_registro: formatFecha(new Date()),
    })

    if ((await this.usuarioDao.contarAdministradores()) === 0) {
      const hayAdmin = await verificarAdminRemoto()
      if (hayAdmin === false) {
        await this.usuarioDao.actualizar({ ...usuario, tipo_usuario: TIPO_ADMIN })
        return Resultado.exito('Primer usuario registrado como administrador.')
      }
      if (solicitaAdmin) {
        await this.solicitudDao.insertar(usuario.id)
        return hayAdmin === null
          ? Resultado.exito(
              'Usuario registrado como REGISTRADO: la nube no confirmó si existía un ' +
                'administrador, así que no se otorgó el permiso. Cuando el dispositivo ' +
                'sincronice, un administrador podrá aprobar su solicitud.',
            )
          : Resultado.exito(
              'Usuario registrado. Su solicitud de administrador quedó pendiente de aprobación.',
            )
      }
      return Resultado.exito(
        hayAdmin === null
          ? 'Registro exitoso (sin permisos de administrador: la nube no pudo confirmarse).'
          : 'Registro exitoso. Ya puede iniciar sesión.',
      )
    }
    if (!solicitaAdmin) {
      return Resultado.exito('Registro exitoso. Ya puede iniciar sesión.')
    }
    await this.solicitudDao.insertar(usuario.id)
    return Resultado.exito(
      'Usuario registrado. Su solicitud de administrador quedó pendiente de aprobación.',
    )
  }

  /** Indica si existe un usuario con el nombre indicado. */
  async existeUsuario(nombreDeUsuario: string): Promise<boolean> {
    return this.usuarioDao.existeNombre(nombreDeUsuario)
  }

  /**
   * Estado del bloqueo por intentos fallidos del indicio para un nombre de
   * usuario, para que la interfaz pueda informar cuánto falta por esperar.
   */
  async consultarBloqueoDeIndicio(nombreDeUsuario: string): Promise<EstadoBloqueo> {
    return estadoBloqueo(nombreDeUsuario)
  }

  /**
   * Verifica que el indicio de seguridad coincida (paso previo al
   * restablecer). Aplica backoff por nombre de usuario: los fallos se
   * acumulan en el dispositivo y superar el límite bloquea temporalmente la
   * verificación para frenar la fuerza bruta.
   */
  async verificarIndicio(nombreDeUsuario: string, indicio: string): Promise<boolean> {
    const nombreLimpio = (nombreDeUsuario ?? '').trim()
    if (!nombreLimpio || estadoBloqueo(nombreLimpio).bloqueado) {
      return false
    }
    const usuario = await this.usuarioDao.buscarPorNombre(nombreLimpio)
    const correcto =
      !!usuario &&
      !!indicio &&
      usuario.indicio_usuario.trim().toLowerCase() === indicio.trim().toLowerCase()
    if (correcto) {
      registrarIndicioCorrecto(nombreLimpio)
    } else {
      registrarFalloDeIndicio(nombreLimpio)
    }
    return correcto
  }

  /** Restablece la contraseña tras validar el indicio. */
  async restablecerContrasena(
    nombreDeUsuario: string,
    indicio: string,
    nuevaContrasena: string,
  ): Promise<Resultado> {
    const bloqueo = estadoBloqueo((nombreDeUsuario ?? '').trim())
    if (bloqueo.bloqueado) {
      return Resultado.error(
        `Demasiados intentos fallidos. Inténtelo de nuevo en ${formatearEspera(bloqueo.esperaRestanteMs)}.`,
      )
    }
    if (!(await this.verificarIndicio(nombreDeUsuario, indicio))) {
      return Resultado.error('El usuario no existe o el indicio no es correcto.')
    }
    if (!contrasenaValida(nuevaContrasena)) {
      return Resultado.error(
        `La nueva contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres.`,
      )
    }
    const usuario = await this.usuarioDao.buscarPorNombre(nombreDeUsuario)
    if (!usuario) {
      return Resultado.error('El usuario no existe.')
    }
    const nuevoSalt = generarSalt()
    await this.usuarioDao.actualizar({
      ...usuario,
      salt: nuevoSalt,
      contrasena_hash: await hashContrasena(nuevaContrasena, nuevoSalt),
    })
    return Resultado.exito('Contraseña restablecida correctamente.')
  }

  /**
   * Cambia la contraseña de la sesión actual tras validar la contraseña
   * anterior. Escribe con nueva sal/hash a través del outbox (sync).
   */
  async cambiarContrasena(
    idDeUsuario: string,
    contrasenaActual: string,
    nuevaContrasena: string,
  ): Promise<Resultado> {
    const usuario = await this.usuarioDao.buscarPorId(idDeUsuario)
    if (!usuario) {
      return Resultado.error('El usuario no existe.')
    }
    if (!contrasenaValida(nuevaContrasena)) {
      return Resultado.error(
        `La nueva contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres.`,
      )
    }
    if (!(await verificarContrasena(contrasenaActual, usuario.salt, usuario.contrasena_hash))) {
      return Resultado.error('La contraseña actual no es correcta.')
    }
    if (nuevaContrasena === contrasenaActual) {
      return Resultado.error('La nueva contraseña debe ser distinta de la actual.')
    }
    const nuevoSalt = generarSalt()
    await this.usuarioDao.actualizar({
      ...usuario,
      salt: nuevoSalt,
      contrasena_hash: await hashContrasena(nuevaContrasena, nuevoSalt),
    })
    return Resultado.exito('Contraseña actualizada correctamente.')
  }

  /** Permite que un usuario registrado solicite permiso de administrador. */
  async solicitarPermisoAdministrador(idDeUsuario: string): Promise<Resultado> {
    const usuario = await this.usuarioDao.buscarPorId(idDeUsuario)
    if (!usuario) {
      return Resultado.error('El usuario no existe.')
    }
    if (usuario.tipo_usuario === TIPO_ADMIN) {
      return Resultado.error('Ese usuario ya es administrador.')
    }
    if (await this.solicitudDao.tieneSolicitudPendiente(idDeUsuario)) {
      return Resultado.error('Ya tiene una solicitud pendiente de revisión.')
    }
    await this.solicitudDao.insertar(idDeUsuario)
    return Resultado.exito('Solicitud enviada. Un administrador la revisará.')
  }

  /** Modifica el nombre de usuario y el indicio de seguridad. */
  async modificarUsuario(
    usuario: Usuario,
    nuevoNombre: string,
    nuevoIndicio: string,
  ): Promise<Resultado> {
    const errorNombre = textoNoVacio(nuevoNombre, 'nombre de usuario')
    if (errorNombre) {
      return Resultado.error(errorNombre)
    }
    const errorIndicio = textoNoVacio(nuevoIndicio, 'indicio de seguridad')
    if (errorIndicio) {
      return Resultado.error(errorIndicio)
    }
    const nombreLimpio = nuevoNombre.trim()
    const existente = await this.usuarioDao.buscarPorNombre(nombreLimpio)
    if (existente && existente.id !== usuario.id) {
      return Resultado.error('Ya existe otro usuario con ese nombre.')
    }
    await this.usuarioDao.actualizar({
      ...usuario,
      nombre_usuario: nombreLimpio,
      indicio_usuario: nuevoIndicio.trim(),
    })
    return Resultado.exito('Usuario modificado correctamente.')
  }

  /**
   * Elimina un usuario; no permite eliminar el último administrador. La tumba
   * del usuario y el rechazo de sus solicitudes de permiso PENDIENTE (para no
   * dejar huérfanas) se hacen en una misma transacción Dexie: o se aplican
   * todas, o ninguna, con un solo encolado y un único `sincronizarAhora()`.
   */
  async eliminarUsuario(idDeUsuario: string): Promise<Resultado> {
    const contexto = {
      silencioso: true,
      dispositivo: await obtenerDispositivoId(),
    }
    let nombreEliminado = ''
    try {
      await db.transaction(
        'rw',
        [db.usuarios, db.solicitudes_admin, db.outbox],
        async () => {
          const usuario = await this.usuarioDao.buscarPorId(idDeUsuario)
          if (!usuario) {
            throw new Error('El usuario no existe.')
          }
          if (
            usuario.tipo_usuario === TIPO_ADMIN &&
            (await this.usuarioDao.contarAdministradores()) <= 1
          ) {
            throw new Error('No se puede eliminar el último administrador del sistema.')
          }
          const ahora = Date.now()
          await eliminarRegistro('usuarios', usuario, { ...contexto, ahora })
          for (const solicitud of await this.solicitudDao.obtenerPendientesDe(idDeUsuario)) {
            await this.solicitudDao.actualizarEstado(
              solicitud.id,
              ESTADO_RECHAZADA,
              { ...contexto, ahora },
            )
          }
          nombreEliminado = usuario.nombre_usuario
        },
      )
    } catch (error) {
      return Resultado.error(
        error instanceof Error ? error.message : 'No se pudo eliminar el usuario.',
      )
    }
    void sincronizarAhora()
    return Resultado.exito(`Usuario "${nombreEliminado}" eliminado.`)
  }

  /**
   * Aprueba una solicitud: promueve al usuario y marca la solicitud como
   * aprobada. Ambas escrituras y su encolado para sincronizar se ejecutan
   * dentro de una misma transacción Dexie: o se aplican todas, o ninguna.
   */
  async aprobarSolicitud(idDeSolicitud: string): Promise<Resultado> {
    const contexto = {
      silencioso: true,
      dispositivo: await obtenerDispositivoId(),
    }
    let nombrePromovido = ''
    try {
      await db.transaction(
        'rw',
        [db.usuarios, db.solicitudes_admin, db.outbox],
        async () => {
          const solicitud = await this.solicitudDao.buscarPorId(idDeSolicitud)
          if (!solicitud || solicitud.eliminado) {
            throw new Error('No se encontró la solicitud.')
          }
          if (solicitud.estado !== ESTADO_PENDIENTE) {
            throw new Error('Solo se pueden aprobar solicitudes pendientes.')
          }
          const usuario = await this.usuarioDao.buscarPorId(solicitud.usuario_id)
          if (!usuario) {
            throw new Error('El usuario asociado ya no existe.')
          }
          const contextoConMarca = { ...contexto, ahora: Date.now() }
          await this.usuarioDao.actualizar(
            { ...usuario, tipo_usuario: TIPO_ADMIN },
            contextoConMarca,
          )
          await this.solicitudDao.actualizarEstado(
            idDeSolicitud,
            ESTADO_APROBADA,
            contextoConMarca,
          )
          nombrePromovido = usuario.nombre_usuario
        },
      )
    } catch (error) {
      return Resultado.error(
        error instanceof Error ? error.message : 'No se pudo aprobar la solicitud.',
      )
    }
    void sincronizarAhora()
    return Resultado.exito(`Permiso de administrador otorgado a "${nombrePromovido}".`)
  }

  /**
   * Rechaza una solicitud de permiso: valida el estado y lo cambia dentro de
   * una misma transacción Dexie (un solo encolado, un solo sincronizarAhora).
   */
  async rechazarSolicitud(idDeSolicitud: string): Promise<Resultado> {
    const contexto = {
      silencioso: true,
      dispositivo: await obtenerDispositivoId(),
    }
    let nombreSolicitante = ''
    try {
      await db.transaction(
        'rw',
        [db.usuarios, db.solicitudes_admin, db.outbox],
        async () => {
          const solicitud = await this.solicitudDao.buscarPorId(idDeSolicitud)
          if (!solicitud || solicitud.eliminado) {
            throw new Error('No se encontró la solicitud.')
          }
          if (solicitud.estado !== ESTADO_PENDIENTE) {
            throw new Error('Solo se pueden rechazar solicitudes pendientes.')
          }
          const usuario = await this.usuarioDao.buscarPorId(solicitud.usuario_id)
          nombreSolicitante = usuario?.nombre_usuario ?? ''
          await this.solicitudDao.actualizarEstado(
            idDeSolicitud,
            ESTADO_RECHAZADA,
            { ...contexto, ahora: Date.now() },
          )
        },
      )
    } catch (error) {
      return Resultado.error(
        error instanceof Error ? error.message : 'No se pudo rechazar la solicitud.',
      )
    }
    void sincronizarAhora()
    return Resultado.exito(
      `Solicitud de "${nombreSolicitante || 'usuario'}" rechazada.`,
    )
  }

  /** Devuelve todos los usuarios activos. */
  async obtenerUsuarios(): Promise<Usuario[]> {
    return this.usuarioDao.obtenerTodos()
  }

  /** Devuelve el historial de solicitudes de permiso. */
  async obtenerSolicitudes(): Promise<SolicitudAdmin[]> {
    return this.solicitudDao.obtenerTodas()
  }
}