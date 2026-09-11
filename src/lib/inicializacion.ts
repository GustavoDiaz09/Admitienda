/**
 * Inicializa la base local al primer arranque: captura una llave de
 * sincronización recibida por enlace (QR / URL `?llave=...`) cuando el
 * dispositivo aún no tiene una, deja listo el identificador de dispositivo,
 * pide persistencia para el almacenamiento local y reanuda la sincronización.
 * No se crean cuentas ni datos por defecto: el primer usuario registrado
 * asume el rol de administrador.
 */

import { refrescarPendientes } from '../sync/syncEngine'
import { obtenerDispositivoId } from '../sync/dispositivo'
import { extraerLlaveDeUrl, limpiarLlaveDeUrl, guardarLlave, hayLlaveConfigurada } from './llave'
import { revisarCuotaDeAlmacenamiento, solicitarPersistencia } from './almacenamiento'

export async function inicializarApp(): Promise<void> {
  const llaveDeUrl = extraerLlaveDeUrl(window.location.href)
  if (llaveDeUrl && !hayLlaveConfigurada()) {
    guardarLlave(llaveDeUrl)
  }
  limpiarLlaveDeUrl()
  await obtenerDispositivoId()
  await solicitarPersistencia()
  await revisarCuotaDeAlmacenamiento()
  await refrescarPendientes()
}