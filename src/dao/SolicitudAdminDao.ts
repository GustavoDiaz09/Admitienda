import { db } from '../lib/db'
import { nuevoRegistro, actualizarRegistro } from '../lib/mutaciones'
import { ESTADO_PENDIENTE, type EstadoSolicitud, type SolicitudAdmin } from '../model/types'
import { formatFecha } from '../lib/fecha'

/**
 * Acceso a datos de solicitudes de permiso de administrador (port de
 * `tienda.dao.SolicitudAdminDao`).
 */
export class SolicitudAdminDao {
  /** Inserta una solicitud nueva en estado PENDIENTE. */
  async insertar(usuarioId: string): Promise<SolicitudAdmin> {
    return nuevoRegistro('solicitudes_admin', {
      usuario_id: usuarioId,
      estado: ESTADO_PENDIENTE,
      fecha_solicitud: formatFecha(new Date()),
    })
  }

  /** Cambia el estado de una solicitud y encola el cambio. */
  async actualizarEstado(idDeSolicitud: string, nuevoEstado: EstadoSolicitud): Promise<void> {
    const solicitud = await db.solicitudes_admin.get(idDeSolicitud)
    if (solicitud) {
      await actualizarRegistro('solicitudes_admin', { ...solicitud, estado: nuevoEstado })
    }
  }

  /** Devuelve todas las solicitudes con el nombre del usuario solicitante. */
  async obtenerTodas(): Promise<SolicitudAdmin[]> {
    const solicitudes = await db.solicitudes_admin.toArray()
    const usuarios = await db.usuarios.toArray()
    const nombrePorId = new Map(usuarios.map((u) => [u.id, u.nombre_usuario]))
    return solicitudes
      .filter((s) => !s.eliminado)
      .map((s) => ({ ...s, nombre_usuario: nombrePorId.get(s.usuario_id) ?? 'Usuario eliminado' }))
      .sort((a, b) => b.fecha_solicitud.localeCompare(a.fecha_solicitud))
  }

  /** Indica si un usuario tiene una solicitud pendiente. */
  async tieneSolicitudPendiente(idDeUsuario: string): Promise<boolean> {
    const lista = await db.solicitudes_admin
      .where('usuario_id')
      .equals(idDeUsuario)
      .toArray()
    return lista.some((s) => !s.eliminado && s.estado === ESTADO_PENDIENTE)
  }

  /** Devuelve una solicitud por su id. */
  async buscarPorId(idDeSolicitud: string): Promise<SolicitudAdmin | undefined> {
    return db.solicitudes_admin.get(idDeSolicitud)
  }
}