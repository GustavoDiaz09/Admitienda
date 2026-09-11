import { useEffect, useState } from 'react'
import {
  CloudArrowDown,
  CloudArrowUp,
  CloudCheck,
  CloudSlash,
  ArrowsClockwise,
  Key,
  Copy,
  X,
} from '@phosphor-icons/react'
import { useSesionStore } from '../../controller/SessionController'
import { esRolAdministrativo } from '../../model/types'
import { horaCorta } from '../../lib/formato'
import { avisarExito, avisarError } from '../../lib/toast'
import { obtenerLlave, guardarLlave, hayLlaveConfigurada, enlaceDeLlave } from '../../lib/llave'
import { crearLlaveRemoto, ErrorRemoto } from '../../lib/remoto'
import { ejecutarAccionDeSync, type TipoAccionSync } from '../../lib/syncAcciones'
import { refrescarPendientes, sincronizarAhora, useSyncStore } from '../../sync/syncEngine'
import {
  formatearBytes,
  revisarCuotaDeAlmacenamiento,
  UMBRAL_CUOTA_ALERTA,
  type InfoAlmacenamiento,
} from '../../lib/almacenamiento'
import { Button } from '../ui/Button'
import { ConfirmButton } from '../ui/ConfirmButton'
import { Modal } from '../ui/Modal'
import { cn } from '../../lib/cn'

/** Indicador de sincronización: estado de red, pendientes y acciones admin. */
export function SyncIndicator() {
  const esAdmin = useSesionStore(
    (estado) => esRolAdministrativo(estado.usuarioActivo?.tipo_usuario),
  )
  const hayCuenta = useSesionStore((estado) => estado.usuarioActivo !== null)
  const { enLinea, pendientes, sincronizando, ultimaSync, error, llaveInvalida } = useSyncStore()
  const [abierto, setAbierto] = useState(false)
  const [accionActiva, setAccionActiva] = useState<TipoAccionSync | null>(null)
  const [llaveTexto, setLlaveTexto] = useState(obtenerLlave())
  const [infoAlmacenamiento, setInfoAlmacenamiento] = useState<InfoAlmacenamiento | null>(null)
  const [pasoOnboarding, setPasoOnboarding] = useState<'cerrado' | 'confirmar' | 'generando' | 'resultado'>('cerrado')
  const [llaveNueva, setLlaveNueva] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [errorGenerar, setErrorGenerar] = useState('')

  const hayLlave = hayLlaveConfigurada()
  const estadoTexto = llaveInvalida
    ? 'Llave no válida'
    : !hayLlave
      ? 'Sin llave'
      : enLinea
        ? 'En línea'
        : 'Sin conexión'
  const estadoColor = llaveInvalida || !hayLlave ? 'bg-amber-500' : enLinea ? 'bg-emerald-500' : 'bg-red-400'

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

  const guardar = async () => {
    guardarLlave(llaveTexto)
    avisarExito('Llave de sincronización guardada.')
    await sincronizarAhora()
    await refrescarPendientes()
  }

  const generarLlave = async () => {
    setErrorGenerar('')
    setPasoOnboarding('generando')
    try {
      const resultado = await crearLlaveRemoto()
      setLlaveNueva(resultado.llave)
      setQrDataUrl('')
      if (resultado.inicial && !hayLlaveConfigurada()) {
        guardarLlave(resultado.llave)
        setLlaveTexto(resultado.llave)
        avisarExito('Llave inicial creada: este dispositivo quedó configurado.')
      } else {
        avisarExito('Llave creada. Compártala con el otro dispositivo.')
      }
      try {
        const { default: QRCode } = await import('qrcode')
        setQrDataUrl(await QRCode.toDataURL(enlaceDeLlave(resultado.llave), { width: 320, margin: 1 }))
      } catch {
        // Sin QR (entorno sin canvas): el enlace se muestra como texto.
      }
      setPasoOnboarding('resultado')
    } catch (causa) {
      if (causa instanceof ErrorRemoto && causa.estado === 401 && !hayLlaveConfigurada()) {
        setErrorGenerar(
          'Hay llaves en la nube y un dispositivo nuevo no puede generar otra por sí solo. ' +
            'Pida al administrador la llave de sincronización (o escanee el enlace/QR que le comparta) ' +
            'y péguela en el campo de la llave.',
        )
      } else {
        setErrorGenerar(causa instanceof Error ? causa.message : 'No se pudo crear la llave.')
      }
      setPasoOnboarding('confirmar')
    }
  }

  const copiarLlave = async () => {
    if (!llaveNueva) return
    try {
      await navigator.clipboard.writeText(llaveNueva)
      avisarExito('Llave copiada al portapapeles.')
    } catch {
      avisarError('No se pudo copiar: seleccione la llave manualmente.')
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

      {abierto ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} aria-hidden="true" />
          <div className="animate-aparecer fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-pop sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[min(32rem,calc(100vh-6rem))] sm:w-80 sm:overflow-y-auto sm:rounded-2xl sm:pb-4">
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

            {!hayLlave ? (
              <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800">
                Este dispositivo aún no tiene llave de sincronización. Sin ella, los datos no se
                respaldan en la nube.
                {esAdmin ? ' Si aún no existen llaves, generela con el botón "Generar llave".' : ''}
              </div>
            ) : null}

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
              {hayCuenta ? (
                <div className="rounded-xl bg-zinc-50 p-3">
                  <label
                    htmlFor="llave-sincronizacion"
                    className="block text-xs font-semibold text-zinc-700"
                  >
                    Llave de sincronización
                  </label>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                    Se configura una vez por dispositivo. Guarde aquí la llave que reciba del
                    administrador.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      id="llave-sincronizacion"
                      type="password"
                      autoComplete="off"
                      value={llaveTexto}
                      onChange={(e) => setLlaveTexto(e.target.value)}
                      placeholder={llaveTexto ? '••••••••' : 'Escriba la llave'}
                      className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
                    />
                    <Button
                      variante="secundario"
                      tamanio="sm"
                      onClick={() => void guardar()}
                      disabled={sincronizando || llaveTexto.trim() === obtenerLlave().trim()}
                    >
                      Guardar
                    </Button>
                  </div>
                </div>
              ) : null}
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
                  <Button
                    variante="primario"
                    tamanio="sm"
                    className="w-full"
                    icono={Key}
                    disabled={!enLinea}
                    onClick={() => setPasoOnboarding('confirmar')}
                  >
                    {hayLlave ? 'Agregar dispositivo' : 'Generar llave'}
                  </Button>
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
          </div>
          </div>
        </>
      ) : null}

      <Modal
        abierto={pasoOnboarding !== 'cerrado'}
        titulo="Llave de sincronización"
        descripcion="Única credencial para respaldar y compartir los datos en la nube."
        onCerrar={() => {
          if (pasoOnboarding !== 'generando') setPasoOnboarding('cerrado')
        }}
      >
        {pasoOnboarding === 'generando' ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="size-6 animate-spin rounded-full border-2 border-zinc-300 border-r-emerald-500" />
            <p className="text-sm text-zinc-500">Creando la llave en la nube…</p>
          </div>
        ) : null}
        {pasoOnboarding === 'confirmar' ? (
          <>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600">
                <Key size={20} weight="fill" />
              </span>
              <div className="pt-0.5">
                <p className="text-sm leading-relaxed text-zinc-600">
                  {hayLlave ? (
                    <>
                      Se generará una llave <strong>nueva</strong> para habilitar otro
                      dispositivo. La llave en claro solo se muestra ahora: la nube solo
                      guarda su resumen cifrado.
                    </>
                  ) : (
                    <>
                      Si la nube aún no tiene llaves, esta será la <strong>primera llave de la
                      tienda</strong> y dejará configurado este dispositivo. Si ya existen llaves,
                      solo el administrador puede generar una nueva y debe compartírtela por el
                      enlace/QR (no es posible crear una sin tener la llave actual).
                    </>
                  )}
                </p>
                {errorGenerar ? (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-snug text-red-700">
                    {errorGenerar}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variante="fantasma" onClick={() => setPasoOnboarding('cerrado')}>
                Cancelar
              </Button>
              <Button variante="primario" icono={Key} onClick={() => void generarLlave()}>
                Generar llave
              </Button>
            </div>
          </>
        ) : null}
        {pasoOnboarding === 'resultado' ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                <Key size={20} weight="fill" />
              </span>
              <div className="pt-0.5">
                <p className="text-sm leading-relaxed text-zinc-600">
                  {hayLlaveConfigurada() ? (
                    <>
                      Esta es la llave del dispositivo nuevo. <strong>Guárdela en un lugar
                      seguro</strong>: solo se muestra esta vez y no se puede recuperar.
                    </>
                  ) : (
                    <>
                      Este dispositivo ya quedó configurado. <strong>Guárdela en un lugar
                      seguro</strong>: solo se muestra esta vez y no se puede recuperar.
                    </>
                  )}
                </p>
              </div>
            </div>
            <div>
              <label htmlFor="llave-generada" className="block text-xs font-semibold text-zinc-700">
                Llave
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="llave-generada"
                  readOnly
                  value={llaveNueva}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 font-mono text-[13px] text-zinc-800 focus:border-emerald-500 focus:outline-none"
                />
                <Button variante="secundario" tamanio="sm" icono={Copy} onClick={() => void copiarLlave()}>
                  Copiar
                </Button>
              </div>
            </div>
            {qrDataUrl ? (
              <div className="flex justify-center rounded-2xl border border-zinc-100 bg-white p-3">
                <img
                  src={qrDataUrl}
                  alt="Código QR con el enlace para configurar el otro dispositivo"
                  className="size-56"
                />
              </div>
            ) : null}
            <p className="break-all rounded-lg bg-zinc-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-500">
              O comparta el enlace con el otro dispositivo: {enlaceDeLlave(llaveNueva)}
            </p>
            <div className="flex justify-end gap-2">
              <Button variante="primario" onClick={() => setPasoOnboarding('cerrado')}>
                Listo
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}