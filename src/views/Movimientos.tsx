import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  MagnifyingGlass,
  Pencil,
  Plus,
  Receipt,
  Trash,
} from '@phosphor-icons/react'
import { MovimientoController } from '../controller/MovimientoController'
import { useSesionStore } from '../controller/SessionController'
import { esRolAdministrativo, TIPO_INGRESO, TIPO_EGRESO, type Movimiento } from '../model/types'
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
import { ErrorDeCarga } from '../components/ui/ErrorDeCarga'
import { cn } from '../lib/cn'

type FiltroMovimiento = 'TODOS' | 'INGRESO' | 'EGRESO'

/** Historial de ingresos y egresos (lectura para REGISTRADO; edición solo ADMIN). */
export function Movimientos() {
  const esAdmin = useSesionStore(
    (estado) => esRolAdministrativo(estado.usuarioActivo?.tipo_usuario),
  )
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null)
  const [totales, setTotales] = useState<{ ingresos: number; egresos: number } | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroMovimiento>('TODOS')
  const [edicion, setEdicion] = useState<Movimiento | null | 'nuevo'>(null)
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const controlador = new MovimientoController()
    try {
      const [historial, ingresos, egresos] = await Promise.all([
        controlador.obtenerHistorial(),
        controlador.totalIngresos(),
        controlador.totalEgresos(),
      ])
      setMovimientos(historial)
      setTotales({ ingresos, egresos })
      setErrorDeCarga(null)
    } catch {
      setErrorDeCarga('No se pudo cargar la información. Intente de nuevo.')
    }
  }, [])

  useEffect(() => {
    void cargar()
    const alRecargar = () => void cargar()
    window.addEventListener('datos:sincronizados', alRecargar)
    return () => window.removeEventListener('datos:sincronizados', alRecargar)
  }, [cargar])

  const filtrados = useMemo(() => {
    if (!movimientos) return []
    const texto = busqueda.trim().toLowerCase()
    return movimientos.filter((m) => {
      if (filtro !== 'TODOS' && m.tipo_movimiento !== filtro) return false
      if (!texto) return true
      return m.descripcion.toLowerCase().includes(texto)
    })
  }, [movimientos, busqueda, filtro])

  const saldo = totales ? totales.ingresos - totales.egresos : 0

  return (
    <div className="animate-desvanecer space-y-5">
      <EncabezadoSeccion
        titulo="Ingresos y egresos"
        descripcion="Historial financiero de la tienda con totales automáticos."
        acciones={
          esAdmin ? (
            <Button icono={Plus} onClick={() => setEdicion('nuevo')}>
              Nuevo movimiento
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
              placeholder="Buscar por descripción…"
              aria-label="Buscar movimientos"
              className="campo-base pl-9"
            />
          </div>
          <div className="inline-flex rounded-full border border-zinc-300 bg-white p-0.5 text-sm">
            {opcionesDeFiltro().map((opcion) => (
              <button
                key={opcion.valor}
                type="button"
                onClick={() => setFiltro(opcion.valor)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  filtro === opcion.valor
                    ? 'bg-emerald-600 text-white'
                    : 'text-zinc-600 hover:bg-zinc-100',
                )}
              >
                {opcion.etiqueta}
              </button>
            ))}
          </div>
          {totales ? (
            <span className="ml-auto hidden text-xs font-medium text-zinc-500 sm:inline">
              {movimientos?.length ?? 0} movimientos
            </span>
          ) : null}
        </div>

        {movimientos === null && errorDeCarga ? (
          <ErrorDeCarga mensaje={errorDeCarga} alReintentar={() => void cargar()} />
        ) : movimientos === null ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Esqueleto key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <EstadoVacio
            icono={<Receipt size={24} weight="duotone" />}
            titulo={movimientos.length === 0 ? 'Sin movimientos registrados' : 'Sin resultados'}
            descripcion={
              movimientos.length === 0
                ? esAdmin
                  ? 'Registre su primer ingreso o egreso con el botón "Nuevo movimiento".'
                  : 'Aún no se han registrado ingresos o egresos en la tienda.'
                : 'No hay movimientos que coincidan con la búsqueda.'
            }
            accion={
              esAdmin ? (
                <Button icono={Plus} onClick={() => setEdicion('nuevo')}>
                  Nuevo movimiento
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Tabla encabezados={['Tipo', 'Monto', 'Descripción', 'Fecha', ...(esAdmin ? [''] : [])]}>
            {filtrados.map((m) => {
              const esIngreso = m.tipo_movimiento === TIPO_INGRESO
              return (
                <tr key={m.id} className="hover:bg-zinc-50/80">
                  <Celda>
                    <Insignia tono={esIngreso ? 'esmeralda' : 'rojo'}>
                      {esIngreso ? (
                        <ArrowDownRight size={12} weight="bold" />
                      ) : (
                        <ArrowUpRight size={12} weight="bold" />
                      )}
                      {esIngreso ? 'Ingreso' : 'Egreso'}
                    </Insignia>
                  </Celda>
                  <CeldaNumerica
                    className={cn(
                      'font-semibold',
                      esIngreso ? 'text-emerald-700' : 'text-red-600',
                    )}
                  >
                    {esIngreso ? '+' : '-'} {moneda(m.monto)}
                  </CeldaNumerica>
                  <Celda className="max-w-md truncate">{m.descripcion}</Celda>
                  <Celda className="text-zinc-500">{formatearFecha(m.fecha)}</Celda>
                  {esAdmin ? (
                    <Celda className="text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => setEdicion(m)}
                          aria-label="Modificar movimiento"
                          className="focus-ring rounded-full p-2 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                        >
                          <Pencil size={16} weight="bold" />
                        </button>
                        <ConfirmButton
                          accion={<Trash size={14} weight="bold" />}
                          titulo="Eliminar movimiento"
                          mensaje="¿Desea eliminar este movimiento? La acción se propagará al sincronizar."
                          confirmar={async () => {
                            const resultado = await new MovimientoController().eliminarMovimiento(m.id)
                            if (resultado.exito) {
                              avisarExito(resultado.mensaje)
                              await cargar()
                            } else {
                              avisarError(resultado.mensaje)
                            }
                          }}
                        />
                      </div>
                    </Celda>
                  ) : null}
                </tr>
              )
            })}
          </Tabla>
        )}

        {totales ? (
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-100 px-4 py-3 text-sm">
            <span className="flex items-center gap-1.5 font-medium text-zinc-500">
              <ArrowDownRight size={15} weight="bold" className="text-emerald-500" />
              Ingresos
              <b className="text-emerald-700 tabular-nums">{moneda(totales.ingresos)}</b>
            </span>
            <span className="flex items-center gap-1.5 font-medium text-zinc-500">
              <ArrowUpRight size={15} weight="bold" className="text-red-400" />
              Egresos
              <b className="text-red-600 tabular-nums">{moneda(totales.egresos)}</b>
            </span>
            <span className="flex items-center gap-1.5 font-medium text-zinc-500">
              Saldo
              <b className={cn('tabular-nums', saldo >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                {moneda(saldo)}
              </b>
            </span>
          </div>
        ) : null}
      </Card>

      <FormularioMovimiento
        movimiento={edicion === 'nuevo' ? null : edicion}
        abierto={edicion !== null}
        onCerrar={() => setEdicion(null)}
        onGuardado={async () => {
          setEdicion(null)
          await cargar()
        }}
      />
    </div>
  )
}

const FILTRO_ETIQUETAS: Record<FiltroMovimiento, string> = {
  TODOS: 'Todos',
  INGRESO: 'Ingresos',
  EGRESO: 'Egresos',
}

interface FilterOption {
  valor: FiltroMovimiento
  etiqueta: string
}

/** Helper mínimo para no tipar el arreglo inline dos veces. */
function opcionesDeFiltro(): FilterOption[] {
  return Object.entries(FILTRO_ETIQUETAS).map(([valor, etiqueta]) => ({
    valor: valor as FiltroMovimiento,
    etiqueta,
  }))
}

/** Normaliza la fecha YYYY-MM-DD HH:MM a DD/MM/YYYY HH:MM para mostrar. */
function formatearFecha(texto: string): string {
  const [fecha, hora] = texto.split(' ')
  if (!fecha) return texto
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}${hora ? ` ${hora}` : ''}`
}

function FormularioMovimiento({
  movimiento,
  abierto,
  onCerrar,
  onGuardado,
}: {
  movimiento: Movimiento | null
  abierto: boolean
  onCerrar: () => void
  onGuardado: () => Promise<void>
}) {
  const esEdicion = movimiento !== null
  const [tipo, setTipo] = useState<string>(movimiento?.tipo_movimiento ?? TIPO_INGRESO)
  const [monto, setMonto] = useState(movimiento ? String(movimiento.monto) : '')
  const [descripcion, setDescripcion] = useState(movimiento?.descripcion ?? '')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    setError(null)
    setCargando(true)
    try {
      const controlador = new MovimientoController()
      const resultado = esEdicion
        ? await controlador.modificarMovimiento(movimiento as Movimiento, tipo, monto, descripcion)
        : await controlador.nuevoMovimiento(tipo, monto, descripcion)
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
      setError('No se pudo guardar el movimiento.')
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo={esEdicion ? 'Modificar movimiento' : 'Registrar movimiento'}
      descripcion="Registre un ingreso o egreso de la tienda."
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Tipo de movimiento" htmlFor="mov-tipo">
          <div className="inline-flex w-full rounded-full border border-zinc-300 bg-white p-0.5">
            {([TIPO_INGRESO, TIPO_EGRESO] as const).map((opcion) => (
              <button
                key={opcion}
                id="mov-tipo"
                type="button"
                onClick={() => setTipo(opcion)}
                className={cn(
                  'flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  tipo === opcion
                    ? opcion === TIPO_INGRESO
                      ? 'bg-emerald-600 text-white'
                      : 'bg-red-600 text-white'
                    : 'text-zinc-600 hover:bg-zinc-100',
                )}
              >
                {opcion === TIPO_INGRESO ? 'Ingreso' : 'Egreso'}
              </button>
            ))}
          </div>
        </Campo>
        <Campo etiqueta="Monto" htmlFor="mov-monto">
          <Entrada
            id="mov-monto"
            inputMode="decimal"
            placeholder="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
            autoFocus
          />
        </Campo>
        <Campo etiqueta="Descripción" htmlFor="mov-desc">
          <Entrada
            id="mov-desc"
            placeholder="p. ej. Ventas del día"
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
            {esEdicion ? 'Guardar cambios' : 'Registrar movimiento'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}