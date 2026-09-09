import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Coins,
  Eye,
  HandCoins,
  MagnifyingGlass,
  Plus,
  Receipt,
  Trash,
} from '@phosphor-icons/react'
import { DeudaController } from '../controller/DeudaController'
import { useSesionStore } from '../controller/SessionController'
import type { Deuda, PagoDeuda } from '../model/types'
import { TIPO_ADMIN } from '../model/types'
import { moneda } from '../lib/formato'
import { avisarError, avisarExito } from '../lib/toast'
import { Button } from '../components/ui/Button'
import { Campo, Entrada, AlertaDeError } from '../components/ui/Campo'
import { Insignia } from '../components/ui/Insignia'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Tabla, Celda, CeldaNumerica } from '../components/ui/Tabla'
import { ConfirmButton } from '../components/ui/ConfirmButton'
import { EncabezadoSeccion, Esqueleto, EstadoVacio } from '../components/ui/Base'
import { cn } from '../lib/cn'

type FiltroDeuda = 'TODAS' | 'PENDIENTES' | 'SALDADAS'

const FILTROS: Record<FiltroDeuda, string> = {
  TODAS: 'Todas',
  PENDIENTES: 'Pendientes',
  SALDADAS: 'Saldadas',
}

/** Una deuda está saldada cuando su saldo llega a 0. */
function estaSaldada(deuda: Deuda): boolean {
  return deuda.saldo <= 0
}

/** Normaliza la fecha YYYY-MM-DD HH:MM a DD/MM/YYYY HH:MM para mostrar. */
function formatearFecha(texto: string): string {
  const [fecha, hora] = texto.split(' ')
  if (!fecha) return texto
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}${hora ? ` ${hora}` : ''}`
}

/** Vista del CRM de deudas: ventas fiadas, abonos e historial por cliente. Registrados solo leen. */
export function Deudas() {
  const esAdmin = useSesionStore((estado) => estado.usuarioActivo?.tipo_usuario) === TIPO_ADMIN
  const [deudas, setDeudas] = useState<Deuda[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroDeuda>('TODAS')
  const [modalNueva, setModalNueva] = useState(false)
  const [clientePrefill, setClientePrefill] = useState('')
  const [abono, setAbono] = useState<Deuda | null>(null)
  const [historial, setHistorial] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const lista = await new DeudaController().obtenerDeudas()
    setDeudas(lista)
  }, [])

  useEffect(() => {
    void cargar()
    const alRecargar = () => void cargar()
    window.addEventListener('datos:sincronizados', alRecargar)
    return () => window.removeEventListener('datos:sincronizados', alRecargar)
  }, [cargar])

  const filtradas = useMemo(() => {
    if (!deudas) return []
    const texto = busqueda.trim().toLowerCase()
    return deudas.filter((d) => {
      if (filtro === 'PENDIENTES' && estaSaldada(d)) return false
      if (filtro === 'SALDADAS' && !estaSaldada(d)) return false
      if (!texto) return true
      return (
        d.cliente_nombre.toLowerCase().includes(texto) ||
        d.descripcion.toLowerCase().includes(texto)
      )
    })
  }, [deudas, busqueda, filtro])

  const totales = useMemo(() => {
    const activas = deudas ?? []
    const monto = activas.reduce((a, d) => a + d.monto, 0)
    const saldo = activas.reduce((a, d) => a + d.saldo, 0)
    return { monto, abonado: monto - saldo, saldo, pendientes: activas.filter((d) => !estaSaldada(d)).length }
  }, [deudas])

  return (
    <div className="animate-desvanecer space-y-5">
      <EncabezadoSeccion
        titulo="Deudas y pagos"
        descripcion="CRM de ventas fiadas: registre deudas, reciba abonos y consulte el historial por cliente."
        acciones={
          esAdmin ? (
            <Button
              icono={Plus}
              onClick={() => {
                setClientePrefill('')
                setModalNueva(true)
              }}
            >
              Nueva deuda
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-4 py-3">
          <div className="relative w-full max-w-xs">
            <MagnifyingGlass className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-zinc-400" weight="regular" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por cliente o descripción…"
              aria-label="Buscar deudas"
              className="campo-base pl-9"
            />
          </div>
          <div className="inline-flex rounded-full border border-zinc-300 bg-white p-0.5 text-sm">
            {Object.entries(FILTROS).map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setFiltro(valor as FiltroDeuda)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  filtro === valor
                    ? 'bg-emerald-600 text-white'
                    : 'text-zinc-600 hover:bg-zinc-100',
                )}
              >
                {etiqueta}
              </button>
            ))}
          </div>
          {deudas ? (
            <span className="ml-auto hidden text-xs font-medium text-zinc-500 sm:inline">
              {deudas.length} deudas · {totales.pendientes} pendientes
            </span>
          ) : null}
        </div>

        {deudas === null ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Esqueleto key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : filtradas.length === 0 ? (
          <EstadoVacio
            icono={<Receipt size={24} weight="duotone" />}
            titulo={deudas.length === 0 ? 'Sin deudas registradas' : 'Sin resultados'}
            descripcion={
              deudas.length === 0
                ? 'Registre su primera venta fiada con el botón "Nueva deuda".'
                : 'No hay deudas que coincidan con la búsqueda.'
            }
            accion={
              esAdmin ? (
                <Button
                  icono={Plus}
                  onClick={() => {
                    setClientePrefill('')
                    setModalNueva(true)
                  }}
                >
                  Nueva deuda
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Tabla
            encabezados={['Cliente', 'Fecha', 'Descripción', 'Monto', 'Abonado', 'Saldo', 'Estado', '']}
            minimo="min-w-[900px]"
          >
            {filtradas.map((d) => {
              const saldada = estaSaldada(d)
              return (
                <tr key={d.id} className={saldada ? 'opacity-70 hover:bg-zinc-50/80' : 'hover:bg-zinc-50/80'}>
                  <Celda>
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-100 font-semibold text-emerald-700">
                        {d.cliente_nombre.charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium text-zinc-900">{d.cliente_nombre}</span>
                    </div>
                  </Celda>
                  <Celda className="text-zinc-500">{formatearFecha(d.fecha)}</Celda>
                  <Celda className="max-w-md truncate text-zinc-600">{d.descripcion}</Celda>
                  <CeldaNumerica>{moneda(d.monto)}</CeldaNumerica>
                  <CeldaNumerica className="text-emerald-700">{moneda(d.monto - d.saldo)}</CeldaNumerica>
                  <CeldaNumerica className={cn('font-semibold', saldada ? 'text-zinc-400' : 'text-red-600')}>
                    {moneda(d.saldo)}
                  </CeldaNumerica>
                  <Celda>
                    <Insignia tono={saldada ? 'esmeralda' : 'ambar'}>
                      {saldada ? 'Saldada' : 'Pendiente'}
                    </Insignia>
                  </Celda>
                  <Celda className="text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => setHistorial(d.cliente_nombre)}
                        aria-label={`Ver historial de ${d.cliente_nombre}`}
                        className="focus-ring rounded-full p-2 text-zinc-400 transition-colors hover:bg-sky-50 hover:text-sky-600"
                      >
                        <Eye size={16} weight="bold" />
                      </button>
                      {esAdmin && !saldada ? (
                        <button
                          type="button"
                          onClick={() => setAbono(d)}
                          aria-label="Registrar abono"
                          className="focus-ring rounded-full p-2 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                        >
                          <Coins size={16} weight="bold" />
                        </button>
                      ) : null}
                      {esAdmin ? (
                        <ConfirmButton
                          accion={<Trash size={14} weight="bold" />}
                          titulo="Eliminar deuda"
                          mensaje={
                            <>
                              ¿Desea eliminar la deuda de <b>{d.cliente_nombre}</b> y sus pagos?
                              Los ingresos ya registrados en caja no se modifican.
                            </>
                          }
                          confirmar={async () => {
                            const resultado = await new DeudaController().eliminarDeuda(d.id)
                            if (resultado.exito) {
                              avisarExito(resultado.mensaje)
                              await cargar()
                            } else {
                              avisarError(resultado.mensaje)
                            }
                          }}
                        />
                      ) : null}
                    </div>
                  </Celda>
                </tr>
              )
            })}
          </Tabla>
        )}

        {deudas && deudas.length > 0 ? (
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-100 px-4 py-3 text-sm">
            <span className="flex items-center gap-1.5 font-medium text-zinc-500">
              <HandCoins size={15} weight="bold" className="text-zinc-400" />
              Facturado
              <b className="text-zinc-800 tabular-nums">{moneda(totales.monto)}</b>
            </span>
            <span className="flex items-center gap-1.5 font-medium text-zinc-500">
              <Coins size={15} weight="bold" className="text-emerald-500" />
              Cobrado
              <b className="text-emerald-700 tabular-nums">{moneda(totales.abonado)}</b>
            </span>
            <span className="flex items-center gap-1.5 font-medium text-zinc-500">
              Pendiente
              <b className="text-red-600 tabular-nums">{moneda(totales.saldo)}</b>
            </span>
          </div>
        ) : null}
      </Card>

      <FormularioDeuda
        abierto={modalNueva}
        clienteInicial={clientePrefill}
        onCerrar={() => setModalNueva(false)}
        onGuardado={async () => {
          setModalNueva(false)
          await cargar()
        }}
      />

      <FormularioAbono
        deuda={abono}
        abierto={abono !== null}
        onCerrar={() => setAbono(null)}
        onGuardado={async () => {
          setAbono(null)
          await cargar()
        }}
      />

      <HistorialCliente
        cliente={historial}
        deudas={deudas?.filter((d) => d.cliente_nombre === historial) ?? []}
        abierto={historial !== null}
        esAdmin={esAdmin}
        onCerrar={() => setHistorial(null)}
        onNuevaDeuda={(cliente) => {
          setClientePrefill(cliente)
          setModalNueva(true)
        }}
      />
    </div>
  )
}

/** Formulario para registrar una deuda nueva (opcionalmente con cliente fijo). */
function FormularioDeuda({
  abierto,
  clienteInicial,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean
  clienteInicial: string
  onCerrar: () => void
  onGuardado: () => Promise<void>
}) {
  const [cliente, setCliente] = useState(clienteInicial)
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (abierto) {
      setCliente(clienteInicial)
      setMonto('')
      setDescripcion('')
      setError(null)
    }
  }, [abierto, clienteInicial])

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    setError(null)
    setCargando(true)
    try {
      const resultado = await new DeudaController().registrarDeuda(cliente, monto, descripcion)
      setCargando(false)
      if (!resultado.exito) {
        setError(resultado.mensaje)
        return
      }
      avisarExito(resultado.mensaje)
      onCerrar()
      await onGuardado()
    } catch {
      setCargando(false)
      setError('No se pudo registrar la deuda.')
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Registrar deuda"
      descripcion="Venta fiada a un cliente; el abono reduce el saldo."
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Cliente" htmlFor="deuda-cliente">
          <Entrada
            id="deuda-cliente"
            placeholder="p. ej. Juan Pérez"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            required
            autoFocus
          />
        </Campo>
        <Campo etiqueta="Monto de la deuda" htmlFor="deuda-monto">
          <Entrada
            id="deuda-monto"
            inputMode="decimal"
            placeholder="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
          />
        </Campo>
        <Campo etiqueta="Descripción" htmlFor="deuda-desc">
          <Entrada
            id="deuda-desc"
            placeholder="p. ej. Fiado de esta semana"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            required
          />
        </Campo>
        {error ? <AlertaDeError mensaje={error} /> : null}
        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
          <Button variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" cargando={cargando}>
            Registrar deuda
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Formulario para aplicar un abono a una deuda pendiente. */
function FormularioAbono({
  deuda,
  abierto,
  onCerrar,
  onGuardado,
}: {
  deuda: Deuda | null
  abierto: boolean
  onCerrar: () => void
  onGuardado: () => Promise<void>
}) {
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (abierto) {
      setMonto('')
      setDescripcion('')
      setError(null)
    }
  }, [abierto, deuda?.id])

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    if (!deuda) return
    setError(null)
    setCargando(true)
    try {
      const resultado = await new DeudaController().registrarAbono(
        deuda.id,
        monto,
        descripcion,
      )
      setCargando(false)
      if (!resultado.exito) {
        setError(resultado.mensaje)
        return
      }
      avisarExito(resultado.mensaje)
      onCerrar()
      await onGuardado()
    } catch {
      setCargando(false)
      setError('No se pudo registrar el abono.')
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Registrar abono"
      descripcion="El abono se registra como ingreso en la caja."
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-4">
        {deuda ? (
          <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm">
            <div>
              <p className="font-semibold text-emerald-900">{deuda.cliente_nombre}</p>
              <p className="text-xs text-emerald-700">Deuda inicial {moneda(deuda.monto)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-emerald-700">Saldo pendiente</p>
              <p className="text-lg font-bold text-emerald-800 tabular-nums">{moneda(deuda.saldo)}</p>
            </div>
          </div>
        ) : null}
        <Campo etiqueta="Monto del abono" htmlFor="abono-monto">
          <Entrada
            id="abono-monto"
            inputMode="decimal"
            placeholder="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
            autoFocus
          />
        </Campo>
        <Campo etiqueta="Descripción" htmlFor="abono-desc" ayuda="Opcional. Se anota como referencia del pago.">
          <Entrada
            id="abono-desc"
            placeholder="p. ej. Abono en efectivo"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </Campo>
        {error ? <AlertaDeError mensaje={error} /> : null}
        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
          <Button variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" cargando={cargando}>
            Registrar abono
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Historial por cliente: sus deudas y todos los pagos realizados. */
function HistorialCliente({
  cliente,
  deudas,
  abierto,
  esAdmin,
  onCerrar,
  onNuevaDeuda,
}: {
  cliente: string | null
  deudas: Deuda[]
  abierto: boolean
  esAdmin: boolean
  onCerrar: () => void
  onNuevaDeuda: (cliente: string) => void
}) {
  const [pagos, setPagos] = useState<PagoDeuda[] | null>(null)

  useEffect(() => {
    if (!abierto || !cliente) return
    let activo = true
    setPagos(null)
    void new DeudaController()
      .obtenerTodosLosPagos()
      .then((todos) => {
        if (!activo) return
        const idsDeDeudas = new Set(deudas.map((d) => d.id))
        setPagos(todos.filter((p) => idsDeDeudas.has(p.deuda_id)))
      })
    return () => {
      activo = false
    }
    // El historial se recalcula cada vez que cambia el cliente abierto.
  }, [abierto, cliente, deudas])

  const pendiente = deudas.reduce((a, d) => a + d.saldo, 0)

  return (
    <Modal
      abierto={abierto}
      titulo="Historial del cliente"
      descripcion={cliente ? `Deudas y pagos realizados por ${cliente}.` : undefined}
      onCerrar={onCerrar}
      ancho="lg"
    >
      <div className="space-y-6">
        {cliente ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-500 text-base font-bold text-zinc-950">
              {cliente.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-zinc-900">{cliente}</p>
              <p className="text-xs text-zinc-500">
                {deudas.length} deuda{deudas.length === 1 ? '' : 's'} · pendiente:{' '}
                <b className="text-red-600 tabular-nums">{moneda(pendiente)}</b>
              </p>
            </div>
            {esAdmin ? (
            <Button
              className="ml-auto"
              tamanio="sm"
              icono={Plus}
              onClick={() => onNuevaDeuda(cliente)}
            >
              Nueva deuda
            </Button>
          ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
            Deudas
          </h3>
          {deudas.length === 0 ? (
            <p className="rounded-xl border border-zinc-100 px-4 py-3 text-sm text-zinc-500">
              Este cliente no tiene deudas registradas.
            </p>
          ) : (
            deudas.map((d) => {
              const saldada = estaSaldada(d)
              return (
                <div key={d.id} className="flex items-center gap-3 rounded-xl border border-zinc-100 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-800">{d.descripcion}</p>
                    <p className="text-xs text-zinc-500">{formatearFecha(d.fecha)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-800 tabular-nums">{moneda(d.monto)}</p>
                    <p className={cn('text-xs tabular-nums', saldada ? 'text-emerald-600' : 'text-red-600')}>
                      {saldada ? 'Pagada' : `${moneda(d.saldo)} pendiente`}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
            Pagos realizados
          </h3>
          {pagos === null ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Esqueleto key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : pagos.length === 0 ? (
            <p className="rounded-xl border border-zinc-100 px-4 py-3 text-sm text-zinc-500">
              Aún no se han registrado pagos.
            </p>
          ) : (
            <ul className="space-y-1">
              {pagos.map((pago) => (
                <li key={pago.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                    <Coins size={14} weight="bold" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-700">{pago.descripcion}</p>
                    <p className="text-xs text-zinc-500">{formatearFecha(pago.fecha)}</p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-700 tabular-nums">
                    + {moneda(pago.monto)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
          <Button variante="fantasma" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  )
}