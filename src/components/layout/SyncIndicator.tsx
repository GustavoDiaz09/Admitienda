import { useState } from 'react'
import {
  CloudArrowDown,
  CloudArrowUp,
  CloudCheck,
  CloudSlash,
  ArrowsClockwise,
  X,
} from '@phosphor-icons/react'
import { useSesionStore } from '../../controller/SessionController'
import { TIPO_ADMIN } from '../../model/types'
import { horaCorta } from '../../lib/formato'
import { avisarExito } from '../../lib/toast'
import { ejecutarAccionDeSync, type TipoAccionSync } from '../../lib/syncAcciones'
import { useSyncStore } from '../../sync/syncEngine'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'

/** Indicador de sincronización: estado de red, pendientes y acciones admin. */
export function SyncIndicator() {
  const esAdmin = useSesionStore((estado) => estado.usuarioActivo?.tipo_usuario) === TIPO_ADMIN
  const { enLinea, pendientes, sincronizando, ultimaSync } = useSyncStore()
  const [abierto, setAbierto] = useState(false)
  const [accionActiva, setAccionActiva] = useState<TipoAccionSync | null>(null)

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
        onClick={() => setAbierto((abierto) => !abierto)}
        aria-expanded={abierto}
        className="focus-ring inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white py-1.5 pl-3 pr-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
      >
        <span className="relative flex size-2">
          <span
            className={cn(
              'size-2 rounded-full',
              enLinea ? 'bg-emerald-500' : 'bg-red-400',
            )}
          />
        </span>
        <span className="hidden sm:inline">
          {enLinea ? 'En línea' : 'Sin conexión'}
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

      {abierto ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} aria-hidden="true" />
          <div className="animate-aparecer absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-zinc-200 bg-white p-4 shadow-pop">
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
                <dd className="font-medium text-zinc-800">
                  {enLinea ? 'En línea' : 'Sin conexión'}
                </dd>
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

            <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4">
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
                  <Button
                    variante="secundario"
                    tamanio="sm"
                    className="w-full"
                    cargando={accionActiva === 'subir'}
                    icono={CloudArrowUp}
                    disabled={!enLinea}
                    onClick={() => void ejecutar('subir')}
                  >
                    Subir todo a la nube
                  </Button>
                  <Button
                    variante="secundario"
                    tamanio="sm"
                    className="w-full"
                    cargando={accionActiva === 'bajar'}
                    icono={CloudArrowDown}
                    disabled={!enLinea}
                    onClick={() => void ejecutar('bajar')}
                  >
                    Descargar todo de la nube
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}