import { respaldarTodoEnServidor, traerDatosDelServidor } from '../sync/pull'
import { refrescarPendientes, sincronizarAhora } from '../sync/syncEngine'
import { avisarError, avisarExito, avisarInfo } from './toast'

/** Acciones de sincronización disponibles para un administrador. */
export type TipoAccionSync = 'sincronizar' | 'subir' | 'bajar'

const EVENTO_DATOS = 'datos:sincronizados'

/**
 * Ejecuta una acción de sincronización y notifica el resultado por toast.
 * Cuando la base local cambia (subir/descargar todo), emite el evento
 * `datos:sincronizados` para que las vistas activas se recarguen.
 */
export async function ejecutarAccionDeSync(accion: TipoAccionSync): Promise<void> {
  try {
    if (accion === 'sincronizar') {
      const { subidos, fallados } = await sincronizarAhora()
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
    const resultado = await traerDatosDelServidor()
    await refrescarPendientes()
    avisarExito(
      `Descarga completa: ${resultado.recibidos} registro(s) recibidos, ${resultado.actualizados} actualizados.`,
    )
    window.dispatchEvent(new Event(EVENTO_DATOS))
  } catch (error) {
    avisarError(error instanceof Error ? error.message : 'Error de sincronización.')
  }
}