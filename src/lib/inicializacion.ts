import { refrescarPendientes } from '../sync/syncEngine'
import { obtenerDispositivoId } from '../sync/dispositivo'
import { revisarCuotaDeAlmacenamiento, solicitarPersistencia } from './almacenamiento'

/**
 * Inicializa la base local al primer arranque: deja listo el identificador
 * de dispositivo, pide persistencia para el almacenamiento local y reanuda
 * la sincronización. No se crean cuentas ni datos por defecto: el primer
 * usuario registrado asume el rol de administrador.
 */
export async function inicializarApp(): Promise<void> {
  await obtenerDispositivoId()
  await solicitarPersistencia()
  await revisarCuotaDeAlmacenamiento()
  await refrescarPendientes()
}