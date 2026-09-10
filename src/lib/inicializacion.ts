import { sembrarAdminSiNoExiste, sembrarDatosEjemplo } from '../seed/DatosEjemplo'
import { refrescarPendientes } from '../sync/syncEngine'
import { obtenerDispositivoId } from '../sync/dispositivo'

/**
 * Inicializa la base local al primer arranque: deja listo el identificador
 * de dispositivo, siembra al administrador inicial y los datos de ejemplo
 * (solo locales, no se suben a la nube).
 */
export async function inicializarApp(): Promise<void> {
  await obtenerDispositivoId()
  await sembrarAdminSiNoExiste()
  await sembrarDatosEjemplo()
  await refrescarPendientes()
}