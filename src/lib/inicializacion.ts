import { sembrarAdminSiNoExiste } from '../seed/DatosEjemplo'
import { refrescarPendientes } from '../sync/syncEngine'
import { obtenerDispositivoId } from '../sync/dispositivo'

/**
 * Inicializa la base local al primer arranque: deja listo el identificador
 * de dispositivo y siembra al administrador inicial si la base está vacía.
 */
export async function inicializarApp(): Promise<void> {
  await obtenerDispositivoId()
  await sembrarAdminSiNoExiste()
  await refrescarPendientes()
}