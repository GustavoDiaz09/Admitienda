import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Coins,
  Eye,
  HandCoins,
  MagnifyingGlass,
  PencilSimple,
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
import { agruparPorDia, diaDeFechaActual } from '../lib/deudaHistorial'
import { Button } from '../components/ui/Button'
import { Campo, Entrada, AlertaDeError } from '../components/ui/Campo'
import { Insignia } from '../components/ui/Insignia'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Tabla, Celda, CeldaNumerica } from '../components/ui/Tabla'
import { ConfirmButton } from '../components/ui/ConfirmButton'
import { EncabezadoSeccion, Esqueleto, EstadoVacio } from '../components/ui/Base'
import { ErrorDeCarga } from '../components/ui/ErrorDeCarga'
import { cn } from '../lib/cn'

type FiltroDeuda = 'TODAS' | 'PENDIENTES' | 'SALDADAS'

const FILTROS: Record<FiltroDeuda, string> = {
  TODAS: 'Todas',
  PENDIENTES: 'Pendientes',
  SALDADAS: 'Saldadas',
}

/** Normaliza la fecha YYYY-MM-DD HH:MM a DD/MM/YYYY HH:MM para mostrar. */
function formatearFecha(texto: string): string {
  const [fecha, hora] = texto.split(' ')
  if (!fecha) return texto
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}${hora ? ` ${hora}` : ''}`
}

/** Nombre del día (lunes, martes…) para un "yyyy-MM-dd" dado. */
function nombreDiaDe(dia: string): string {
  const fecha = new Date(`${dia}T00:00:00`)
  const nombres = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  return nombres[fecha.getDay()]
}

/** Muestra "yyyy-MM-dd" como "DD/MM/YYYY · lunes". */
function formatearDia(dia: string): string {
  const [anio, mes, dd] = dia.split('-')
  return `${dd}/${mes}/${anio} · ${nombreDiaDe(dia)}`
}

/** Vista del CRM de deudas: ventas fiadas, abonos e historial por deudor. */
export function Deudas() {
  const esAdmin = useSesionStore((estado) => estado.usuarioActivo?.tipo_usuario) === TIPO_ADMIN
  const [deudas, setDeudas] = useState<Deuda[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroDeuda>('TODAS')
  const [modalNueva, setModalNueva] = useState(false)
  const [clientePrefill, setClientePrefill] = useState('')
  const [nombreFijo, setNombreFijo] = useState(false)
  const [abono, setAbono] = useState<Deuda | null>(null)
  const [elegirAbono, setElegirAbono] = useState<string | null>(null)
  const [editar, setEditar] = useState<Deuda | null>(null)
  const [historial, setHistorial] = useState<string | null>(null)
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setDeudas(await new DeudaController().obtenerDeudas())
      setErrorDeCarga(null)
    } catch {
      setErrorDeCarga('No se pudo cargar la información. Intente de nuevo.')
    }
  }, [])

  const eliminarDeuda = useCallback(
    async (deuda: Deuda) => {
      const resultado = await new DeudaController().eliminarDeuda(deuda.id)
      if (resultado.exito) {
        avisarExito(resultado.mensaje)
        await cargar()
      } else {
        avisarError(resultado.mensaje)
      }
    },
    [cargar],
  )

  useEffect(() => {
    void cargar()
    const alRecargar = () => void cargar()
    window.addEventListener('datos:sincronizados', alRecargar)
    return () => window.removeEventListener('datos:sincronizados', alRecargar)
  }, [cargar])

  const porDeudor = useMemo(() => {
    if (!deudas) return []
    const grupos = new Map<string, Deuda[]>()
    for (const deuda of deudas) {
      const clave = deuda.deudor_id || deuda.cliente_nombre
      const lista = grupos.get(clave) ?? []
      lista.push(deuda)
      grupos.set(clave, lista)
    }
    return Array.from(grupos.values())
      .map((lista) => {
        const primera = lista[0]
        return {
          id: primera?.deudor_id ?? '',
          nombre: primera?.cliente_nombre ?? '',
          deudas: lista,
          monto: lista.reduce((a, d) => a + d.monto, 0),
          saldo: lista.reduce((a, d) => a + d.saldo, 0),
          ultima: lista.reduce((max, d) => (d.fecha > max.fecha ? d : max), primera),
        }
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [deudas])

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return porDeudor.filter((g) => {
      if (filtro === 'PENDIENTES' && g.saldo <= 0) return false
      if (filtro === 'SALDADAS' && g.saldo > 0) return false
      if (!texto) return true
      return (
        g.nombre.toLowerCase().includes(texto) ||
        g.deudas.some((d) => d.descripcion.toLowerCase().includes(texto))
      )
    })
  }, [porDeudor, busqueda, filtro])

  const totales = useMemo(() => {
    const activas = deudas ?? []
    const monto = activas.reduce((a, d) => a + d.monto, 0)
    const saldo = activas.reduce((a, d) => a + d.saldo, 0)
    return { monto, abonado: monto - saldo, saldo, pendientes: porDeudor.filter((g) => g.saldo > 0).length }
  }, [deudas, porDeudor])

  const abrirNuevaDeuda = (cliente = '', fijo = false) => {
    setClientePrefill(cliente)
    setNombreFijo(fijo)
    setModalNueva(true)
  }

  return (
    <div className="animate-desvanecer space-y-5">
      <EncabezadoSeccion
        titulo="Deudas y pagos"
        descripcion="CRM de ventas fiadas: registre deudas, reciba abonos y consulte el historial por deudor."
        acciones={
          esAdmin ? (
            <Button icono={Plus} onClick={() => abrirNuevaDeuda()}>
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
              {porDeudor.length} deudor{porDeudor.length === 1 ? '' : 'es'} · {totales.pendientes} con deuda pendiente
            </span>
          ) : null}
        </div>

        {deudas === null && errorDeCarga ? (
          <ErrorDeCarga mensaje={errorDeCarga} alReintentar={() => void cargar()} />
        ) : deudas === null ? (
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
            accion={esAdmin ? <Button icono={Plus} onClick={() => abrirNuevaDeuda()}>Nueva deuda</Button> : undefined}
          />
        ) : (
          <Tabla
            encabezados={['Cliente', 'Deudas', 'Monto', 'Abonado', 'Saldo', 'Estado', '']}
            minimo="min-w-[900px]"
          >
            {filtradas.map((fila) => {
              const saldada = fila.saldo <= 0
              const activas = fila.deudas.filter((d) => d.saldo > 0).length
              return (
                <tr key={fila.id} className={saldada ? 'opacity-70 hover:bg-zinc-50/80' : 'hover:bg-zinc-50/80'}>
                  <Celda>
                    <button
                      type="button"
                      onClick={() => setHistorial(fila.nombre)}
                      className="flex w-full items-center gap-3 text-left"
                      aria-label={`Ver historial de ${fila.nombre}`}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-100 font-semibold text-emerald-700">
                        {fila.nombre.charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium text-zinc-900">{fila.nombre}</span>
                    </button>
                  </Celda>
                  <Celda>
                    <p className="font-medium text-zinc-800">
                      {fila.deudas.length} deuda{fila.deudas.length === 1 ? '' : 's'}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {activas > 0 ? `${activas} pendiente${activas === 1 ? '' : 's'}` : 'Todo pagado'}
                    </p>
                    <p className="text-xs text-zinc-400">última {formatearFecha(fila.ultima.fecha)}</p>
                  </Celda>
                  <CeldaNumerica>{moneda(fila.monto)}</CeldaNumerica>
                  <CeldaNumerica className="text-emerald-700">{moneda(fila.monto - fila.saldo)}</CeldaNumerica>
                  <CeldaNumerica className={cn('font-semibold', saldada ? 'text-zinc-400' : 'text-red-600')}>
                    {moneda(fila.saldo)}
                  </CeldaNumerica>
                  <Celda>
                    <Insignia tono={saldada ? 'esmeralda' : 'ambar'}>
                      {saldada ? 'Saldado' : 'Pendiente'}
                    </Insignia>
                  </Celda>
                  <Celda className="text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => setHistorial(fila.nombre)}
                        aria-label={`Ver historial de ${fila.nombre}`}
                        className="focus-ring rounded-full p-2 text-zinc-400 transition-colors hover:bg-sky-50 hover:text-sky-600"
                      >
                        <Eye size={16} weight="bold" />
                      </button>
                      {esAdmin ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const pendientes = fila.deudas.filter((d) => d.saldo > 0)
                              if (pendientes.length === 1) {
                                setAbono(pendientes[0])
                              } else if (pendientes.length > 1) {
                                setElegirAbono(fila.nombre)
                              }
                            }}
                            disabled={activas === 0}
                            aria-label={`Registrar abono de ${fila.nombre}`}
                            className="focus-ring rounded-full p-2 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Coins size={16} weight="bold" />
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirNuevaDeuda(fila.nombre, true)}
                            aria-label={`Agregar deuda de ${fila.nombre}`}
                            className="focus-ring rounded-full p-2 text-zinc-400 transition-colors hover:bg-sky-50 hover:text-sky-600"
                          >
                            <Plus size={16} weight="bold" />
                          </button>
                        </>
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
        clienteFijo={nombreFijo}
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

      <SeleccionarDeudaParaAbono
        cliente={elegirAbono}
        deudas={deudas?.filter((d) => d.cliente_nombre === elegirAbono && d.saldo > 0) ?? []}
        abierto={elegirAbono !== null}
        onCerrar={() => setElegirAbono(null)}
        onElegir={(deuda) => {
          setElegirAbono(null)
          setAbono(deuda)
        }}
      />

      <FormularioEditarDeuda
        deuda={editar}
        abierto={editar !== null}
        onCerrar={() => setEditar(null)}
        onGuardado={async () => {
          setEditar(null)
          await cargar()
        }}
      />

      <HistorialCliente
        cliente={historial}
        deudas={deudas?.filter((d) => d.cliente_nombre === historial) ?? []}
        abierto={historial !== null}
        esAdmin={esAdmin}
        onCerrar={() => setHistorial(null)}
        onNuevaDeuda={(cliente) => abrirNuevaDeuda(cliente, true)}
        onAbono={setAbono}
        onEditar={setEditar}
        onEliminar={eliminarDeuda}
      />
    </div>
  )
}

/** Formulario para registrar una deuda nueva (nombre, valor y descripción). */
function FormularioDeuda({
  abierto,
  clienteInicial,
  clienteFijo,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean
  clienteInicial: string
  /** Cuando es true, el nombre del deudor queda fijo (viene desde su historial). */
  clienteFijo: boolean
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
        {clienteFijo ? (
          <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm">
            <div>
              <p className="text-xs font-medium text-emerald-700">Deudor</p>
              <p className="text-base font-semibold text-emerald-900">{clienteInicial}</p>
            </div>
            <Insignia tono="esmeralda">Fijo</Insignia>
          </div>
        ) : (
          <Campo etiqueta="Nombre del deudor" htmlFor="deuda-cliente">
            <Entrada
              id="deuda-cliente"
              placeholder="p. ej. Juan Pérez"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              required
              autoFocus
            />
          </Campo>
        )}
        <Campo etiqueta="Valor de la deuda" htmlFor="deuda-monto">
          <Entrada
            id="deuda-monto"
            inputMode="decimal"
            placeholder="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
            autoFocus={clienteFijo}
          />
        </Campo>
        <Campo etiqueta="Descripción" htmlFor="deuda-desc">
          <Entrada
            id="deuda-desc"
            placeholder="p. ej. Fiado del lunes"
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

/** Selector de deuda pendiente cuando el deudor tiene varias por abonar. */
function SeleccionarDeudaParaAbono({
  cliente,
  deudas,
  abierto,
  onCerrar,
  onElegir,
}: {
  cliente: string | null
  deudas: Deuda[]
  abierto: boolean
  onCerrar: () => void
  onElegir: (deuda: Deuda) => void
}) {
  return (
    <Modal
      abierto={abierto}
      titulo="Registrar abono"
      descripcion={
        cliente ? `${cliente} tiene varias deudas pendientes. Elija cuál quiere abonar.` : undefined
      }
      onCerrar={onCerrar}
    >
      <ul className="space-y-2">
        {deudas.map((deuda) => (
          <li key={deuda.id}>
            <button
              type="button"
              onClick={() => onElegir(deuda)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-800">{deuda.descripcion}</p>
                <p className="text-xs text-zinc-500">{formatearFecha(deuda.fecha)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-red-600 tabular-nums">{moneda(deuda.saldo)}</p>
                <p className="text-xs text-zinc-500">pendiente</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
        <Button variante="fantasma" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
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

/** Formulario para editar valor y descripción de una deuda (nombre fijo). */
function FormularioEditarDeuda({
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
    if (abierto && deuda) {
      setMonto(String(deuda.monto))
      setDescripcion(deuda.descripcion)
      setError(null)
    }
  }, [abierto, deuda])

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    if (!deuda) return
    setError(null)
    setCargando(true)
    try {
      const resultado = await new DeudaController().editarDeuda(deuda.id, monto, descripcion)
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
      setError('No se pudo editar la deuda.')
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Editar deuda"
      descripcion="Corrige el valor o la descripción; el nombre del deudor queda fijo."
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-4">
        {deuda ? (
          <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm">
            <div>
              <p className="font-semibold text-emerald-900">{deuda.cliente_nombre}</p>
              <p className="text-xs text-emerald-700">Abonado {moneda(deuda.monto - deuda.saldo)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-emerald-700">Saldo pendiente</p>
              <p className="text-lg font-bold text-emerald-800 tabular-nums">{moneda(deuda.saldo)}</p>
            </div>
          </div>
        ) : null}
        <Campo etiqueta="Valor de la deuda" htmlFor="editar-monto">
          <Entrada
            id="editar-monto"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
            autoFocus
          />
        </Campo>
        <Campo etiqueta="Descripción" htmlFor="editar-desc">
          <Entrada
            id="editar-desc"
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
            Guardar cambios
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Historial por deudor: agrupado por día, con totales y saldo acumulado. */
function HistorialCliente({
  cliente,
  deudas,
  abierto,
  esAdmin,
  onCerrar,
  onNuevaDeuda,
  onAbono,
  onEditar,
  onEliminar,
}: {
  cliente: string | null
  deudas: Deuda[]
  abierto: boolean
  esAdmin: boolean
  onCerrar: () => void
  onNuevaDeuda: (cliente: string) => void
  onAbono: (deuda: Deuda) => void
  onEditar: (deuda: Deuda) => void
  onEliminar: (deuda: Deuda) => Promise<void>
}) {
  const [pagos, setPagos] = useState<PagoDeuda[] | null>(null)
  const [filtroDia, setFiltroDia] = useState<string | null>(null)
  const [diasReferencia, setDiasReferencia] = useState<{ hoy: string; ayer: string }>({ hoy: '', ayer: '' })
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!abierto || !cliente) return
    let activo = true
    setPagos(null)
    setErrorDeCarga(null)
    setFiltroDia(null)
    const fecha = new Date()
    setDiasReferencia({
      hoy: diaDeFechaActual(fecha),
      ayer: diaDeFechaActual(new Date(fecha.getTime() - 24 * 60 * 60 * 1000)),
    })
    void new DeudaController()
      .obtenerTodosLosPagos()
      .then((todos) => {
        if (!activo) return
        const idsDeDeudas = new Set(deudas.map((d) => d.id))
        setPagos(todos.filter((p) => idsDeDeudas.has(p.deuda_id)))
      })
      .catch(() => {
        if (!activo) return
        setErrorDeCarga('No se pudieron cargar los pagos de este deudor. Intente de nuevo.')
      })
    return () => {
      activo = false
    }
  }, [abierto, cliente, deudas, recarga])

  const dias = useMemo(() => agruparPorDia(deudas, pagos ?? []), [deudas, pagos])
  const pendiente = deudas.reduce((a, d) => a + d.saldo, 0)
  const hoy = diasReferencia.hoy
  const ayer = diasReferencia.ayer
  const diasVisibles = filtroDia ? dias.filter((g) => g.dia === filtroDia) : dias

  return (
    <Modal
      abierto={abierto}
      titulo="Historial del deudor"
      descripcion={cliente ? `Deudas y pagos de ${cliente}, día por día.` : undefined}
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

        {dias.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={filtroDia ?? ''}
              onChange={(e) => setFiltroDia(e.target.value || null)}
              aria-label="Filtrar por día"
              className="campo-base text-sm"
            />
            <button
              type="button"
              onClick={() => setFiltroDia(hoy)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filtroDia === hoy ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
              )}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setFiltroDia(ayer)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filtroDia === ayer ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
              )}
            >
              Ayer
            </button>
            {filtroDia ? (
              <button
                type="button"
                onClick={() => setFiltroDia(null)}
                className="text-xs font-medium text-sky-600 hover:underline"
              >
                Ver todo
              </button>
            ) : null}
          </div>
        ) : null}

        {pagos === null && errorDeCarga ? (
          <ErrorDeCarga mensaje={errorDeCarga} alReintentar={() => setRecarga((n) => n + 1)} />
        ) : pagos === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Esqueleto key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : diasVisibles.length === 0 ? (
          <p className="rounded-xl border border-zinc-100 px-4 py-3 text-sm text-zinc-500">
            {deudas.length === 0
              ? 'Este deudor no tiene movimientos registrados.'
              : 'No hubo movimientos ese día.'}
          </p>
        ) : (
          <div className="space-y-4">
            {diasVisibles.map((dia) => (
              <section key={dia.dia}>
                <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-sm font-semibold text-zinc-800">{formatearDia(dia.dia)}</h3>
                  <span className="text-xs text-zinc-500">
                    fiado <b className="text-zinc-700 tabular-nums">{moneda(dia.cargado)}</b> · pagado{' '}
                    <b className="text-emerald-700 tabular-nums">{moneda(dia.abonado)}</b>
                  </span>
                  <span
                    className={cn(
                      'ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                      dia.saldoAcumulado > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700',
                    )}
                    aria-label="Saldo acumulado al cierre del día"
                  >
                    {dia.saldoAcumulado > 0
                      ? `Quedó debiendo ${moneda(dia.saldoAcumulado)}`
                      : 'Todo pagado'}
                  </span>
                </div>
                <ul className="space-y-1">
                  {dia.eventos.map((evento) => {
                    const hora = evento.fecha.split(' ')[1] ?? ''
                    if (evento.tipo === 'PAGO') {
                      return (
                        <li key={evento.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                            <Coins size={14} weight="bold" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-zinc-700">Abono · {evento.descripcion}</p>
                            <p className="text-xs text-zinc-500">{hora}</p>
                          </div>
                          <span className="text-sm font-semibold text-emerald-700 tabular-nums">
                            + {moneda(evento.monto)}
                          </span>
                        </li>
                      )
                    }
                    const activa = evento.deudaSaldada === false
                    return (
                      <li key={evento.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-zinc-50">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-red-100 text-red-500">
                          <Receipt size={14} weight="bold" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-zinc-700">{evento.descripcion}</p>
                          <p className="text-xs text-zinc-500">
                            {hora} · {activa ? `debe ${moneda(deudas.find((d) => d.id === evento.id)?.saldo ?? 0)}` : 'saldada'}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-zinc-700 tabular-nums">
                          {moneda(evento.monto)}
                        </span>
                        {esAdmin ? (
                          <div className="inline-flex gap-0.5">
                            {activa ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const deuda = deudas.find((d) => d.id === evento.id)
                                  if (deuda) onAbono(deuda)
                                }}
                                aria-label="Registrar abono"
                                className="focus-ring rounded-full p-2 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                              >
                                <Coins size={15} weight="bold" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                const deuda = deudas.find((d) => d.id === evento.id)
                                if (deuda) onEditar(deuda)
                              }}
                              aria-label="Editar deuda"
                              className="focus-ring rounded-full p-2 text-zinc-400 transition-colors hover:bg-amber-50 hover:text-amber-600"
                            >
                              <PencilSimple size={15} weight="bold" />
                            </button>
                            <ConfirmButton
                              variante="secundario"
                              className="px-2"
                              accion={<Trash size={14} weight="bold" />}
                              titulo="Eliminar deuda"
                              mensaje={
                                <>
                                  ¿Desea eliminar la deuda <b>{evento.descripcion}</b> y sus pagos? Los
                                  ingresos ya registrados en caja no se modifican.
                                </>
                              }
                              confirmar={() => {
                                const deuda = deudas.find((d) => d.id === evento.id)
                                if (deuda) return onEliminar(deuda)
                              }}
                            />
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
          <Button variante="fantasma" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  )
}