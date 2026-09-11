import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CloudArrowDown,
  CloudArrowUp,
  CloudCheck,
  CloudSlash,
  ArrowsClockwise,
  X,
} from '@phosphor-icons/react'
import { useSesionStore } from '../../controller/SessionController'
import { esRolAdministrativo } from '../../model/types'
import { horaCorta } from '../../lib/formato'
import { avisarExito } from '../../lib/toast'
import { hayLlaveConfigurada } from '../../lib/llave'
import { ejecutarAccionDeSync, type TipoAccionSync } from '../../lib/syncAcciones'
import { useSyncStore } from '../../sync/syncEngine'
import {
  formatearBytes,
  revisarCuotaDeAlmacenamiento,
  UMBRAL_CUOTA_ALERTA,
  type InfoAlmacenamiento,
} from '../../lib/almacenamiento'
import { Button } from '../ui/Button'
import { ConfirmButton } from '../ui/ConfirmButton'
import { cn } from '../../lib/cn'
import { PanelLlaveSincronizacion } from '../sync/PanelLlaveSincronizacion'

/** Indicador de sincronización: estado de red, pendientes y acciones admin. */
export function SyncIndicator() {
  const esAdmin = useSesionStore(
    (estado) => esRolAdministrativo(estado.usuarioActivo?.tipo_usuario),
  )
  const { enLinea, pendientes, sincronizando, ultimaSync, error, llaveInvalida } = useSyncStore()
  const [abierto, setAbierto] = useState(false)
  const botonRef = useRef<HTMLButtonElement>(null)
  const [ancla, setAncla] = useState<{ abajo: number; derecha: number; esMovil: boolean } | null>(null)
  const [accionActiva, setAccionActiva] = useState<TipoAccionSync | null>(null)
  const [infoAlmacenamiento, setInfoAlmacenamiento] = useState<InfoAlmacenamiento | null>(null)

  const hayLlave = hayLlaveConfigurada()
  const estadoTexto = llaveInvalida
    ? 'Llave no válida'
    : !hayLlave
      ? 'Sin llave'
      : enLinea
        ? 'En línea'
        : 'Sin conexión'
  const estadoColor = llaveInvalida || !hayLlave ? 'bg-amber-500' : enLinea ? 'bg-emerald-500' : 'bg-red-400'

  const alternarPanel = () => {
    if (abierto) {
      setAbierto(false)
      return
    }
    const rect = botonRef.current?.getBoundingClientRect()
    const esPantallaMovil = window.matchMedia('(max-width: 639px)').matches
    setAncla(rect ? { abajo: rect.bottom, derecha: window.innerWidth - rect.right, esMovil: esPantallaMovil } : null)
    setAbierto(true)
  }

  useEffect(() => {
    let activo = true
    void revisarCuotaDeAlmacenamiento()
      .then((info) => {
        if (activo) {
          setInfoAlmacenamiento(info)
        }
      })
    return () => {
      activo = false
    }
  }, [])

  const ejecutar = async (accion: TipoAccionSync) => {
    setAccionActiva(accion)
    setAbierto(false)
    await ejecutarAccionDeSync(accion)
    setAccionActiva(null)
    if (accion === 'sincronizar' && !sincronizando) {
      avisarExito('Estado de sincronización actualizado.')
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        ref={botonRef}
        onClick={alternarPanel}
        aria-expanded={abierto}
        className="focus-ring inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white py-1.5 pl-3 pr-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
      >
        <span className="relative flex size-2">
          <span
            className={cn(
              'size-2 rounded-full',
              estadoColor,
            )}
          />
        </span>
        <span className="hidden sm:inline">
          {estadoTexto}
        </span>
        {pendientes > 0 ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            {pendientes}
          </span>
        ) : null}
        {sincronizando ? (
          <span className="size-4 animate-spin rounded-full border-[2px] border-zinc-300 border-r-emerald-500" />
        ) : (
          <span className="grid size-5 place-items-center rounded-full bg-zinc-100 text-zinc-500">
            {enLinea ? <CloudCheck size={13} weight="bold" /> : <CloudSlash size={13} weight="bold" />}
          </span>
        )}
      </button>

      {abierto
        ? createPortal(
            <div className="fixed inset-0 z-50">
              <div
                className="fixed inset-0 z-40"
                onClick={() => setAbierto(false)}
                aria-hidden="true"
              />
              <div
                className={cn(
                  'animate-aparecer border border-zinc-200 bg-white p-4 shadow-pop',
                  ancla?.esMovil
                    ? 'fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]'
                    : 'fixed z-50 max-h-[min(32rem,calc(100vh-6rem))] w-80 overflow-y-auto rounded-2xl',
                )}
                style={
                  ancla && !ancla.esMovil
                    ? { top: ancla.abajo + 8, right: ancla.derecha }
                    : undefined
                }
              >
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar panel de sincronización"
              className="absolute right-3 top-3 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <X size={14} weight="bold" />
            </button>
            <h3 className="text-sm font-semibold text-zinc-900">Sincronización</h3>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <dt className="text-zinc-500">Conexión</dt>
                <dd className="font-medium text-zinc-800">{estadoTexto}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-zinc-500">Cambios pendientes</dt>
                <dd className="font-medium text-zinc-800">{pendientes}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-zinc-500">Última sincronización</dt>
                <dd className="font-medium text-zinc-800">
                  {ultimaSync ? horaCorta(ultimaSync) : 'Aún no'}
                </dd>
              </div>
            </dl>

            {error ? (
              <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs leading-snug text-red-700">
                <span className="font-semibold">Error de sincronización: </span>
                {error}
              </div>
            ) : null}

            {infoAlmacenamiento ? (
              <div className="mt-3 rounded-xl bg-zinc-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700">
                    Almacenamiento local
                  </span>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      infoAlmacenamiento.porcentaje >= UMBRAL_CUOTA_ALERTA
                        ? 'text-red-600'
                        : 'text-zinc-600',
                    )}
                  >
                    {infoAlmacenamiento.porcentaje}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      infoAlmacenamiento.porcentaje >= UMBRAL_CUOTA_ALERTA
                        ? 'bg-red-500'
                        : 'bg-emerald-500',
                    )}
                    style={{ width: `${Math.min(infoAlmacenamiento.porcentaje, 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
                  {infoAlmacenamiento.porcentaje >= UMBRAL_CUOTA_ALERTA
                    ? 'Cuota casi llena: haga un respaldo en la nube y libere espacio, o el navegador podría borrar los datos de la tienda.'
                    : `${formatearBytes(infoAlmacenamiento.usoBytes)} de ${formatearBytes(infoAlmacenamiento.cuotaBytes)}${infoAlmacenamiento.persistente ? ' · almacenamiento persistente' : ''}.`}
                </p>
              </div>
            ) : null}

            <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4">
              <div className="space-y-2">
                <Button
                variante="primario"
                tamanio="sm"
                className="w-full"
                cargando={accionActiva === 'sincronizar'}
                icono={ArrowsClockwise}
                disabled={!enLinea}
                onClick={() => void ejecutar('sincronizar')}
              >
                Sincronizar cambios
              </Button>
              {esAdmin ? (
                <>
                  <ConfirmButton
                    variante="secundario"
                    tamanio="sm"
                    className="w-full"
                    icono={CloudArrowUp}
                    disabled={!enLinea}
                    accion="Subir todo a la nube"
                    titulo="Subir todo a la nube"
                    mensaje={
                      <>
                        Se <strong>sobrescribirá la copia en la nube</strong> con
                        todos los datos de este dispositivo. Si otro terminal tiene
                        cambios más recientes que este, quedarán temporalmente como
                        respaldo local. ¿Continuar?
                      </>
                    }
                    confirmar={() => void ejecutar('subir')}
                  />
                  <ConfirmButton
                    variante="secundario"
                    tamanio="sm"
                    className="w-full"
                    icono={CloudArrowDown}
                    disabled={!enLinea}
                    accion="Descargar todo de la nube"
                    titulo="Descargar todo de la nube"
                    mensaje={
                      <>
                        Se <strong>bajarán todos los datos de la nube y se
                        fusionarán</strong> con los de este dispositivo: en
                        cada registro gana la versión más reciente, sin
                        eliminar los cambios locales pendientes.
                        {' '}¿Continuar?
                      </>
                    }
                    confirmar={() => void ejecutar('bajar')}
                  />
</>
              ) : null}
              </div>
              <div className="space-y-3 border-t border-zinc-100 pt-4">
                <PanelLlaveSincronizacion />
              </div>
            </div>
          </div>
          </div>,
          document.body,
        )
      : null}
    </div>
  )
}