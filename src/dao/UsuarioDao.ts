import { db } from '../lib/db'
import { nuevoRegistro, actualizarRegistro, eliminarRegistro, type ContextoEscritura } from '../lib/mutaciones'
import { NOMBRE_SUPERADMIN, TIPO_ADMIN, TIPO_SUPERADMIN, type RegistroBase, type Usuario } from '../model/types'

/**
 * Acceso a datos de usuarios (port de `tienda.dao.UserDao`). La
 * autenticación es 100 % local: los hashes y salts viven en IndexedDB.
 */
export class UsuarioDao {
  /** Registra un usuario nuevo y lo encola para sincronizar. */
  async insertar(datos: Omit<Usuario, keyof RegistroBase>): Promise<Usuario> {
    return nuevoRegistro('usuarios', datos)
  }

  /** Modifica un usuario existente y encola el cambio. */
  async actualizar(usuario: Usuario, contexto?: ContextoEscritura): Promise<Usuario> {
    return actualizarRegistro('usuarios', usuario, contexto)
  }

  /** Borrado lógico de un usuario (se propaga vía sincronización). */
  async eliminar(idDeUsuario: string): Promise<void> {
    const usuario = await this.buscarPorId(idDeUsuario)
    if (usuario) {
      await eliminarRegistro('usuarios', usuario)
    }
  }

  /** Busca un usuario activo por su id. */
  async buscarPorId(idDeUsuario: string): Promise<Usuario | undefined> {
    const usuario = await db.usuarios.get(idDeUsuario)
    return usuario && !usuario.eliminado ? usuario : undefined
  }

  /** Busca un usuario activo por su nombre de usuario (login). */
  async buscarPorNombre(nombreDeUsuario: string): Promise<Usuario | undefined> {
    const nombreLimpio = (nombreDeUsuario ?? '').trim()
    return db.usuarios
      .where('nombre_usuario')
      .equalsIgnoreCase(nombreLimpio)
      .filter((u) => !u.eliminado)
      .first()
  }

  /** Devuelve los usuarios activos ordenados por nombre. */
  async obtenerTodos(): Promise<Usuario[]> {
    const lista = await db.usuarios.toArray()
    return lista
      .filter((u) => !u.eliminado)
      .sort((a, b) => a.nombre_usuario.localeCompare(b.nombre_usuario))
  }

  /** Cuenta los usuarios con poder administrativo (ADMIN o SUPERADMIN) activos:
   *  siembra inicial, protección del último y disponibilidad de permisos. */
  async contarAdministradores(): Promise<number> {
    const lista = await db.usuarios.toArray()
    return lista.filter(
      (u) => !u.eliminado && (u.tipo_usuario === TIPO_ADMIN || u.tipo_usuario === TIPO_SUPERADMIN),
    ).length
  }

  /** Cuenta solo los administradores puros activos (excluye al SUPERADMIN). */
  async contarAdminsPuros(): Promise<number> {
    const lista = await db.usuarios.toArray()
    return lista.filter((u) => !u.eliminado && u.tipo_usuario === TIPO_ADMIN).length
  }

  /** `true` si el nombre corresponde a la cuenta fija del dueño (SUPERADMIN). */
  esCuentaSuperadmin(nombreDeUsuario: string): boolean {
    return (nombreDeUsuario ?? '').trim().toLowerCase() === NOMBRE_SUPERADMIN.toLowerCase()
  }

  /** Indica si algún usuario (activo o no) ocupa ese nombre. */
  async existeNombre(nombreDeUsuario: string): Promise<boolean> {
    const nombreLimpio = (nombreDeUsuario ?? '').trim()
    const fila = await db.usuarios.where('nombre_usuario').equalsIgnoreCase(nombreLimpio).first()
    return !!fila
  }
}