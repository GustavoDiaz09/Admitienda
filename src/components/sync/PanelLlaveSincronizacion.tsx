import { useState } from 'react'
import { Copy, Key } from '@phosphor-icons/react'
import { avisarError, avisarExito } from '../../lib/toast'
import { obtenerLlave, hayLlaveConfigurada, enlaceDeLlave } from '../../lib/llave'
import { crearLlaveRemoto, ErrorRemoto } from '../../lib/remoto'
import { configurarLlaveYSincronizar } from '../../lib/syncAcciones'
import { useSesionStore } from '../../controller/SessionController'
import { esSuperadmin, NOMBRE_SUPERADMIN } from '../../model/types'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

/**
 * Configuración de la llave de sincronización de un dispositivo: campo para
 * pegar la llave (Guardar dispara la subida y la bajada) y el flujo de alta
 * de llaves (Generar / Agregar dispositivo) con su modal de QR y enlace.
 * Se usa en el panel de sincronización (sesión iniciada). Generar una llave
 * solo lo puede hacer el SUPERADMIN (el dueño); cualquier otro usuario solo
 * puede pegar la llave que el administrador le comparta.
 */
export function PanelLlaveSincronizacion() {
  const [llaveTexto, setLlaveTexto] = useState(obtenerLlave())
  const [pasoOnboarding, setPasoOnboarding] = useState<'cerrado' | 'confirmar' | 'generando' | 'resultado'>('cerrado')
  const [llaveNueva, setLlaveNueva] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [errorGenerar, setErrorGenerar] = useState('')
  const esElSuperadmin = useSesionStore((estado) => esSuperadmin(estado.usuarioActivo?.tipo_usuario))

  const hayLlave = hayLlaveConfigurada()

  const guardar = async () => {
    await configurarLlaveYSincronizar(llaveTexto)
    setLlaveTexto(llaveTexto.trim())
  }

  const generarLlave = async () => {
    setErrorGenerar('')
    setPasoOnboarding('generando')
    try {
      const resultado = await crearLlaveRemoto()
      setLlaveNueva(resultado.llave)
      setQrDataUrl('')
      if (resultado.inicial && !hayLlaveConfigurada()) {
        await configurarLlaveYSincronizar(resultado.llave)
        setLlaveTexto(resultado.llave)
        avisarExito('Llave inicial creada: este dispositivo quedó configurado.')
      } else {
        avisarExito('Llave creada. Compártala con el otro dispositivo.')
      }
      try {
        const { default: QRCode } = await import('qrcode')
        setQrDataUrl(
          await QRCode.toDataURL(enlaceDeLlave(resultado.llave), { width: 320, margin: 1 }),
        )
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
      } else if (causa instanceof ErrorRemoto && causa.estado === 403) {
        setErrorGenerar(
          'Solo la llave del administrador (SUPERADMIN) puede crear llaves para nuevos dispositivos.',
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
    <>
      {!hayLlave ? (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800">
          Este dispositivo aún no tiene llave de sincronización. Sin ella, los datos no se
          respaldan en la nube: el administrador (SUPERADMIN) genera las llaves y se las
          comparte a los demás dispositivos.
        </div>
      ) : null}

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
            disabled={llaveTexto.trim() === obtenerLlave().trim()}
          >
            Guardar
          </Button>
        </div>
      </div>

      {esElSuperadmin ? (
        <Button
          variante="primario"
          tamanio="sm"
          className="w-full"
          icono={Key}
          onClick={() => setPasoOnboarding('confirmar')}
        >
          {hayLlave ? 'Agregar dispositivo' : 'Generar llave'}
        </Button>
      ) : (
        <div className="rounded-xl bg-sky-50 px-3 py-2 text-xs leading-snug text-sky-800">
          Solo el administrador de la tienda ({NOMBRE_SUPERADMIN} · SUPERADMIN) genera las
          llaves para nuevos dispositivos. Si necesita otra, pídasela y péguela en el campo
          de arriba.
        </div>
      )}

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
                      solo se puede generar una nueva teniendo la llave actual; este dispositivo
                      deberá recibir la llave por el enlace/QR que le comparta el administrador.
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
    </>
  )
}