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

/**
 * Controlador de usuarios (port de `tienda.controller.UserController`):
 * inicio de sesión, registro con solicitud de permiso, recuperación por
 * indicio, aprobación de solicitudes y gestión de usuarios.
 */
export class UsuarioController {
  private readonly usuarioDao = new UsuarioDao()
  private readonly solicitudDao = new SolicitudAdminDao()

  /** Valida las credenciales y devuelve el usuario autenticado. */
  async iniciarSesion(
    nombreDeUsuario: string,
    contrasena: string,
  ): Promise<Usuario | null> {
    if (nombreDeUsuario == null || nombreDeUsuario.trim() === '' || contrasena == null || contrasena === '') {
      return null
    }
    const usuario = await this.usuarioDao.buscarPorNombre(nombreDeUsuario)
    if (!usuario) {
      return null
    }
    const valida = await verificarContrasena(contrasena, usuario.salt, usuario.contrasena_hash)
    if (!valida) {
      return null
    }
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

  /** Verifica que el indicio de seguridad coincida (paso previo al restablecer). */
  async verificarIndicio(nombreDeUsuario: string, indicio: string): Promise<boolean> {
    const usuario = await this.usuarioDao.buscarPorNombre(nombreDeUsuario)
    if (!usuario || !indicio) {
      return false
    }
    return usuario.indicio_usuario.trim().toLowerCase() === indicio.trim().toLowerCase()
  }

  /** Restablece la contraseña tras validar el indicio. */
  async restablecerContrasena(
    nombreDeUsuario: string,
    indicio: string,
    nuevaContrasena: string,
  ): Promise<Resultado> {
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

  /** Elimina un usuario; no permite eliminar el último administrador. */
  async eliminarUsuario(idDeUsuario: string): Promise<Resultado> {
    const usuario = await this.usuarioDao.buscarPorId(idDeUsuario)
    if (!usuario) {
      return Resultado.error('El usuario no existe.')
    }
    if (usuario.tipo_usuario === TIPO_ADMIN && (await this.usuarioDao.contarAdministradores()) <= 1) {
      return Resultado.error('No se puede eliminar el último administrador del sistema.')
    }
    await this.usuarioDao.eliminar(idDeUsuario)
    return Resultado.exito(`Usuario "${usuario.nombre_usuario}" eliminado.`)
  }

  /** Aprueba una solicitud: promueve al usuario y marca la solicitud. */
  async aprobarSolicitud(idDeSolicitud: string): Promise<Resultado> {
    const solicitud = await this.buscarSolicitud(idDeSolicitud)
    if (!solicitud) {
      return Resultado.error('No se encontró la solicitud.')
    }
    if (solicitud.estado !== ESTADO_PENDIENTE) {
      return Resultado.error('Solo se pueden aprobar solicitudes pendientes.')
    }
    const usuario = await this.usuarioDao.buscarPorId(solicitud.usuario_id)
    if (!usuario) {
      return Resultado.error('El usuario asociado ya no existe.')
    }
    await this.usuarioDao.actualizar({ ...usuario, tipo_usuario: TIPO_ADMIN })
    await this.solicitudDao.actualizarEstado(idDeSolicitud, ESTADO_APROBADA)
    return Resultado.exito(`Permiso de administrador otorgado a "${usuario.nombre_usuario}".`)
  }

  /** Rechaza una solicitud de permiso de administrador. */
  async rechazarSolicitud(idDeSolicitud: string): Promise<Resultado> {
    const solicitud = await this.buscarSolicitud(idDeSolicitud)
    if (!solicitud) {
      return Resultado.error('No se encontró la solicitud.')
    }
    if (solicitud.estado !== ESTADO_PENDIENTE) {
      return Resultado.error('Solo se pueden rechazar solicitudes pendientes.')
    }
    await this.solicitudDao.actualizarEstado(idDeSolicitud, ESTADO_RECHAZADA)
    return Resultado.exito(
      `Solicitud de "${solicitud.nombre_usuario ?? 'usuario'}" rechazada.`,
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

  private async buscarSolicitud(idDeSolicitud: string): Promise<SolicitudAdmin | undefined> {
    const todas = await this.solicitudDao.obtenerTodas()
    return todas.find((s) => s.id === idDeSolicitud)
  }
}