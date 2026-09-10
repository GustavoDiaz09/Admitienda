import { db } from '../lib/db'
import { formatFecha } from '../lib/fecha'
import { generarSalt, hashContrasena } from '../lib/password'
import { TIPO_ADMIN, type RegistroBase, type Usuario } from '../model/types'

/** Credenciales del administrador inicial (iguales a la app de escritorio). */
export const ADMIN_INICIAL_USUARIO = 'admin'
export const ADMIN_INICIAL_CONTRASENA = 'Gustavo1234'
export const ADMIN_INICIAL_INDICIO = 'Tienda'

/**
 * Valor marcador de "dispositivo" de los registros sembrados localmente.
 * Detecta que el registro es local: no se encola ni se sube, incluso si el
 * administrador usa "Subir todo a la nube".
 */
export const DISPOSITIVO_SEMILLA = 'semilla-local'

/**
 * Campos comunes de sincronización para el administrador sembrado. Este registro
 * se escribe DIRECTAMENTE en IndexedDB con `put` y, a diferencia de los
 * registros reales (que pasan por `nuevoRegistro` y se encolan en el outbox),
 * NUNCA se envía a la nube: es una copia local para poder iniciar sesión.
 */
async function baseLocal(): Promise<RegistroBase> {
  const ahora = Date.now()
  return {
    id: crypto.randomUUID(),
    creadoEn: ahora,
    actualizadoEn: ahora,
    version: 1,
    eliminado: false,
    dispositivo: DISPOSITIVO_SEMILLA,
  }
}

/**
 * Siembra el administrador inicial solo si no existe ningún usuario
 * (port de `DatabaseConnection.sembrarAdministradorInicial`). Queda solo
 * en el dispositivo: no se encola para sincronizar.
 */
export async function sembrarAdminSiNoExiste(): Promise<void> {
  const totalUsuarios = await db.usuarios.count()
  if (totalUsuarios > 0) {
    return
  }
  const salt = generarSalt()
  const usuario: Usuario = {
    ...(await baseLocal()),
    nombre_usuario: ADMIN_INICIAL_USUARIO,
    tipo_usuario: TIPO_ADMIN,
    contrasena_hash: await hashContrasena(ADMIN_INICIAL_CONTRASENA, salt),
    salt,
    indicio_usuario: ADMIN_INICIAL_INDICIO,
    fecha_registro: formatFecha(new Date()),
  }
  await db.usuarios.put(usuario)
}