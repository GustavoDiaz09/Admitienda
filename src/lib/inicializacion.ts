import { sembrarAdminSiNoExiste, sembrarDatosEjemplo } from '../seed/DatosEjemplo'
import { refrescarPendientes } from '../sync/syncEngine'
import { obtenerDispositivoId } from '../sync/dispositivo'

/**
 * Inicializa la base local al primer arranque (equivalente a la llamada a
 * `DatabaseConnection` + `DatosEjemplo` desde `tienda.Main` en Java):
 * siembra al administrador inicial y los datos de ejemplo si la base está
 * vacía, y deja listo el identificador de dispositivo.
 */
export async function inicializarApp(): Promise<void> {
  await obtenerDispositivoId()
  await sembrarAdminSiNoExiste()
  await sembrarDatosEjemplo()
  await refrescarPendientes()
}