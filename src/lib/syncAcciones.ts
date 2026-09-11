import { respaldarTodoEnServidor, traerDatosDelServidor } from '../sync/pull'
import {
  refrescarPendientes,
  sincronizarAhora,
  sincronizarBajando,
  useSyncStore,
} from '../sync/syncEngine'
import { obtenerLlave, guardarLlave } from './llave'
import { avisarError, avisarExito, avisarInfo } from './toast'

/** Acciones de sincronización disponibles para un administrador. */
export type TipoAccionSync = 'sincronizar' | 'subir' | 'bajar'

const EVENTO_DATOS = 'datos:sincronizados'

/**
 * Guarda la llave de sincronización escrita por el usuario y arranca la
 * sincronización completa de este dispositivo: sube los pendientes y dispara
 * la bajada (la primera vez es completa porque el cursor empieza en cero), de
 * modo que en un dispositivo nuevo los usuarios de la nube (p. ej. la cuenta
 * SUPERADMIN del dueño) quedan disponibles antes de iniciar sesión. Útil tanto
 * en el panel dentro de la app como en la pantalla de Login sin sesión.
 */
export async function configurarLlaveYSincronizar(llave: string): Promise<void> {
  guardarLlave(llave)
  avisarExito('Llave de sincronización guardada.')
  await sincronizarAhora()
  await sincronizarBajando()
  await refrescarPendientes()
}

/**
 * Ejecuta una acción de sincronización y notifica el resultado por toast.
 * Cuando la base local cambia (subir/descargar todo), emite el evento
 * `datos:sincronizados` para que las vistas activas se recarguen.
 */
export async function ejecutarAccionDeSync(accion: TipoAccionSync): Promise<void> {
  try {
    if (accion === 'sincronizar') {
      if (navigator.onLine === false) {
        avisarError('No hay conexión para sincronizar. Reintente cuando esté en línea.')
        return
      }
      if (!obtenerLlave()) {
        avisarError('Este dispositivo aún no tiene llave de sincronización configurada.')
        return
      }
      const { subidos, fallados } = await sincronizarAhora()
      const estadoSync = useSyncStore.getState()
      if (estadoSync.llaveInvalida) {
        avisarError(
          'La llave de sincronización no es válida. Verifíquela en el panel de sincronización.',
        )
        return
      }
      if (!estadoSync.enLinea && subidos === 0) {
        avisarError('No hay conexión con la nube en este momento.')
        return
      }
      if (subidos > 0) {
        avisarExito(`${subidos} cambio(s) sincronizados con la nube.`)
      } else {
        avisarInfo('No hay cambios pendientes por sincronizar.')
      }
      if (fallados > 0) {
        avisarError(`${fallados} cambio(s) no se pudieron sincronizar.`)
      }
      return
    }
    if (accion === 'subir') {
      const { subidos } = await respaldarTodoEnServidor()
      avisarExito(`${subidos} registro(s) subidos a la nube.`)
      window.dispatchEvent(new Event(EVENTO_DATOS))
      return
    }
    // Descarga manual del administrador: baja la base completa de la nube
    // (a diferencia de la bajada automática, que es incremental).
    const resultado = await traerDatosDelServidor({ completo: true })
    await refrescarPendientes()
    let mensaje = `Dispositivo sincronizado con la nube: ${resultado.recibidos} registro(s) revisados, ${resultado.actualizados} actualizados.`
    if (resultado.conflictos > 0) {
      mensaje += ` ${resultado.conflictos} conflicto(s) local(es) no aplicado(s).`
    }
    avisarExito(mensaje)
    window.dispatchEvent(new Event(EVENTO_DATOS))
  } catch (error) {
    avisarError(error instanceof Error ? error.message : 'Error de sincronización.')
  }
}