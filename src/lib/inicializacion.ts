import { refrescarPendientes } from '../sync/syncEngine'
import { obtenerDispositivoId } from '../sync/dispositivo'

/**
 * Inicializa la base local al primer arranque: deja listo el identificador
 * de dispositivo. No se crean cuentas automáticamente; el primer usuario
 * registrado asume el rol de administrador.
 */
export async function inicializarApp(): Promise<void> {
  await obtenerDispositivoId()
  await refrescarPendientes()
}