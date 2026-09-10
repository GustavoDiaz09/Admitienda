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